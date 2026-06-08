import { describe, it, expect } from "vitest";
import {
  isValidEan13,
  resolveBarcode,
  barcodeSVG,
  renderLabelDocument,
  DEFAULT_LABEL_CONFIG,
  type LabelItem,
} from "./labels";

const cfg = DEFAULT_LABEL_CONFIG;

describe("isValidEan13", () => {
  it("accepts a valid EAN-13", () => expect(isValidEan13("4006381333931")).toBe(true));
  it("rejects a bad check digit", () => expect(isValidEan13("8901234567894")).toBe(false));
  it("rejects non-13-digit input", () => {
    expect(isValidEan13("123")).toBe(false);
    expect(isValidEan13("RICE-001")).toBe(false);
  });
});

describe("resolveBarcode", () => {
  it("loose good (no barcode) → Code128 from SKU", () => {
    const item: LabelItem = { name: "Loose Rice 1kg", sku: "RICE-LOOSE-001" };
    expect(resolveBarcode(item, cfg)).toEqual({ value: "RICE-LOOSE-001", bcid: "code128" });
  });
  it("valid EAN barcode → ean13", () => {
    const item: LabelItem = { name: "Bottled Juice", sku: "JUICE-1", barcode: "4006381333931" };
    expect(resolveBarcode(item, cfg)).toEqual({ value: "4006381333931", bcid: "ean13" });
  });
  it("invalid 13-digit barcode → falls back to Code128", () => {
    const item: LabelItem = { name: "X", sku: "X-1", barcode: "8901234567894" };
    expect(resolveBarcode(item, cfg).bcid).toBe("code128");
  });
});

describe("barcodeSVG", () => {
  it("loose good produces SVG", () => {
    const svg = barcodeSVG({ name: "Sugar", sku: "SUGAR-LOOSE" }, cfg);
    expect(svg.trim().startsWith("<svg")).toBe(true);
  });
  it("valid EAN produces SVG", () => {
    const svg = barcodeSVG({ name: "Juice", sku: "J", barcode: "4006381333931" }, cfg);
    expect(svg.trim().startsWith("<svg")).toBe(true);
  });
  it("never throws on a garbage 13-digit barcode (falls back)", () => {
    const svg = barcodeSVG({ name: "Bad", sku: "BAD-1", barcode: "8901234567894" }, cfg);
    expect(svg.trim().startsWith("<svg")).toBe(true);
  });
});

describe("renderLabelDocument", () => {
  const item: LabelItem = { name: "Loose Veg", sku: "VEG-1", mrp: 45 };
  it("emits @page sized to the label", () => {
    const html = renderLabelDocument(item, cfg, 1);
    expect(html).toContain(`size: ${cfg.width_mm}mm ${cfg.height_mm}mm`);
  });
  it("repeats one label per copy", () => {
    const html = renderLabelDocument(item, cfg, 3);
    expect((html.match(/class="label"/g) || []).length).toBe(3);
  });
  it("shows name + MRP per config", () => {
    const html = renderLabelDocument(item, cfg, 1);
    expect(html).toContain("Loose Veg");
    expect(html).toContain("Nu. 45.00");
  });
  it("escapes HTML in product names", () => {
    const html = renderLabelDocument({ name: "A & <B>", sku: "S" }, cfg, 1);
    expect(html).toContain("A &amp; &lt;B&gt;");
    expect(html).not.toContain("<B>");
  });
  it("clamps copies to at least 1", () => {
    const html = renderLabelDocument(item, cfg, 0);
    expect((html.match(/class="label"/g) || []).length).toBe(1);
  });
});

describe("weighed goods", () => {
  it("renders weight (kg, 3dp) and the computed price", () => {
    const weighed: LabelItem = { name: "Loose Rice", sku: "RICE-LOOSE", weight: 1.25, unit: "kg", price: 93.75 };
    const html = renderLabelDocument(weighed, cfg, 1);
    expect(html).toContain("1.250 kg");
    expect(html).toContain("Nu. 93.75");
  });
  it("computed price overrides MRP for weighed items", () => {
    const weighed: LabelItem = { name: "Sugar", sku: "SUGAR", mrp: 48, weight: 2, unit: "kg", price: 90 };
    const html = renderLabelDocument(weighed, cfg, 1);
    expect(html).toContain("Nu. 90.00");
    expect(html).not.toContain("Nu. 48.00");
  });
  it("weighed loose good still gets a Code128 barcode from SKU", () => {
    const svg = barcodeSVG({ name: "Veg", sku: "VEG-LOOSE", weight: 0.5, unit: "kg", price: 20 }, cfg);
    expect(svg.trim().startsWith("<svg")).toBe(true);
  });
});
