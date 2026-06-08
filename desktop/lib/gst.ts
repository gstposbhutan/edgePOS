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
  gstRate: number = DEFAULT_GST_RATE
) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount * i.quantity, 0);
  const taxableSubtotal = subtotal - discountTotal;
  // P2-5: per-line-then-sum (canonical; matches the web cart's useCart). GST and grand
  // total are the SUM of the per-line rounded amounts (via calcItemTotals), so the
  // stored gst_total equals Σ items.gst_5 to the cent — not an aggregate re-rounding
  // that could drift from the line items by a ngultrum.
  let gstTotal = 0;
  let grandTotal = 0;
  for (const i of items) {
    const t = calcItemTotals(i, gstRate);
    gstTotal += t.gstAmount;
    grandTotal += t.total;
  }
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal: parseFloat(gstTotal.toFixed(2)),
    grandTotal: parseFloat(grandTotal.toFixed(2)),
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
