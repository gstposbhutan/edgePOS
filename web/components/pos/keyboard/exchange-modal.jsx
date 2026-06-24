"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { X, Search, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Ctrl+E — Exchange (v1: return-from-past-order). Search a past sale, pick the
 * items to return, and request a refund for them (POST /api/pos/orders/[id]/refund,
 * which sets the order to REFUND_REQUESTED and restores stock via trigger). The
 * replacement is then rung as a separate normal sale — v1 does NOT net the two.
 *
 * @param {{ userId: string, onToast: (msg: string) => void, onClose: () => void }} props
 */
export function ExchangeModal({ userId, onToast, onClose }) {
  const router = useRouter()
  const [phase, setPhase] = useState('search')          // 'search' | 'review'
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [order, setOrder] = useState(null)              // { id, order_no }
  const [items, setItems] = useState([])                // order_items
  const [selected, setSelected] = useState({})          // { [order_item_id]: qty }
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    const term = q.trim()
    if (!term) { setResults([]); return }
    const mine = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/orders/search?q=${encodeURIComponent(term)}`)
        if (res.ok) { const d = await res.json(); if (mine === seq.current) setResults(d.results || []) }
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  async function pickOrder(o) {
    setOrder(o)
    setBusy(true)
    try {
      const res = await fetch(`/api/pos/orders/${o.id}`)
      if (res.ok) {
        const d = await res.json()
        const list = d.items || d.order?.items || []
        setItems(list)
        const init = {}
        for (const it of list) init[it.id] = it.quantity
        setSelected(init)
        setPhase('review')
      }
    } catch {}
    setBusy(false)
  }

  async function submitReturn() {
    const refundItems = Object.entries(selected)
      .filter(([, qty]) => qty > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity: Number(quantity) }))
    if (!refundItems.length || !order) return
    setBusy(true)
    try {
      const res = await fetch(`/api/pos/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refundItems, reason: 'Exchange / return', requestedBy: userId }),
      })
      if (res.ok) {
        onToast?.(`Return requested for ${order.order_no}`)
        onClose()
        router.push(`/pos/orders/${order.id}`)
      } else {
        const d = await res.json().catch(() => ({}))
        onToast?.(d.error || 'Return failed')
      }
    } catch { onToast?.('Return failed') }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {phase === 'review' && (
              <button onClick={() => { setPhase('search'); setOrder(null); setItems([]) }} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
            )}
            <h3 className="text-sm font-semibold">{phase === 'search' ? 'Exchange — find the original sale' : `Return items · ${order?.order_no ?? ''}`}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {phase === 'search' ? (
          <div className="p-3">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Invoice no (e.g. 26/1) or customer / phone…" className="pl-8 h-9" />
            </div>
            <div className="divide-y divide-border max-h-[55vh] overflow-y-auto">
              {results.map(o => (
                <button key={o.id} onClick={() => pickOrder(o)} className="w-full text-left px-2 py-2.5 hover:bg-muted/40 flex items-center justify-between">
                  <span className="font-mono text-xs">{o.order_no}</span>
                  <span className="text-xs text-muted-foreground">{o.customer_name || o.buyer_whatsapp || '—'} · Nu. {Number(o.grand_total || 0).toLocaleString('en-IN')}</span>
                </button>
              ))}
              {q.trim() && results.length === 0 && !busy && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No invoices match “{q}”.</p>}
            </div>
          </div>
        ) : (
          <div className="p-3 overflow-y-auto flex-1">
            <p className="text-[11px] text-muted-foreground mb-2">Set the quantity to return per line (0 skips it). v1 only returns items — ring the replacement as a new sale.</p>
            <div className="space-y-1">
              {items.map(it => (
                <div key={it.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50">
                  <span className="text-sm flex-1 truncate">{it.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">of {it.quantity}</span>
                  <input type="number" min="0" max={it.quantity} value={selected[it.id] ?? 0} onChange={e => setSelected(s => ({ ...s, [it.id]: Math.min(it.quantity, Math.max(0, Number(e.target.value))) }))} className="w-16 h-8 px-2 text-sm border border-input rounded bg-background text-center" />
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'review' && (
          <div className="px-4 py-2.5 border-t border-border flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={busy || !Object.values(selected).some(v => v > 0)} onClick={submitReturn}>{busy ? 'Requesting…' : 'Request return'}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
