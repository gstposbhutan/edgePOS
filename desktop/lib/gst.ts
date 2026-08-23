import { DEFAULT_GST_RATE } from "./constants";

export interface CartItemInput {
  unitPrice: number;
  discount: number;
  quantity: number;
  // GST-exempt line: 0% instead of the flat rate (rice/sugar/etc.). See migration 022.
  gstExempt?: boolean;
}

export interface CartItemTotals {
  taxable: number;
  gstAmount: number;
  total: number;
}

/**
 * Split one line into its net, its GST and what the customer pays.
 *
 * `gstIncluded` (the counter's Alt+T) says the rate the cashier typed ALREADY contains GST, so
 * the tax is extracted from it rather than added on top — the customer pays exactly the entered
 * rate. Exempt lines carry no GST either way, so the mode cannot change them.
 *
 * Returned `taxable` is always the ex-GST amount PER UNIT, in both modes.
 */
export function calcItemTotals(
  input: CartItemInput,
  gstRate: number = DEFAULT_GST_RATE,
  gstIncluded: boolean = false,
): CartItemTotals {
  const rate = gstRate / 100;
  const perUnit = Math.max(0, input.unitPrice - input.discount);
  // Exempt goods carry no GST: total is just the entered amount × qty, gstAmount is 0.
  if (input.gstExempt) {
    return { taxable: perUnit, gstAmount: 0, total: parseFloat((perUnit * input.quantity).toFixed(2)) };
  }
  if (gstIncluded) {
    const total = parseFloat((perUnit * input.quantity).toFixed(2));
    const net = perUnit / (1 + rate);
    // Derive GST from the ROUNDED total so net + gst reconciles to the printed figure to the
    // cent; computing both independently leaves a stray paisa on the slip.
    const gstAmount = parseFloat((total - net * input.quantity).toFixed(2));
    return { taxable: parseFloat(net.toFixed(4)), gstAmount, total };
  }
  const gstAmount = parseFloat((perUnit * rate * input.quantity).toFixed(2));
  const total = parseFloat(((perUnit * (1 + rate)) * input.quantity).toFixed(2));
  return { taxable: perUnit, gstAmount, total };
}

export function calcCartTotals(
  items: { unitPrice: number; discount: number; quantity: number; gstExempt?: boolean }[],
  gstRate: number = DEFAULT_GST_RATE,
  billDiscount: number = 0,
  /** Alt+T — the entered rates already contain GST, so it is extracted, not added. */
  gstIncluded: boolean = false,
) {
  const rate = gstRate / 100;
  const lines = items.map((i) => ({
    net: Math.max(0, i.unitPrice - i.discount) * i.quantity,
    exempt: !!i.gstExempt,
  }));
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount * i.quantity, 0);
  const net = lines.reduce((s, l) => s + l.net, 0);
  // Invoice/bill-level discount: a single pre-GST amount off the net subtotal (NOT distributed
  // into the stored line figures). Clamped so the net can't go negative.
  const bd = Math.min(Math.max(0, billDiscount), Math.max(0, net));

  let gstTotal: number;
  let grandTotal: number;
  // The ex-GST net. In inclusive mode the line amounts already contain the tax, so the net is
  // what is left after extracting it — which is why this is not simply the payable amount.
  let netSubtotal: number;

  if (bd > 0) {
    // Pro-rata: the discount takes the same fraction off every line, so the ticket's taxable
    // share is unchanged by it and exempt goods stay exempt. This branch used to tax the whole
    // discounted net, which charged 5% on rice and sugar whenever an invoice discount was
    // applied — the same fix landed in web/lib/gst.js.
    const kept = net > 0 ? (net - bd) / net : 0;
    const taxableNet = lines.reduce((s, l) => s + (l.exempt ? 0 : l.net), 0) * kept;
    const payable = net - bd;
    if (gstIncluded) {
      // The customer pays the discounted gross; the tax is inside the taxable part of it.
      const extracted = taxableNet - taxableNet / (1 + rate);
      gstTotal = parseFloat(extracted.toFixed(2));
      grandTotal = parseFloat(payable.toFixed(2));
      netSubtotal = payable - gstTotal;
    } else {
      gstTotal = parseFloat((taxableNet * rate).toFixed(2));
      grandTotal = parseFloat((payable + gstTotal).toFixed(2));
      netSubtotal = payable;
    }
  } else {
    // No bill discount → canonical per-line-then-sum (P2-5): gst_total == Σ items.gst_5 to the
    // cent, no aggregate re-rounding drift.
    let g = 0;
    let t = 0;
    let n = 0;
    for (const i of items) {
      const it = calcItemTotals(i, gstRate, gstIncluded);
      g += it.gstAmount;
      t += it.total;
      n += it.total - it.gstAmount;
    }
    gstTotal = parseFloat(g.toFixed(2));
    grandTotal = parseFloat(t.toFixed(2));
    netSubtotal = n;
  }
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    billDiscount: parseFloat(bd.toFixed(2)),
    // Ex-GST net in both modes — this is what the slip's "Subtotal" line means.
    taxableSubtotal: parseFloat(netSubtotal.toFixed(2)),
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
