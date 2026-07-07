"use client"

import { useState, useEffect } from "react"
import { X, FileText, FileCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Alt+Q — save the cart as a DRAFT sell-side document without taking payment or moving
 * stock. The staffer chooses which:
 *   • Sales Order — a committed order to fulfil later (→ Sales Invoice moves stock)
 *   • Quotation  — a non-binding quote
 * Both are order_type='SALES_ORDER', status='DRAFT'; `is_quotation` distinguishes them.
 *
 * @param {{ itemCount: number, grandTotal: number,
 *   onConfirm: (isQuotation: boolean) => Promise, onClose: () => void }} props
 */
export function QuotationConfirmModal({ itemCount, grandTotal, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, busy])

  async function submit(isQuotation) {
    setBusy(true)
    try { await onConfirm(isQuotation) } finally { setBusy(false) }
  }

  const total = Number(grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Save as draft</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-muted-foreground">
            Save this cart without taking payment or moving stock. Fulfil it into a sale (Sales Invoice) later from the order detail.
          </p>
          <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="tabular-nums">{itemCount}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="tabular-nums font-medium">Nu. {total}</span></div>
        </div>
        <div className="px-4 py-3 border-t border-border grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={busy || !itemCount} onClick={() => submit(true)} className="gap-1.5">
            <FileText className="h-4 w-4" /> {busy ? '…' : 'Quotation'}
          </Button>
          <Button size="sm" disabled={busy || !itemCount} onClick={() => submit(false)} className="gap-1.5">
            <FileCheck className="h-4 w-4" /> {busy ? '…' : 'Sales Order'}
          </Button>
        </div>
      </div>
    </div>
  )
}
