// Shared GST helper (web). Bhutan GST 2026 is a flat 5% on taxable goods; GST-exempt products
// carry 0%. Route line/order GST through here so exemption is honoured consistently instead of
// the ~12 inlined `* 0.05` sites. `exempt` is the product's gst_exempt flag.
//
// The mirror of the cart maths lives in desktop/lib/gst.ts — keep the two in step, since a
// ticket rung on the terminal and the same ticket rung in the browser must print the same bill.

export const GST_RATE = 0.05

/** GST on one line's taxable amount. Exempt goods carry none. */
export function lineGst(taxableAmount, exempt = false) {
  if (exempt) return 0
  return parseFloat((taxableAmount * GST_RATE).toFixed(2))
}

/** Sum of per-line GST for a cart of { taxable, exempt } lines (per-line rounding, then sum). */
export function orderGst(lines) {
  return parseFloat((lines || []).reduce((s, l) => s + lineGst(l.taxable, l.exempt), 0).toFixed(2))
}

/**
 * Split one line into its net, its GST and what the customer pays.
 *
 * `gstIncluded` (the till's Alt+T) says the rate the cashier typed ALREADY contains GST, so the
 * tax is extracted from it rather than added on top — the customer pays exactly the entered
 * rate. Exempt lines carry no GST either way, so the mode cannot change them.
 *
 * Returned `taxable` is always the ex-GST amount PER UNIT, in both modes.
 */
export function calcItemTotals({ unitPrice, discount = 0, quantity, gstExempt = false }, gstIncluded = false) {
  const perUnit = Math.max(0, unitPrice - discount)
  if (gstExempt) {
    return { taxable: perUnit, gstAmount: 0, total: parseFloat((perUnit * quantity).toFixed(2)) }
  }
  if (gstIncluded) {
    const total = parseFloat((perUnit * quantity).toFixed(2))
    const net = perUnit / (1 + GST_RATE)
    // Derive GST from the ROUNDED total so net + gst reconciles to the printed figure to the
    // cent; computing both independently leaves a stray paisa on the slip.
    const gstAmount = parseFloat((total - net * quantity).toFixed(2))
    return { taxable: parseFloat(net.toFixed(4)), gstAmount, total }
  }
  const gstAmount = parseFloat((perUnit * GST_RATE * quantity).toFixed(2))
  const total = parseFloat(((perUnit * (1 + GST_RATE)) * quantity).toFixed(2))
  return { taxable: perUnit, gstAmount, total }
}

/**
 * Whole-ticket totals.
 *
 * `items` are { unitPrice, discount, quantity, gstExempt }. `billDiscount` is a single pre-GST
 * amount off the invoice, NOT distributed into the stored line figures.
 *
 * A bill discount reduces every line pro-rata, and GST is then charged only on the share of the
 * discounted net that is TAXABLE. Before this, the bill-discount branch taxed the whole
 * discounted net, so a ticket mixing exempt goods (rice, sugar) with an invoice discount
 * charged 5% on the exempt lines too.
 */
export function calcCartTotals(items, billDiscount = 0, gstIncluded = false) {
  const lines = (items || []).map(i => ({
    net: Math.max(0, (i.unitPrice ?? 0) - (i.discount ?? 0)) * (i.quantity ?? 0),
    exempt: !!i.gstExempt,
  }))
  const subtotal      = (items || []).reduce((s, i) => s + (i.unitPrice ?? 0) * (i.quantity ?? 0), 0)
  const discountTotal = (items || []).reduce((s, i) => s + (i.discount ?? 0) * (i.quantity ?? 0), 0)
  const net           = lines.reduce((s, l) => s + l.net, 0)
  // Clamp so the invoice net can't go negative.
  const bd            = Math.min(Math.max(0, billDiscount), Math.max(0, net))

  if (bd > 0) {
    // Pro-rata: the discount takes the same fraction off every line, so the taxable share of
    // the ticket is unchanged by it and exempt goods stay exempt.
    const kept = net > 0 ? (net - bd) / net : 0
    const taxableNet = lines.reduce((s, l) => s + (l.exempt ? 0 : l.net), 0) * kept
    const payable = net - bd

    let gstTotal
    let grandTotal
    let netSubtotal
    if (gstIncluded) {
      // The customer pays the discounted gross; the tax is inside the taxable part of it.
      const extracted = taxableNet - taxableNet / (1 + GST_RATE)
      gstTotal    = parseFloat(extracted.toFixed(2))
      grandTotal  = parseFloat(payable.toFixed(2))
      netSubtotal = payable - gstTotal
    } else {
      gstTotal    = parseFloat((taxableNet * GST_RATE).toFixed(2))
      grandTotal  = parseFloat((payable + gstTotal).toFixed(2))
      netSubtotal = payable
    }
    return {
      subtotal:        parseFloat(subtotal.toFixed(2)),
      discountTotal:   parseFloat(discountTotal.toFixed(2)),
      billDiscount:    parseFloat(bd.toFixed(2)),
      taxableSubtotal: parseFloat(netSubtotal.toFixed(2)),
      gstTotal,
      grandTotal,
    }
  }

  // No bill discount → canonical per-line-then-sum: gst_total == Σ line gst to the cent, with
  // no aggregate re-rounding drift.
  let g = 0, t = 0, n = 0
  for (const i of items || []) {
    const it = calcItemTotals(i, gstIncluded)
    g += it.gstAmount
    t += it.total
    n += it.total - it.gstAmount
  }
  return {
    subtotal:        parseFloat(subtotal.toFixed(2)),
    discountTotal:   parseFloat(discountTotal.toFixed(2)),
    billDiscount:    0,
    taxableSubtotal: parseFloat(n.toFixed(2)),
    gstTotal:        parseFloat(g.toFixed(2)),
    grandTotal:      parseFloat(t.toFixed(2)),
  }
}
