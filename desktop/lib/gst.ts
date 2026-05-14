import { DEFAULT_GST_RATE, DISCOUNT_TYPE } from "./constants";

export interface CartItemInput {
  unitPrice: number;
  discount: number;
  quantity: number;
  discountType?: string;
}

export interface CartItemTotals {
  taxable: number;
  gstAmount: number;
  total: number;
}

export function calcItemTotals(input: CartItemInput, gstRate: number = DEFAULT_GST_RATE, discountType?: string): CartItemTotals {
  const rate = gstRate / 100;
  const dtype = discountType || input.discountType || DISCOUNT_TYPE.FLAT;
  let discountAmount = input.discount;
  if (dtype === DISCOUNT_TYPE.PERCENTAGE && input.discount > 0) {
    discountAmount = (input.unitPrice * input.discount) / 100;
  }
  const taxable = Math.max(0, input.unitPrice - discountAmount);
  const gstAmount = parseFloat((taxable * rate * input.quantity).toFixed(2));
  const total = parseFloat(((taxable * (1 + rate)) * input.quantity).toFixed(2));
  return { taxable, gstAmount, total };
}

export function calcCartTotals(
  items: { unitPrice: number; discount: number; quantity: number; discountType?: string }[],
  gstRate: number = DEFAULT_GST_RATE
) {
  const rate = gstRate / 100;
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountTotal = items.reduce((s, i) => {
    if ((i.discountType || DISCOUNT_TYPE.FLAT) === DISCOUNT_TYPE.PERCENTAGE && i.discount > 0) {
      return s + (i.unitPrice * i.discount / 100) * i.quantity;
    }
    return s + i.discount * i.quantity;
  }, 0);
  const taxableSubtotal = subtotal - discountTotal;
  const gstTotal = parseFloat((taxableSubtotal * rate).toFixed(2));
  const grandTotal = parseFloat((taxableSubtotal + gstTotal).toFixed(2));
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
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
 */
export async function generateOrderSignature(
  orderNo: string,
  grandTotal: number,
  tpnGstin: string,
  timestamp: string
): Promise<string> {
  const payload = `${orderNo}:${grandTotal}:${tpnGstin}:${timestamp}`;
  const sigBytes = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", sigBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate POS order number: POS-YYYYMMDD-NNNN
 * Sequence is obtained from PocketBase count for the day.
 */
export function generateOrderNo(date: string, sequence: number): string {
  return `POS-${date}-${String(sequence).padStart(4, "0")}`;
}
