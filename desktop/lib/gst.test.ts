import { describe, it, expect } from "vitest";
import { calcItemTotals, calcCartTotals } from "./gst";

// The terminal's flat rate is 5%.
const line = (unitPrice: number, quantity = 1, discount = 0, gstExempt = false) =>
  ({ unitPrice, quantity, discount, gstExempt });

describe("calcItemTotals — GST added on top (the default)", () => {
  it("adds 5% to the entered rate", () => {
    expect(calcItemTotals(line(100, 2))).toEqual({ taxable: 100, gstAmount: 10, total: 210 });
  });
  it("taxes the post-discount rate", () => {
    expect(calcItemTotals(line(100, 1, 20))).toEqual({ taxable: 80, gstAmount: 4, total: 84 });
  });
  it("charges nothing on exempt goods", () => {
    expect(calcItemTotals(line(100, 3, 0, true))).toEqual({ taxable: 100, gstAmount: 0, total: 300 });
  });
});

describe("calcItemTotals — GST included in the rate (Alt+T)", () => {
  it("extracts the tax instead of adding it, so the customer pays the entered rate", () => {
    const r = calcItemTotals(line(105, 1), 5, true);
    expect(r.total).toBe(105);
    expect(r.gstAmount).toBe(5);
  });

  it("reconciles net + gst to the printed total to the cent", () => {
    for (const price of [99.99, 123.45, 7.77, 1000, 33.33]) {
      for (const qty of [1, 3, 7]) {
        const r = calcItemTotals(line(price, qty), 5, true);
        const net = parseFloat((r.total - r.gstAmount).toFixed(2));
        expect(parseFloat((net + r.gstAmount).toFixed(2))).toBe(r.total);
      }
    }
  });

  it("leaves exempt goods alone — the mode cannot invent tax on them", () => {
    expect(calcItemTotals(line(100, 3, 0, true), 5, true)).toEqual({
      taxable: 100, gstAmount: 0, total: 300,
    });
  });

  it("extracts from the DISCOUNTED rate", () => {
    const r = calcItemTotals(line(126, 1, 21), 5, true);
    expect(r.total).toBe(105);
    expect(r.gstAmount).toBe(5);
  });
});

describe("calcCartTotals", () => {
  const items = [line(100, 2), line(50, 1)];

  it("is unchanged in the default mode — GST on top, per-line then summed", () => {
    const t = calcCartTotals(items);
    expect(t.subtotal).toBe(250);
    expect(t.taxableSubtotal).toBe(250);
    expect(t.gstTotal).toBe(12.5);
    expect(t.grandTotal).toBe(262.5);
  });

  it("in included mode the customer pays the entered rates, tax extracted", () => {
    const t = calcCartTotals(items, 5, 0, true);
    expect(t.grandTotal).toBe(250);
    expect(t.gstTotal).toBe(11.9);
    // taxableSubtotal is the ex-GST net in BOTH modes.
    expect(parseFloat((t.taxableSubtotal + t.gstTotal).toFixed(2))).toBe(250);
  });

  it("honours per-line exemption when there is no bill discount, in both modes", () => {
    const mixed = [line(100, 1), line(100, 1, 0, true)];
    expect(calcCartTotals(mixed).gstTotal).toBe(5);
    expect(calcCartTotals(mixed, 5, 0, true).gstTotal).toBe(4.76);
  });

  it("applies a bill discount before tax in the default mode", () => {
    const t = calcCartTotals(items, 5, 50);
    expect(t.billDiscount).toBe(50);
    expect(t.taxableSubtotal).toBe(200);
    expect(t.gstTotal).toBe(10);
    expect(t.grandTotal).toBe(210);
  });

  it("applies a bill discount inside the price in included mode", () => {
    const t = calcCartTotals(items, 5, 50, true);
    expect(t.grandTotal).toBe(200);
    expect(parseFloat((t.taxableSubtotal + t.gstTotal).toFixed(2))).toBe(200);
  });

  it("keeps exempt goods exempt under a BILL discount", () => {
    // Rice 500 + sugar 85 (both exempt) + soap 100 (taxable), 10% off the invoice.
    // The discount takes the same fraction off every line, so only the soap's share is taxed.
    const mixed = [line(250, 2, 0, true), line(85, 1, 0, true), line(100, 1)];
    const t = calcCartTotals(mixed, 5, 68.5);
    expect(t.gstTotal).toBe(4.5);
    expect(t.grandTotal).toBe(621);
  });

  it("keeps exempt goods exempt under a bill discount in included mode too", () => {
    const mixed = [line(250, 2, 0, true), line(85, 1, 0, true), line(100, 1)];
    const t = calcCartTotals(mixed, 5, 68.5, true);
    // The customer pays the discounted gross either way; only the taxable share carries tax.
    expect(t.grandTotal).toBe(616.5);
    expect(t.gstTotal).toBe(4.29);
    expect(parseFloat((t.taxableSubtotal + t.gstTotal).toFixed(2))).toBe(616.5);
  });

  it("charges no GST at all when every line under a bill discount is exempt", () => {
    const t = calcCartTotals([line(100, 2, 0, true)], 5, 50);
    expect(t.gstTotal).toBe(0);
    expect(t.grandTotal).toBe(150);
  });

  it("clamps a bill discount so the net cannot go negative", () => {
    const t = calcCartTotals(items, 5, 9999);
    expect(t.billDiscount).toBe(250);
    expect(t.grandTotal).toBe(0);
  });
});
