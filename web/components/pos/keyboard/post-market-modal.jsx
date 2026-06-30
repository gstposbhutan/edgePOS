"use client"

import { useState, useEffect } from "react"
import { X, Store } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Alt+M — Post to Market (v1). Marks the cart's products visible on the consumer
 * marketplace (products.visible_on_web). Full marketplace listing/checkout is a
 * later step; this just flips visibility.
 *
 * @param {{ items: any[], onDone: (msg: string) => void, onClose: () => void }} props
 */
export function PostMarketModal({ items, onDone, onClose }) {
  const [busy, setBusy] = useState(false)
  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))]

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function list() {
    setBusy(true)
    try {
      const res = await fetch('/api/pos/products/market-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onDone?.(`${productIds.length} product${productIds.length === 1 ? '' : 's'} now visible on the marketplace`); onClose() }
      else onDone?.(d.error || 'Failed to list')
    } catch { onDone?.('Failed to list') }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Store className="h-4 w-4" /> Post to Market</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">Mark <strong>{productIds.length}</strong> product{productIds.length === 1 ? '' : 's'} from this cart as visible on the consumer marketplace.</p>
          <p className="text-[11px] text-muted-foreground">Full marketplace listing/checkout comes later — for now this flips the visibility flag on each product.</p>
        </div>
        <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !productIds.length} onClick={list}>{busy ? 'Listing…' : 'Post to market'}</Button>
        </div>
      </div>
    </div>
  )
}
