/**
 * Bhutan GST 2026 calculation utilities.
 * Flat 5% rate on taxable (discounted) amount.
 */

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

export function calcItemTotals(input: CartItemInput): CartItemTotals {
  const taxable = Math.max(0, input.unitPrice - input.discount);
  const gstAmount = parseFloat((taxable * 0.05 * input.quantity).toFixed(2));
  const total = parseFloat(((taxable * 1.05) * input.quantity).toFixed(2));
  return { taxable, gstAmount, total };
}

export function calcCartTotals(items: { unitPrice: number; discount: number; quantity: number }[]) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount * i.quantity, 0);
  const taxableSubtotal = subtotal - discountTotal;
  const gstTotal = parseFloat((taxableSubtotal * 0.05).toFixed(2));
  const grandTotal = parseFloat((taxableSubtotal + gstTotal).toFixed(2));
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    taxableSubtotal: parseFloat(taxableSubtotal.toFixed(2)),
    gstTotal,
    grandTotal,
  };
}

export function generateOrderSignature(orderNo: string, grandTotal: number, tpnGstin: string, timestamp: string): string {
  const payload = `${orderNo}:${grandTotal}:${tpnGstin}:${timestamp}`;
  // In browser we use SubtleCrypto; server-side could use crypto
  // Return a simple hash string for now (proper SHA-256 done at save time via PB hook)
  return payload;
}

export function formatCurrency(amount: number): string {
  return `Nu. ${amount.toFixed(2)}`;
}

export function generateOrderNo(sequence: number): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(5, '0');
  return `POS-${year}-${seq}`;
}
