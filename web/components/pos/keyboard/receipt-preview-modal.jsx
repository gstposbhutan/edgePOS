"use client"

import { useEffect, useRef, useState } from "react"
import { X, Printer, ShoppingCart, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Receipt } from "@/components/pos/receipt"
import {
  printReceiptNode,
  getReceiptPaperWidth,
  setReceiptPaperWidth,
} from "@/components/pos/receipt-print"

/**
 * Post-sale receipt preview (keyboard POS). Shown after a successful F10 tender.
 *
 * The receipt is rendered in a narrow, thermal-paper-styled column so what the
 * cashier sees mirrors what prints — Print clones THIS DOM node into a bare
 * window with thermal `@page` CSS (see receipt-print.js) and opens the OS print
 * dialog, so the cashier can send it to any printer (thermal / A4 / PDF).
 *
 * Paper width (58/80mm) is a per-station setting in localStorage and drives both
 * the on-screen column width and the printout.
 *
 * @param {{ order: object, entity: object, items: object[],
 *   onNewSale: () => void, onClose: () => void }} props
 */
export function ReceiptPreviewModal({ order, entity, items, onNewSale, onClose }) {
  const receiptRef = useRef(null)
  const [paperWidth, setPaperWidth] = useState(80)

  // Read the persisted width on open (SSR-safe — only touches localStorage here).
  useEffect(() => {
    setPaperWidth(getReceiptPaperWidth())
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!order) return null

  function changeWidth(mm) {
    setPaperWidth(mm)
    setReceiptPaperWidth(mm)
  }

  function handlePrint() {
    if (receiptRef.current) printReceiptNode(receiptRef.current, { paperWidthMm: paperWidth })
  }

  // 58mm paper ≈ 220px of usable print width, 80mm ≈ 300px. Constrain the on-screen
  // column to the same proportion so the preview reads like the printout.
  const columnPx = paperWidth === 58 ? 240 : 320

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-emerald-600">✓ Sale Complete</h3>
            <p className="text-xs text-muted-foreground">
              Order <span className="font-mono font-medium">{order.order_no}</span> · Nu. {parseFloat(order.grand_total).toFixed(2)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Paper width toggle */}
        <div className="flex items-center justify-center gap-1.5 px-5 py-2 border-b border-border shrink-0">
          <span className="text-[11px] text-muted-foreground mr-1">Paper</span>
          {[58, 80].map(mm => (
            <button
              key={mm}
              onClick={() => changeWidth(mm)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                paperWidth === mm
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {mm}mm
            </button>
          ))}
        </div>

        {/* Thermal-style preview */}
        <div className="overflow-y-auto flex-1 bg-muted/30 px-4 py-4 flex justify-center">
          <div
            ref={receiptRef}
            style={{ width: columnPx }}
            className="shadow-md rounded-lg overflow-hidden font-mono"
          >
            <Receipt order={order} entity={entity} items={items} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button variant="outline" className="flex-1" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={onNewSale}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            New Sale
          </Button>
        </div>
      </div>
    </div>
  )
}
