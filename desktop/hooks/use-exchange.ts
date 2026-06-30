"use client";

import { getPB } from "@/lib/pb-client";
import { MOVEMENT_TYPE } from "@/lib/constants";
import { toast } from "sonner";

export interface ExchangeItem {
  id: string;
  product: string;
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  gst_5: number;
  total: number;
}

export interface ExchangeOrder {
  id: string;
  order_no: string;
  customer_name?: string;
  customer_phone?: string;
  grand_total?: number;
  items?: ExchangeItem[];
}

/** Search local orders for the exchange flow (same `~` contains idiom). */
export async function findOrderForExchange(term: string): Promise<ExchangeOrder[]> {
  const pb = getPB();
  const safe = term.replace(/['"\\]/g, "");
  const filter = `(order_no ~ "${safe}" || customer_name ~ "${safe}" || customer_phone ~ "${safe}")`;
  const list = await pb.collection("orders").getList<ExchangeOrder>(1, 20, {
    filter,
    sort: "-created_at",
    requestKey: null,
  });
  return list.items || [];
}

/**
 * Submit a return/exchange for a past order: writes a `refunds` row per returned
 * line, restores stock (+current_stock), records an inventory RETURN movement,
 * and marks the order REFUNDED — all in one PocketBase batch (atomic). v1: the
 * replacement items are rung as a separate normal sale (no netting), matching
 * the web. Credit-sale khata reversal is intentionally omitted in v1.
 */
export async function submitExchange(
  order: ExchangeOrder,
  returns: { item: ExchangeItem; qty: number }[]
): Promise<{ success: boolean; error?: string }> {
  if (returns.length === 0) return { success: false, error: "Select at least one item to return" };
  const pb = getPB();
  try {
    const batch = pb.createBatch();
    let refundTotal = 0;
    let units = 0;
    for (const { item, qty } of returns) {
      const ratio = qty / item.quantity;
      const amount = parseFloat((item.total * ratio).toFixed(2));
      const gst = parseFloat((item.gst_5 * ratio).toFixed(2));
      refundTotal += amount;
      units += qty;
      batch.collection("refunds").create({
        order: order.id,
        order_item_id: item.id,
        product: item.product,
        quantity: qty,
        refund_type: qty >= item.quantity ? "FULL" : "PARTIAL",
        amount,
        gst_reversal: gst,
        reason: "Exchange / return",
        status: "COMPLETED",
        is_synced: false,
      });
      batch.collection("products").update(item.product, { "current_stock+": qty });
      batch.collection("inventory_movements").create({
        product: item.product,
        movement_type: MOVEMENT_TYPE.RETURN,
        quantity: qty,
        reference_id: order.id,
        notes: `Exchange return: ${order.order_no}`,
      });
    }
    batch.collection("orders").update(order.id, {
      status: "REFUNDED",
      refund_amount: refundTotal,
      refund_reason: "Exchange / return",
    });
    await batch.send();
    toast.success(`Returned ${units} unit(s) — Nu. ${refundTotal.toFixed(2)}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Exchange failed";
    toast.error(msg);
    return { success: false, error: msg };
  }
}
