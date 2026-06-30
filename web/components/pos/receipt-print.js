"use client"

/**
 * Thermal receipt print helper (web).
 *
 * A browser can't silently drive a thermal printer, so we open a bare window
 * containing ONLY a clone of the receipt DOM node plus a thermal `@page`
 * stylesheet, then fire the OS print dialog. The cashier picks any printer
 * (thermal / A4 / save-as-PDF) and only the receipt prints — not the whole app.
 *
 * Mirrors the desktop receipt-modal clone-to-new-window approach, but with
 * thermal-width page CSS so the printout matches the on-screen narrow preview.
 *
 * Framework-agnostic: pass a live DOM node (e.g. a React ref's .current).
 *
 * @param {HTMLElement} node             the receipt element to print
 * @param {{ paperWidthMm?: number }} [opts]  paper width in mm (58 or 80; default 80)
 */
export function printReceiptNode(node, { paperWidthMm = 80 } = {}) {
  if (!node || typeof window === 'undefined') return

  const w = window.open('', '_blank')
  if (!w) return   // popup blocked — nothing we can do from here

  const clone = node.cloneNode(true)

  // Strip the screen's rounded corners / shadow / max-width so the receipt fills
  // the paper edge-to-edge. The clone keeps the receipt's own inline classes, but
  // the print CSS below forces the geometry that matters for thermal paper.
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt</title>
        <style>
          @page { size: ${paperWidthMm}mm auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
          }
          body {
            width: ${paperWidthMm}mm;
            font-family: 'Courier New', ui-monospace, monospace;
            font-size: 11px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Force the cloned root to the paper width — the on-screen preview wraps
             the receipt in a fixed-px column, which would otherwise overflow the
             mm-wide paper. This neutralises any inline px width on the clone. */
          body > * {
            width: ${paperWidthMm}mm !important;
            max-width: ${paperWidthMm}mm !important;
          }
          /* Receipt card: drop screen chrome, fit the paper width. */
          #receipt-content {
            width: ${paperWidthMm}mm !important;
            max-width: ${paperWidthMm}mm !important;
            padding: 2mm 3mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          table { width: 100%; border-collapse: collapse; }
          img { display: block; }
        </style>
      </head>
      <body></body>
    </html>
  `)
  w.document.close()
  w.document.body.appendChild(clone)
  w.focus()

  // Small delay lets the cloned node (and its logo image) lay out before the
  // dialog snapshots the page — same trick the desktop browser-print path uses.
  setTimeout(() => {
    w.print()
    w.close()
  }, 250)
}

const PAPER_WIDTH_KEY = 'pos_receipt_paper_width'

/** Read the per-station paper width (mm). Defaults to 80; SSR-safe. */
export function getReceiptPaperWidth() {
  if (typeof window === 'undefined') return 80
  try {
    const saved = parseInt(window.localStorage.getItem(PAPER_WIDTH_KEY), 10)
    return saved === 58 || saved === 80 ? saved : 80
  } catch {
    return 80
  }
}

/** Persist the per-station paper width (mm). SSR-safe; ignores bad values. */
export function setReceiptPaperWidth(mm) {
  if (typeof window === 'undefined') return
  if (mm !== 58 && mm !== 80) return
  try { window.localStorage.setItem(PAPER_WIDTH_KEY, String(mm)) } catch {}
}

export { PAPER_WIDTH_KEY }
