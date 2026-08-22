"use client"

import { useState, useEffect } from "react"
import { Loader2, Check } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Explicit batch-override picker: list a product's in-stock batches (oldest expiry first) so the
 * cashier can bill from a specific batch. Selecting one calls onSelect(batchId) — the caller
 * switches the cart line to that batch (re-priced to the batch's price).
 *
 * @param {{ open:boolean, productId:string, productName?:string, currentBatchId?:string,
 *           onSelect:(batchId:string)=>void, onClose:()=>void }} props
 */
export function BatchPickerModal({ open, productId, productName, currentBatchId, onSelect, onClose }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !productId) return
    setLoading(true)
    fetch('/api/pos/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: [productId] }),
    })
      .then(r => (r.ok ? r.json() : { batches: [] }))
      .then(d => setBatches(d.batches || []))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false))
  }, [open, productId])

  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No expiry'
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Choose batch</DialogTitle>
          <DialogDescription>{productName ? `${productName} — ` : ''}pick which batch to bill from.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No in-stock batches.</div>
        ) : (
          <div className="space-y-1.5">
            {batches.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => { onSelect(b.id); onClose() }}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${b.id === currentBatchId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{b.batch_number || `Batch ${String(b.id).slice(0, 8)}`}</span>
                    {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">oldest</span>}
                    {b.id === currentBatchId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Exp {fmtDate(b.expires_at)} · {b.quantity} in stock</div>
                </div>
                <div className="text-sm font-semibold text-foreground shrink-0">Nu. {parseFloat(b.selling_price ?? b.mrp ?? 0).toFixed(2)}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
