// Barcode / label maker — generation core (web till).
//
// The mirror of desktop/lib/labels.ts, so a label printed from the browser is byte-for-byte
// the label the terminal prints: same symbology decision, same layout, same @page sizing.
// Keep the two in step.
//
// Print path is hardware-agnostic: render HTML + inline SVG and print through the OS dialog
// with an @page sized to the label. No printer-specific (TSPL/ZPL) drivers. The one difference
// from the terminal is where the dialog comes from — Electron prints silently to the installed
// printer, a browser shows its own print dialog and the operator picks the label printer.
//
// Import the browser build explicitly; its `toSVG` is DOM-free, so it also runs under node.
import { toSVG } from 'bwip-js/browser'

export const DEFAULT_LABEL_CONFIG = {
  width_mm: 40,
  height_mm: 30,
  symbology: 'auto',      // 'auto' | 'code128' | 'ean13'
  show_name: true,
  show_mrp: true,
  show_sku: false,
  font_pt: 9,
  copies: 1,
}

/** EAN-13 check-digit validation — bwip-js throws on an invalid EAN, so guard first. */
export function isValidEan13(s) {
  if (!/^\d{13}$/.test(s)) return false
  const d = s.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += d[i] * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return check === d[12]
}

/** Decide what value + symbology to encode for an item. */
export function resolveBarcode(item, cfg) {
  const raw = (item.barcode || '').trim()
  // Use EAN-13 only when we actually have a valid one; otherwise Code128 (encodes anything).
  if ((cfg.symbology === 'ean13' || cfg.symbology === 'auto') && isValidEan13(raw)) {
    return { value: raw, bcid: 'ean13' }
  }
  return { value: raw || item.sku, bcid: 'code128' }
}

/** Render the barcode as inline SVG. Never throws — falls back to a Code128 of the SKU. */
export function barcodeSVG(item, cfg) {
  const { value, bcid } = resolveBarcode(item, cfg)
  const opts = { includetext: true, textxalign: 'center', height: 10, textsize: 8 }
  try {
    return toSVG({ bcid, text: value, ...opts })
  } catch {
    return toSVG({ bcid: 'code128', text: item.sku || value || 'NA', ...opts })
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n) {
  return `Nu. ${(Number(n) || 0).toFixed(2)}`
}

function fmtWeight(w, unit) {
  const u = (unit || 'kg').toLowerCase()
  // kg shows 3 decimals (e.g. 1.250 kg); other units (g/pcs) as-is.
  return u === 'kg' ? `${Number(w).toFixed(3)} kg` : `${Number(w)} ${u}`
}

/** One label's inner HTML (barcode + the configured fields). */
export function renderLabelHTML(item, cfg) {
  const parts = []
  if (cfg.show_name && item.name) parts.push(`<div class="name">${escapeHtml(item.name)}</div>`)
  parts.push(`<div class="barcode">${barcodeSVG(item, cfg)}</div>`)
  if (item.weight != null) parts.push(`<div class="weight">${fmtWeight(item.weight, item.unit)}</div>`)
  // Weighed goods show the computed line price; otherwise the MRP.
  const priceVal = item.price != null ? item.price : item.mrp
  if (cfg.show_mrp && priceVal != null) parts.push(`<div class="mrp">${money(priceVal)}</div>`)
  if (cfg.show_sku && item.sku) parts.push(`<div class="sku">${escapeHtml(item.sku)}</div>`)
  return `<div class="label">${parts.join('')}</div>`
}

/**
 * A full printable HTML document: `copies` single-label pages, each @page sized to the label.
 * The caller writes this into a print window and calls print().
 */
export function renderLabelDocument(item, cfg, copies = 1) {
  const n = Math.max(1, Math.floor(copies))
  const one = renderLabelHTML(item, cfg)
  const labels = Array.from({ length: n }, () => one).join('\n')
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
  `
  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body>${labels}</body></html>`
}

// ── Per-station config + the print call ─────────────────────────────────────────────────────
// Label size and symbology depend on the physical label printer attached to THIS station, so
// this is per-station config in localStorage rather than a synced store setting — same
// reasoning, and the same shape, as the terminal's label-config.ts.

const KEY = 'nexus.labelConfig'

/** Merge a partial stored config over the defaults (tolerant of older/partial saves). */
export function mergeLabelConfig(partial) {
  return { ...DEFAULT_LABEL_CONFIG, ...(partial || {}) }
}

export function loadLabelConfig() {
  if (typeof window === 'undefined') return DEFAULT_LABEL_CONFIG
  try {
    const raw = window.localStorage.getItem(KEY)
    return mergeLabelConfig(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_LABEL_CONFIG
  }
}

export function saveLabelConfig(cfg) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cfg))
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/**
 * Open the labels in a print window. Returns false when the browser blocked the popup, which
 * is the one failure the cashier can actually act on — the caller says so rather than leaving
 * the key looking dead.
 */
export function printLabel(item, config = DEFAULT_LABEL_CONFIG, copies = config.copies ?? 1) {
  const html = renderLabelDocument(item, config, copies)
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 250)
  return true
}
