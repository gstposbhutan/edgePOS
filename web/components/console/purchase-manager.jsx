"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, FileText, ChevronDown, ChevronRight, Loader2, Plus, Trash2, Search,
  X, Truck, PackageCheck, AlertCircle, CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Purchases from external suppliers for the distributor / wholesaler consoles. Create a Purchase
 * Order, receive it (fully or partially) into a warehouse — which creates a Purchase Invoice — then
 * confirm the invoice to stock that warehouse and (on credit) debit the supplier khata.
 */
export function PurchaseManager() {
  const [rows, setRows] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/console/purchases')
      const data = await res.json()
      if (res.ok) setRows(data.orders || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    let alive = true
    ;(async () => { try { const r = await fetch('/api/console/warehouses'); const d = await r.json(); if (alive && r.ok) setWarehouses((d.warehouses || []).filter(w => w.is_active)) } catch { /* */ } })()
    return () => { alive = false }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Purchases</h2>
          <p className="text-xs text-muted-foreground">Orders &amp; invoices from your suppliers</p>
        </div>
        <Button size="sm" onClick={() => { setError(null); setNotice(null); setCreating(true) }}><Plus className="h-4 w-4 mr-1" /> New PO</Button>
        <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2"><AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" /><p className="text-sm text-tibetan">{error}</p></div>}
      {notice && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /><p className="text-sm text-emerald-600">{notice}</p></div>}

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"><FileText className="h-12 w-12 opacity-20" /><p className="text-sm">No purchase orders yet.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(o => (
              <PurchaseRow key={o.id} order={o} warehouses={warehouses} open={openId === o.id}
                onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                onDone={(msg) => { setNotice(msg); setError(null); load() }} onError={setError} />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewPOModal onClose={() => setCreating(false)} onDone={(msg) => { setCreating(false); setNotice(msg); load() }} onError={setError} />
      )}
    </div>
  )
}

const STATUS_STYLES = {
  DRAFT: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  PARTIALLY_RECEIVED: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  CONFIRMED: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  CANCELLED: 'bg-tibetan/10 text-tibetan border border-tibetan/20',
}
function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }

function PurchaseRow({ order, warehouses, open, onToggle, onDone, onError }) {
  const isPO = order.order_type === 'PURCHASE_ORDER'
  const statusClass = STATUS_STYLES[order.status] || STATUS_STYLES.DRAFT
  const canReceive = isPO && ['DRAFT', 'PARTIALLY_RECEIVED'].includes(order.status)
  const canConfirm = !isPO && order.status === 'DRAFT'

  const [detail, setDetail] = useState(null)
  const [qty, setQty] = useState({})
  const [batch, setBatch] = useState({})
  const [warehouseId, setWarehouseId] = useState(warehouses.find(w => w.is_primary)?.id || warehouses[0]?.id || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/console/purchases/${order.id}`)
        const data = await res.json()
        if (!alive || !res.ok) return
        setDetail(data)
        const iq = {}; for (const l of data.lines || []) iq[l.id] = isPO ? l.remaining : l.quantity
        setQty(iq)
      } catch { /* */ }
    })()
    return () => { alive = false }
  }, [open, order.id, isPO])

  async function receive() {
    setBusy(true); onError(null)
    try {
      const items = (detail?.lines || [])
        .map(l => ({ order_item_id: l.id, quantity: Math.min(parseInt(qty[l.id], 10) || 0, l.remaining), batch_number: batch[l.id]?.batch_number || undefined, expires_at: batch[l.id]?.expires_at || undefined }))
        .filter(l => l.quantity > 0)
      if (!items.length) throw new Error('Enter quantities to receive')
      const res = await fetch(`/api/console/purchases/${order.id}/convert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ warehouse_id: warehouseId, items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Receive failed')
      // Auto-confirm the freshly created invoice so stock lands immediately.
      if (data.invoice?.id) {
        const cRes = await fetch(`/api/console/purchases/${data.invoice.id}/confirm`, { method: 'POST' })
        const cData = await cRes.json()
        if (!cRes.ok) throw new Error(cData.error || 'Confirm failed')
      }
      onDone(`Received ${data.invoice?.order_no || ''} into stock (PO ${data.po_status?.toLowerCase() || ''})`)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  async function confirm() {
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/console/purchases/${order.id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Confirm failed')
      onDone(`Confirmed ${data.invoice_no || order.order_no} — stock received`)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className={order.status === 'CANCELLED' ? 'opacity-70' : ''}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
        <div className="text-muted-foreground shrink-0">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{order.supplier}</p>
            <span className={`text-[10px] px-1.5 py-0 rounded ${isPO ? 'bg-muted text-muted-foreground border border-border' : 'bg-primary/10 text-primary border border-primary/20'}`}>{isPO ? 'PO' : 'Invoice'}</span>
            <span className={`text-[10px] px-1.5 py-0 rounded ${statusClass}`}>{order.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{order.order_no} · {new Date(order.created_at).toLocaleDateString()} · {order.payment_method}</p>
        </div>
        <p className="text-sm font-bold text-primary shrink-0">{money(order.grand_total)}</p>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {!detail ? <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div> : (
            <>
              <div className="rounded-lg border border-border divide-y divide-border">
                {(detail.lines || []).map(l => (
                  <div key={l.id} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{l.name}</p>
                        <p className="text-[10px] text-muted-foreground">{money(l.unit_cost ?? l.unit_price)} each{isPO ? ` · ${l.received} received of ${l.quantity}` : ` · qty ${l.quantity}`}</p></div>
                      {canReceive && l.remaining > 0 && (
                        <input type="number" min="0" max={l.remaining} value={qty[l.id] ?? ''} onChange={e => setQty(q => ({ ...q, [l.id]: e.target.value }))}
                          className="h-7 w-16 rounded-md border border-input bg-transparent px-2 text-xs text-right outline-none focus-visible:border-ring" />
                      )}
                    </div>
                    {canReceive && l.remaining > 0 && (
                      <div className="flex gap-2">
                        <input placeholder="Batch no." value={batch[l.id]?.batch_number || ''} onChange={e => setBatch(b => ({ ...b, [l.id]: { ...b[l.id], batch_number: e.target.value } }))}
                          className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring" />
                        <input type="date" value={batch[l.id]?.expires_at || ''} onChange={e => setBatch(b => ({ ...b, [l.id]: { ...b[l.id], expires_at: e.target.value } }))}
                          className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 text-[11px] outline-none focus-visible:border-ring" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {canReceive && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring">
                    <option value="">— warehouse —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <Button size="sm" disabled={busy || !warehouseId} onClick={receive}>
                    {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Receiving…</> : <><Truck className="h-4 w-4 mr-1" /> Receive into warehouse</>}
                  </Button>
                </div>
              )}
              {canConfirm && (
                <div className="flex justify-end">
                  <Button size="sm" disabled={busy} onClick={confirm}>
                    {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Confirming…</> : <><PackageCheck className="h-4 w-4 mr-1" /> Confirm receipt</>}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NewPOModal({ onClose, onDone, onError }) {
  const [supplier, setSupplier] = useState('')
  const [payment, setPayment] = useState('CREDIT')
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState([])
  const [cart, setCart] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const params = new URLSearchParams(); if (search) params.set('search', search)
      try { const r = await fetch(`/api/console/catalog?${params}`); const d = await r.json(); if (alive && r.ok) setCatalog((d.products || []).filter(p => p.is_active)) } catch { /* */ }
    })()
    return () => { alive = false }
  }, [search])

  function add(p) {
    setCart(prev => prev.find(c => c.product_id === p.id) ? prev : [...prev, { product_id: p.id, name: p.name, quantity: 1, unit_cost: p.manufacturer_price || '' }])
  }
  const upd = (id, k, v) => setCart(prev => prev.map(c => c.product_id === id ? { ...c, [k]: v } : c))
  const rm = (id) => setCart(prev => prev.filter(c => c.product_id !== id))

  async function submit() {
    setBusy(true); onError(null)
    try {
      if (!supplier.trim()) throw new Error('Supplier name is required')
      if (!cart.length) throw new Error('Add at least one product')
      const res = await fetch('/api/console/purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_name: supplier.trim(), payment_method: payment, items: cart.map(c => ({ product_id: c.product_id, quantity: Number(c.quantity), unit_cost: c.unit_cost ? Number(c.unit_cost) : undefined })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create PO')
      onDone(`Created ${data.order?.order_no || 'purchase order'}`)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-serif font-bold">New Purchase Order</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>

        <Input placeholder="Supplier / manufacturer name" value={supplier} onChange={e => setSupplier(e.target.value)} />
        <div className="flex gap-2">
          {['CREDIT', 'CASH', 'ONLINE'].map(m => (
            <button key={m} onClick={() => setPayment(m)} className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${payment === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{m === 'CREDIT' ? 'Credit' : m === 'CASH' ? 'Cash' : 'Online'}</button>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="rounded-lg border border-border divide-y divide-border">
            {cart.map(c => (
              <div key={c.product_id} className="flex items-center gap-2 px-2 py-1.5">
                <p className="flex-1 min-w-0 text-xs font-medium truncate">{c.name}</p>
                <input type="number" min="1" value={c.quantity} onChange={e => upd(c.product_id, 'quantity', e.target.value)} title="Qty" className="h-7 w-14 rounded-md border border-input bg-transparent px-1.5 text-xs text-right outline-none" />
                <input type="number" placeholder="cost" value={c.unit_cost} onChange={e => upd(c.product_id, 'unit_cost', e.target.value)} title="Unit cost" className="h-7 w-20 rounded-md border border-input bg-transparent px-1.5 text-xs text-right outline-none" />
                <button onClick={() => rm(c.product_id)} className="text-muted-foreground hover:text-tibetan"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search your products to add..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {search && (
          <div className="rounded-lg border border-border divide-y divide-border max-h-40 overflow-y-auto">
            {catalog.length === 0 ? <p className="text-xs text-muted-foreground p-3">No matches.</p> : catalog.slice(0, 20).map(p => (
              <button key={p.id} onClick={() => add(p)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left">
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 text-xs truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}

        <Button onClick={submit} disabled={busy} className="w-full">{busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create Purchase Order'}</Button>
      </div>
    </div>
  )
}
