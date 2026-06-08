"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { ORDER_STATUS, MOVEMENT_TYPE, KHATA_TXN, PAYMENT_METHOD } from "@/lib/constants";
import { getRegisterId } from "@/lib/register";

export interface Order {
  id: string;
  order_no: string;
  status: string;
  items: any[];
  subtotal: number;
  gst_total: number;
  grand_total: number;
  payment_method: string;
  payment_channel?: string;
  payment_ref: string;
  buyer_id: string;
  customer_name: string;
  customer_phone: string;
  created_by: string;
  digital_signature: string;
  created_at: string;
  refund_amount?: number;
  refund_reason?: string;
  cancellation_reason?: string;
  expand?: { buyer_id?: any; created_by?: any };
}

/**
 * Resolve the khata account tied to an order. Prefers the original DEBIT
 * transaction keyed by the order id (robust, mirrors the web app's trigger),
 * and falls back to a legacy customer-name match for orders created before
 * reference linking existed.
 */
async function getKhataAccountIdForOrder(
  pb: ReturnType<typeof getPB>,
  order: Pick<Order, "id" | "customer_name">
): Promise<string | null> {
  const txns = await pb
    .collection("khata_transactions")
    .getFullList<{ khata_account: string }>({
      filter: `reference_id = "${order.id}" && transaction_type = "${KHATA_TXN.DEBIT}"`,
      requestKey: null,
    })
    .catch(() => [] as { khata_account: string }[]);
  if (txns.length > 0 && txns[0].khata_account) return txns[0].khata_account;

  if (order.customer_name) {
    const accounts = await pb
      .collection("khata_accounts")
      .getFullList<{ id: string }>({
        filter: `debtor_name = "${order.customer_name}"`,
        requestKey: null,
      })
      .catch(() => [] as { id: string }[]);
    if (accounts.length > 0) return accounts[0].id;
  }
  return null;
}

/** Restore stock and write RETURN movements for the given (product, qty) pairs. */
async function restoreStock(
  pb: ReturnType<typeof getPB>,
  lines: { product: string; qty: number }[],
  orderId: string,
  orderNo: string,
  note: string
) {
  const registerId = await getRegisterId();
  for (const line of lines) {
    if (!line.product || line.qty <= 0) continue;
    const product = await pb.collection("products").getOne(line.product, PB_REQ).catch(() => null);
    if (product) {
      const restoredStock = (product.current_stock || 0) + line.qty;
      await pb.collection("products").update(line.product, { current_stock: restoredStock }, PB_REQ);
    }
    await pb.collection("inventory_movements").create({
      product: line.product,
      movement_type: MOVEMENT_TYPE.RETURN,
      quantity: line.qty,
      reference_id: orderId,
      register_id: registerId || "",
      notes: `${note} — order ${orderNo}`,
    }, PB_REQ);
  }
}

/** Reverse a credit (khata) balance by `amount` for a credit-paid order. */
async function reverseKhataCredit(
  pb: ReturnType<typeof getPB>,
  order: Pick<Order, "id" | "order_no" | "payment_method" | "customer_name">,
  amount: number
) {
  if (order.payment_method !== PAYMENT_METHOD.CREDIT || amount <= 0) return;
  const accountId = await getKhataAccountIdForOrder(pb, order);
  if (!accountId) return;
  const acct = await pb
    .collection("khata_accounts")
    .getOne<{ outstanding_balance: number }>(accountId, PB_REQ)
    .catch(() => null);
  if (!acct) return;
  const newBalance = Math.max(0, (acct.outstanding_balance || 0) - amount);
  await pb.collection("khata_accounts").update(accountId, { outstanding_balance: newBalance }, PB_REQ);
  await pb.collection("khata_transactions").create({
    khata_account: accountId,
    transaction_type: KHATA_TXN.CREDIT,
    amount,
    reference_id: order.id,
    notes: `Reversal — order ${order.order_no}`,
  }, PB_REQ);
}

async function fetchOrders(filter: string): Promise<Order[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  let filterStr = "";
  if (filter === "today") {
    const today = new Date().toISOString().split("T")[0];
    filterStr = `created_at >= "${today} 00:00:00"`;
  } else if (filter === "confirmed") {
    filterStr = 'status = "CONFIRMED"';
  } else if (filter === "cancelled") {
    filterStr = 'status = "CANCELLED"';
  } else if (filter === "refunded") {
    filterStr = 'status = "REFUNDED"';
  }
  return pb.collection("orders").getFullList<Order>({
    sort: "-created_at",
    filter: filterStr || undefined,
    expand: "buyer_id,created_by",
    requestKey: null,
  });
}

export function useOrders() {
  const pb = getPB();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => fetchOrders(filter),
    staleTime: 30 * 1000,
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: Partial<Order>) => {
      return pb.collection("orders").create(data, PB_REQ) as unknown as Order;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const createOrder = useCallback(
    async (data: Partial<Order>) => {
      try {
        const order = await createOrderMutation.mutateAsync(data);
        return { success: true, order };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [createOrderMutation]
  );

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      // P0-2: re-read status and refuse to cancel anything not currently
      // CONFIRMED, so stock/credit are restored exactly once (idempotent).
      const order = await pb.collection("orders").getOne<Order>(orderId, PB_REQ);
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        throw new Error(`Order is already ${String(order.status).toLowerCase()} — cannot cancel`);
      }
      const items = order.items || [];
      await restoreStock(
        pb,
        items.map((i) => ({ product: i.product, qty: i.quantity || 0 })),
        orderId,
        order.order_no,
        "Cancellation"
      );
      await reverseKhataCredit(pb, order, order.grand_total || 0);
      return pb.collection("orders").update(orderId, { status: ORDER_STATUS.CANCELLED, cancellation_reason: reason }, PB_REQ);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const cancelOrder = useCallback(
    async (orderId: string, reason: string) => {
      try {
        await cancelOrderMutation.mutateAsync({ orderId, reason });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [cancelOrderMutation]
  );

  const refundOrderMutation = useMutation({
    mutationFn: async ({ orderId, refundItems, reason }: { orderId: string; refundItems: { itemId: string; qty: number }[]; reason: string }) => {
      // P0-2: only a CONFIRMED order can be refunded, so a double-submit can't
      // restore stock / reverse credit twice. (A partial refund still marks the
      // whole order REFUNDED — multi-pass partial refunds need a dedicated
      // PARTIALLY_REFUNDED status, tracked as a follow-up in the parity plan.)
      const order = await pb.collection("orders").getOne<Order>(orderId, PB_REQ);
      if (order.status !== ORDER_STATUS.CONFIRMED) {
        throw new Error(`Order is already ${String(order.status).toLowerCase()} — cannot refund again`);
      }
      const items = order.items || [];

      // Full refund
      if (!refundItems || refundItems.length === 0) {
        await restoreStock(
          pb,
          items.map((i) => ({ product: i.product, qty: i.quantity || 0 })),
          orderId,
          order.order_no,
          "Full refund"
        );
        await reverseKhataCredit(pb, order, order.grand_total || 0);
        return pb.collection("orders").update(orderId, { status: ORDER_STATUS.REFUNDED, refund_amount: order.grand_total || 0, refund_reason: reason }, PB_REQ);
      }

      // Partial refund — clamp qty to the line, sum the proportional amount,
      // restore stock, then reverse the same amount off any credit balance.
      let refundAmount = 0;
      const restoreLines: { product: string; qty: number }[] = [];
      for (const ri of refundItems) {
        const item = items.find((i) => i.id === ri.itemId);
        if (!item || !item.quantity) continue;
        const qty = Math.min(Math.max(0, ri.qty), item.quantity);
        if (qty <= 0) continue;
        refundAmount += (item.total || 0) * (qty / item.quantity);
        if (item.product) restoreLines.push({ product: item.product, qty });
      }
      refundAmount = parseFloat(refundAmount.toFixed(2));
      await restoreStock(pb, restoreLines, orderId, order.order_no, "Partial refund");
      await reverseKhataCredit(pb, order, refundAmount);
      return pb.collection("orders").update(orderId, { status: ORDER_STATUS.REFUNDED, refund_amount: refundAmount, refund_reason: reason }, PB_REQ);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const refundOrder = useCallback(
    async (orderId: string, refundItems: { itemId: string; qty: number }[], reason: string) => {
      try {
        await refundOrderMutation.mutateAsync({ orderId, refundItems, reason });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [refundOrderMutation]
  );

  return {
    orders,
    loading: isLoading,
    filter,
    setFilter,
    createOrder,
    cancelOrder,
    refundOrder,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  };
}
