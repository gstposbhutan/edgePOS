// Shared GST helper (web). Bhutan GST 2026 is a flat 5% on taxable goods; GST-exempt products carry
// 0%. Route line/order GST through here so exemption is honoured consistently instead of the ~12
// inlined `* 0.05` sites. `exempt` is the product's gst_exempt flag.

export const GST_RATE = 0.05

/** GST on a taxable amount (already net of discount). Exempt lines return 0. Rounded to 2 dp. */
export function lineGst(taxableAmount, exempt = false) {
  if (exempt) return 0
  const n = parseFloat(taxableAmount)
  if (!Number.isFinite(n) || n <= 0) return 0
  return parseFloat((n * GST_RATE).toFixed(2))
}

/** Sum of per-line GST for a cart of { taxable, exempt } lines (per-line rounding, then sum). */
export function orderGst(lines) {
  return parseFloat((lines || []).reduce((s, l) => s + lineGst(l.taxable, l.exempt), 0).toFixed(2))
}
