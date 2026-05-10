"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { ORDER_STATUS, MOVEMENT_TYPE, KHATA_TXN } from "@/lib/constants";

export interface Order {
  id: string;
  order_no: string;
  status: string;
  items: any[];
  subtotal: number;
  gst_total: number;
  grand_total: number;
  payment_method: string;
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

async function restoreStockAndReverseCredit(pb: ReturnType<typeof getPB>, orderId: string) {
  const order = await pb.collection("orders").getOne(orderId, PB_REQ);
  const items: any[] = order.items || [];

  for (const item of items) {
    if (!item.product) continue;
    const product = await pb.collection("products").getOne(item.product, PB_REQ).catch(() => null);
    if (product) {
      const restoredStock = (product.current_stock || 0) + (item.quantity || 0);
      await pb.collection("products").update(item.product, { current_stock: restoredStock }, PB_REQ);
    }
    await pb.collection("inventory_movements").create({
      product: item.product,
      movement_type: MOVEMENT_TYPE.RETURN,
      quantity: item.quantity || 0,
      reference_id: orderId,
      notes: `Return — order ${order.order_no}`,
    }, PB_REQ);
  }

  if (order.payment_method === "credit" && order.customer_name) {
    const accounts = await pb.collection("khata_accounts").getFullList({
      filter: `debtor_name = "${order.customer_name}"`,
      limit: 1,
      requestKey: null,
    });
    if (accounts.length > 0) {
      const acct = accounts[0] as any;
      const newBalance = Math.max(0, (acct.outstanding_balance || 0) - (order.grand_total || 0));
      await pb.collection("khata_accounts").update(acct.id, { outstanding_balance: newBalance }, PB_REQ);
      await pb.collection("khata_transactions").create({
        khata_account: acct.id,
        transaction_type: KHATA_TXN.CREDIT,
        amount: order.grand_total || 0,
        reference_id: orderId,
        notes: `Reversal — order ${order.order_no}`,
      }, PB_REQ);
    }
  }
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
      await restoreStockAndReverseCredit(pb, orderId);
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
      const order = await pb.collection("orders").getOne(orderId, PB_REQ);
      const items: any[] = order.items || [];

      if (!refundItems || refundItems.length === 0) {
        await restoreStockAndReverseCredit(pb, orderId);
        return pb.collection("orders").update(orderId, { status: ORDER_STATUS.REFUNDED, refund_amount: order.grand_total || 0, refund_reason: reason }, PB_REQ);
      }

      let refundAmount = 0;
      for (const ri of refundItems) {
        const item = items.find((i: any) => i.id === ri.itemId);
        if (item) {
          const ratio = ri.qty / item.quantity;
          refundAmount += item.total * ratio;
          if (item.product && ri.qty > 0) {
            const product = await pb.collection("products").getOne(item.product, PB_REQ).catch(() => null);
            if (product) {
              const restoredStock = (product.current_stock || 0) + ri.qty;
              await pb.collection("products").update(item.product, { current_stock: restoredStock }, PB_REQ);
            }
            await pb.collection("inventory_movements").create({
              product: item.product, movement_type: MOVEMENT_TYPE.RETURN, quantity: ri.qty,
              reference_id: orderId, notes: `Partial refund — ${order.order_no}`,
            }, PB_REQ);
          }
        }
      }
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
