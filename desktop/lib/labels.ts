// Barcode / label maker — generation core (RETAILER terminal).
//
// Initial scope: SINGLE-label printing (one label per page, × copies) for a dedicated
// label printer / roll. The driving case is loose / weighed goods (rice, sugar,
// vegetables, fruit) that have no manufacturer barcode — we mint a Code128 from the SKU.
// Print path is hardware-agnostic: render HTML + inline SVG, print via the OS dialog with
// an @page sized to the label. No printer-specific (TSPL/ZPL) drivers. See
// docs/label-maker-plan.md.
//
// Import the browser build explicitly (the renderer's target); its `toSVG` is DOM-free,
// so it also runs under vitest (node). Both builds expose the same `toSVG`.
import { toSVG } from "bwip-js/browser";

export interface LabelConfig {
  width_mm: number;
  height_mm: number;
  symbology: "auto" | "code128" | "ean13";
  show_name: boolean;
  show_mrp: boolean;
  show_sku: boolean;
  font_pt: number;
  copies: number;
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  width_mm: 40,
  height_mm: 30,
  symbology: "auto",
  show_name: true,
  show_mrp: true,
  show_sku: false,
  font_pt: 9,
  copies: 1,
};

export interface LabelItem {
  name: string;
  sku: string;
  barcode?: string | null;
  mrp?: number | null;
  // Weighed-at-counter goods (rice/sugar/veg/fruit): `weight` in `unit` (default kg) and
  // `price` = the computed line total (weight × per-unit rate). When set, the label shows
  // the weight + this price instead of MRP.
  weight?: number | null;
  unit?: string | null;
  price?: number | null;
}

/** EAN-13 check-digit validation — bwip-js throws on an invalid EAN, so guard first. */
export function isValidEan13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  const d = s.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === d[12];
}

/** Decide what value + symbology to encode for an item. */
export function resolveBarcode(
  item: LabelItem,
  cfg: LabelConfig,
): { value: string; bcid: "code128" | "ean13" } {
  const raw = (item.barcode || "").trim();
  // Use EAN-13 only when we actually have a valid one; otherwise Code128 (encodes anything).
  if ((cfg.symbology === "ean13" || cfg.symbology === "auto") && isValidEan13(raw)) {
    return { value: raw, bcid: "ean13" };
  }
  return { value: raw || item.sku, bcid: "code128" };
}

/** Render the barcode as inline SVG. Never throws — falls back to a Code128 of the SKU. */
export function barcodeSVG(item: LabelItem, cfg: LabelConfig): string {
  const { value, bcid } = resolveBarcode(item, cfg);
  const opts = { includetext: true, textxalign: "center" as const, height: 10, textsize: 8 };
  try {
    return toSVG({ bcid, text: value, ...opts });
  } catch {
    return toSVG({ bcid: "code128", text: item.sku || value || "NA", ...opts });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number | null | undefined): string {
  return `Nu. ${(Number(n) || 0).toFixed(2)}`;
}

function fmtWeight(w: number, unit?: string | null): string {
  const u = (unit || "kg").toLowerCase();
  // kg shows 3 decimals (e.g. 1.250 kg); other units (g/pcs) as-is.
  return u === "kg" ? `${Number(w).toFixed(3)} kg` : `${Number(w)} ${u}`;
}

/** One label's inner HTML (barcode + the configured fields). */
export function renderLabelHTML(item: LabelItem, cfg: LabelConfig): string {
  const parts: string[] = [];
  if (cfg.show_name && item.name) parts.push(`<div class="name">${escapeHtml(item.name)}</div>`);
  parts.push(`<div class="barcode">${barcodeSVG(item, cfg)}</div>`);
  if (item.weight != null) parts.push(`<div class="weight">${fmtWeight(item.weight, item.unit)}</div>`);
  // Weighed goods show the computed line price; otherwise the MRP.
  const priceVal = item.price != null ? item.price : item.mrp;
  if (cfg.show_mrp && priceVal != null) parts.push(`<div class="mrp">${money(priceVal)}</div>`);
  if (cfg.show_sku && item.sku) parts.push(`<div class="sku">${escapeHtml(item.sku)}</div>`);
  return `<div class="label">${parts.join("")}</div>`;
}

/**
 * A full printable HTML document: `copies` single-label pages, each @page sized to the
 * label. The renderer writes this into a hidden iframe / print window and calls print().
 */
export function renderLabelDocument(item: LabelItem, cfg: LabelConfig, copies = 1): string {
  const n = Math.max(1, Math.floor(copies));
  const one = renderLabelHTML(item, cfg);
  const labels = Array.from({ length: n }, () => one).join("\n");
  const css = `
    @page { size: ${cfg.width_mm}mm ${cfg.height_mm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .label {
      width: ${cfg.width_mm}mm; height: ${cfg.height_mm}mm; padding: 1mm;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: 'Noto Sans', system-ui, sans-serif; text-align: center; overflow: hidden;
      page-break-after: always;
    }
    .label:last-child { page-break-after: auto; }
    .label .name { font-size: ${cfg.font_pt}pt; font-weight: 600; line-height: 1.1;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .label .barcode { width: 100%; }
    .label .barcode svg { max-width: 100%; height: auto; }
    .label .weight { font-size: ${cfg.font_pt}pt; font-weight: 600; }
    .label .mrp { font-size: ${cfg.font_pt + 2}pt; font-weight: 800; }
    .label .sku { font-size: ${Math.max(6, cfg.font_pt - 2)}pt; color: #444; }
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body>${labels}</body></html>`;
}
