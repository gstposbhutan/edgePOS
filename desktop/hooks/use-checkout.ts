"use client";

import { useCallback } from "react";
import { getPB, getTerminalId } from "@/lib/pb-client";
import { getRegisterId } from "@/lib/register";
import { generateOrderNo, generateOrderSignature } from "@/lib/gst";
import { todayCompact } from "@/lib/date-utils";
import { MOVEMENT_TYPE, KHATA_TXN, KHATA_STATUS, PB_REQ, PAYMENT_METHOD } from "@/lib/constants";
import { toast } from "sonner";
import type { CartItem } from "./use-cart";
import type { Product } from "./use-products";
import type { Customer } from "./use-customers";
import type { Settings } from "./use-settings";

interface CheckoutInput {
  pb: ReturnType<typeof getPB>;
  user: { id: string } | null;
  items: CartItem[];
  products: Product[];
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  taxExempt: boolean;
  grandTotalExempt: number;
  settings: Settings | null;
  selectedCustomer: Customer | null;
  clearCart: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  clearUndoStack: () => void;
}

/** Generate a PocketBase-compatible record id (15 lowercase alphanumeric chars). */
function genPbId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint32Array(15);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < 15; i++) id += chars[bytes[i] % chars.length];
  return id;
}

export function useCheckout(input: CheckoutInput) {
  const validateStock = useCallback(
    (): boolean => {
      if (input.items.length === 0) return false;
      for (const item of input.items) {
        const product = input.products.find((p) => p.id === item.product);
        if (!product) continue;
        if (product.current_stock < item.quantity) {
          toast.error(`Insufficient stock for ${item.name}. Available: ${product.current_stock}`);
          return false;
        }
      }
      return true;
    },
    [input.items, input.products]
  );

  const confirmPayment = useCallback(
    async (
      method: string,
      channel: string | null,
      ref: string,
      tendered?: number,
      onSuccess?: (orderPayload: Record<string, unknown>, orderId: string) => void
    ) => {
      const { pb, user, items, products, subtotal, gstTotal, grandTotal, taxExempt, grandTotalExempt, settings, selectedCustomer, clearCart, refreshProducts, clearUndoStack } = input;

      if (!user) return;

      // P0-1: enforce credit limit BEFORE creating a credit sale. This is an
      // app-layer guard with a fresh balance read to reduce staleness; a
      // PocketBase hook is still required for a fully atomic, concurrent-safe
      // limit (see web/docs/desktop-web-parity-fix-plan.md P0-1). A limit of
      // <= 0 means "no limit configured" (unlimited) — matches the UI, which
      // renders an unset limit as "—".
      if (method === PAYMENT_METHOD.CREDIT) {
        if (!selectedCustomer) {
          toast.error("Select a customer for credit (khata) sales");
          return;
        }
        const saleTotal = taxExempt ? grandTotalExempt : grandTotal;
        const fresh = await pb
          .collection("khata_accounts")
          .getOne(selectedCustomer.id, PB_REQ)
          .catch(() => null);
        const balance = fresh
          ? ((fresh as Record<string, unknown>).outstanding_balance as number) || 0
          : selectedCustomer.outstanding_balance;
        const limit = fresh
          ? ((fresh as Record<string, unknown>).credit_limit as number) || 0
          : selectedCustomer.credit_limit;
        const status = fresh
          ? ((fresh as Record<string, unknown>).status as string) || ""
          : selectedCustomer.status || "";
        if (status === KHATA_STATUS.FROZEN) {
          toast.error(`${selectedCustomer.debtor_name}'s khata account is frozen — credit sale blocked`);
          return;
        }
        if (limit > 0 && balance + saleTotal > limit) {
          const available = Math.max(0, limit - balance);
          toast.error(
            `Credit limit exceeded — limit Nu. ${limit.toFixed(2)}, outstanding Nu. ${balance.toFixed(2)}, available Nu. ${available.toFixed(2)}`
          );
          return;
        }
      }

      try {
        const today = todayCompact();
        const terminalId = getTerminalId();
        const count = await pb.collection("orders").getList(1, 1, {
          filter: `order_no ~ "POS-${terminalId}-${today}-"`,
          sort: "-created_at",
          requestKey: null,
        });
        const orderNo = generateOrderNo(terminalId, today, (count.totalItems || 0) + 1);

        const digitalSignature = await generateOrderSignature(
          orderNo,
          taxExempt ? grandTotalExempt : grandTotal,
          settings?.tpn_gstin || ""
        );

        const effectiveGstTotal = taxExempt ? 0 : gstTotal;
        const effectiveGrandTotal = taxExempt ? grandTotalExempt : grandTotal;

        const orderId = genPbId();
        const registerId = await getRegisterId(); // which terminal rang this sale
        const orderPayload: Record<string, unknown> = {
          id: orderId,
          order_type: "POS_SALE",
          order_no: orderNo,
          status: "CONFIRMED",
          items: items.map((i) => ({
            id: i.id,
            product: i.product,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            gst_5: taxExempt ? 0 : i.gst_5,
            total: taxExempt ? parseFloat((i.total - i.gst_5).toFixed(2)) : i.total,
          })),
          subtotal,
          gst_total: effectiveGstTotal,
          grand_total: effectiveGrandTotal,
          payment_method: method,
          payment_channel: channel || "",
          payment_ref: ref || "",
          customer_name: selectedCustomer?.debtor_name || "",
          customer_phone: selectedCustomer?.debtor_phone || "",
          created_by: user.id,
          register_id: registerId || "",
          digital_signature: digitalSignature,
        };

        // P0-5: write the order, stock decrements, movements, and any khata debit
        // in ONE PocketBase batch (a single server-side transaction) so a
        // mid-checkout failure can never leave a partial order / wrong stock /
        // orphaned credit. The order id is generated up front so the movements and
        // khata debit can reference it within the same transaction. Stock and
        // balance use relative (+/-) field modifiers — atomic at the DB and immune
        // to stale in-memory reads. Requires the PocketBase Batch API to be enabled
        // (setup-pb.js does this); if it is disabled the whole batch is rejected,
        // so there is still never a partial write.
        const batch = pb.createBatch();
        batch.collection("orders").create(orderPayload);
        for (const item of items) {
          const product = products.find((p) => p.id === item.product);
          if (!product) continue;
          batch.collection("products").update(product.id, { "current_stock-": item.quantity });
          batch.collection("inventory_movements").create({
            product: product.id,
            movement_type: MOVEMENT_TYPE.SALE,
            quantity: -item.quantity,
            reference_id: orderId,
            register_id: registerId || "",
            notes: `Sale: ${orderNo}`,
          });
        }
        if (method === PAYMENT_METHOD.CREDIT && selectedCustomer) {
          batch.collection("khata_accounts").update(selectedCustomer.id, { "outstanding_balance+": effectiveGrandTotal });
          batch.collection("khata_transactions").create({
            khata_account: selectedCustomer.id,
            transaction_type: KHATA_TXN.DEBIT,
            amount: effectiveGrandTotal,
            reference_id: orderId,
            notes: `Purchase on credit — ${orderNo}`,
          });
        }

        const results = await batch.send();
        const createdOrder = (results?.[0]?.body ?? {}) as Record<string, unknown>;
        const createdAt =
          (createdOrder.created_at as string) || (createdOrder.created as string) || new Date().toISOString();

        await clearCart();
        await refreshProducts();
        clearUndoStack();

        onSuccess?.({ ...orderPayload, id: orderId, created_at: createdAt }, orderId);
        toast.success(`Order ${orderNo} confirmed`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Checkout failed";
        console.error("Checkout error:", err);
        toast.error(msg);
      }
    },
    [input]
  );

  return { validateStock, confirmPayment };
}
