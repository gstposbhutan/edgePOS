"use client";

import { useCallback } from "react";
import { getPB } from "@/lib/pb-client";
import { generateOrderNo, generateOrderSignature } from "@/lib/gst";
import { todayCompact } from "@/lib/date-utils";
import { MOVEMENT_TYPE, KHATA_TXN, PB_REQ, PAYMENT_METHOD } from "@/lib/constants";
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
      ref: string,
      tendered?: number,
      onSuccess?: (orderPayload: Record<string, unknown>, orderId: string) => void
    ) => {
      const { pb, user, items, products, subtotal, gstTotal, grandTotal, taxExempt, grandTotalExempt, settings, selectedCustomer, clearCart, refreshProducts, clearUndoStack } = input;

      if (!user) return;

      try {
        const today = todayCompact();
        const count = await pb.collection("orders").getList(1, 1, {
          filter: `order_no ~ "POS-${today}-"`,
          sort: "-created_at",
          requestKey: null,
        });
        const orderNo = generateOrderNo(today, (count.totalItems || 0) + 1);

        const digitalSignature = await generateOrderSignature(
          orderNo,
          taxExempt ? grandTotalExempt : grandTotal,
          settings?.tpn_gstin || "",
          new Date().toISOString()
        );

        const effectiveGstTotal = taxExempt ? 0 : gstTotal;
        const effectiveGrandTotal = taxExempt ? grandTotalExempt : grandTotal;

        const orderPayload: Record<string, unknown> = {
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
            total: i.total,
          })),
          subtotal,
          gst_total: effectiveGstTotal,
          grand_total: effectiveGrandTotal,
          payment_method: method,
          payment_ref: ref || "",
          customer_name: selectedCustomer?.debtor_name || "",
          customer_phone: selectedCustomer?.debtor_phone || "",
          created_by: user.id,
          digital_signature: digitalSignature,
        };

        const result = await pb.collection("orders").create(orderPayload, PB_REQ);

        for (const item of items) {
          const product = products.find((p) => p.id === item.product);
          if (!product) continue;
          const newStock = product.current_stock - item.quantity;
          await pb.collection("products").update(product.id, { current_stock: newStock }, PB_REQ);
          await pb.collection("inventory_movements").create({
            product: product.id,
            movement_type: MOVEMENT_TYPE.SALE,
            quantity: -item.quantity,
            reference_id: result.id,
            notes: `Sale: ${orderNo}`,
          }, PB_REQ);
        }

        if (method === PAYMENT_METHOD.CREDIT && selectedCustomer) {
          const newBalance = selectedCustomer.outstanding_balance + effectiveGrandTotal;
          await pb.collection("khata_accounts").update(selectedCustomer.id, { outstanding_balance: newBalance }, PB_REQ);
          await pb.collection("khata_transactions").create({
            khata_account: selectedCustomer.id,
            transaction_type: KHATA_TXN.DEBIT,
            amount: effectiveGrandTotal,
            reference_id: result.id,
            notes: `Purchase on credit — ${orderNo}`,
          }, PB_REQ);
        }

        await clearCart();
        await refreshProducts();
        clearUndoStack();

        onSuccess?.({ ...orderPayload, id: result.id, created_at: result.created_at }, result.id);
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
