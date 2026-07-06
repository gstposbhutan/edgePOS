import { DEFAULT_GST_RATE } from "./constants";

export interface CartItemInput {
  unitPrice: number;
  discount: number;
  quantity: number;
}

export interface CartItemTotals {
  taxable: number;
  gstAmount: number;
  total: number;
}

export function calcItemTotals(input: CartItemInput, gstRate: number = DEFAULT_GST_RATE): CartItemTotals {
  const rate = gstRate / 100;
  const taxable = Math.max(0, input.unitPrice - input.discount);
  const gstAmount = parseFloat((taxable * rate * input.quantity).toFixed(2));
  const total = parseFloat(((taxable * (1 + rate)) * input.quantity).toFixed(2));
  return { taxable, gstAmount, total };
}

export function calcCartTotals(
  items: { unitPrice: number; discount: number; quantity: number }[],
  gstRate: number = DEFAULT_GST_RATE,
  billDiscount: number = 0
) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount * i.quantity, 0);
  // Invoice/bill-level discount: a single pre-GST amount off the net subtotal (NOT distributed
  // across lines). Clamped so the net can't go negative.
  const bd = Math.min(Math.max(0, billDiscount), Math.max(0, subtotal - discountTotal));
  const taxableSubtotal = Math.max(0, subtotal - discountTotal - bd);
  const rate = gstRate / 100;
  let gstTotal: number;
  let grandTotal: number;
  if (bd > 0) {
    // Bill discount present → GST on the discounted invoice net (matches the web cart).
    gstTotal = parseFloat((taxableSubtotal * rate).toFixed(2));
    grandTotal = parseFloat((taxableSubtotal + gstTotal).toFixed(2));
  } else {
    // No bill discount → canonical per-line-then-sum (P2-5): gst_total == Σ items.gst_5 to the
    // cent, no aggregate re-rounding drift.
    let g = 0;
    let t = 0;
    for (const i of items) {
      const it = calcItemTotals(i, gstRate);
      g += it.gstAmount;
      t += it.total;
    }
    gstTotal = parseFloat(g.toFixed(2));
    grandTotal = parseFloat(t.toFixed(2));
  }
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    billDiscount: parseFloat(bd.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal,
    grandTotal,
  };
}

export function formatCurrency(amount: number): string {
  return `Nu. ${amount.toFixed(2)}`;
}

/**
 * Generate digital signature for order integrity.
 * Uses SubtleCrypto SHA-256 in browser.
 *
 * Payload is `orderNo:grandTotal:tpnGstin` — identical to the web app (P1-3),
 * and intentionally has NO timestamp so the signature can be re-verified from
 * the stored order (orderNo + grand_total + seller TPN) on sync ingest.
 */
export async function generateOrderSignature(
  orderNo: string,
  grandTotal: number,
  tpnGstin: string
): Promise<string> {
  const payload = `${orderNo}:${grandTotal}:${tpnGstin}`;
  const sigBytes = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", sigBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate POS order number: POS-{TERMINAL}-YYYYMMDD-NNNN (P1-2).
 * The terminal id namespaces the per-day sequence so two offline terminals
 * cannot mint colliding order numbers before they sync.
 */
export function generateOrderNo(terminalId: string, date: string, sequence: number): string {
  return `POS-${terminalId}-${date}-${String(sequence).padStart(4, "0")}`;
}
