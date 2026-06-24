"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Alt+Q — confirm converting the cart to a draft quotation (SALES_ORDER/DRAFT).
 * No payment is taken and no stock is moved; it can be turned into a sale later
 * from the order detail.
 *
 * @param {{ itemCount: number, grandTotal: number, onConfirm: () => Promise, onClose: () => void }} props
 */
export function QuotationConfirmModal({ itemCount, grandTotal, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function submit() {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Convert to Quotation</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-muted-foreground">Save this cart as a <strong>draft quotation</strong>. No payment is taken and no stock is moved — convert it to a sale later from the order detail.</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="tabular-nums">{itemCount}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Quote total</span><span className="tabular-nums font-medium">Nu. {Number(grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
        </div>
        <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !itemCount} onClick={submit}>{busy ? 'Saving…' : 'Save quotation'}</Button>
        </div>
      </div>
    </div>
  )
}
