"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Search, Package, Warehouse, PackagePlus, SlidersHorizontal, ArrowLeftRight,
  Loader2, AlertCircle, CheckCircle2, X, Boxes, History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Warehouse-scoped inventory for the distributor / wholesaler consoles. Pick a warehouse (or "All —
 * total" for the entity roll-up), then view stock levels, batches and movements, and receive / adjust
 * / transfer stock. All writes go through /api/console/inventory/* which stamp the warehouse so
 * warehouse_stock and the entity total stay in lockstep.
 */
export function InventoryManager() {
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')   // '' = all/total
  const [tab, setTab] = useState('levels')             // levels | batches | movements
  const [modal, setModal] = useState(null)             // { mode:'receive'|'adjust'|'transfer', product }
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/console/warehouses')
        const data = await res.json()
        if (alive && res.ok) setWarehouses(data.warehouses || [])
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [])

  const activeWarehouses = warehouses.filter(w => w.is_active)
  const selectedName = warehouseId ? (warehouses.find(w => w.id === warehouseId)?.name || 'Warehouse') : 'All warehouses (total)'

  return (
    <div className="space-y-4">
      {/* Heading + warehouse selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Inventory</h2>
          <p className="text-xs text-muted-foreground">{selectedName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <select
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
          >
            <option value="">All warehouses (total)</option>
            {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_primary ? ' ★' : ''}</option>)}
          </select>
        </div>
      </div>

      {warehouses.length === 0 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-700">
          No warehouses yet — add one on the Warehouses page before receiving stock.
        </div>
      )}
      {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2"><AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" /><p className="text-sm text-tibetan">{error}</p></div>}
      {notice && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /><p className="text-sm text-emerald-600">{notice}</p></div>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[['levels', 'Stock levels', Package], ['batches', 'Batches', Boxes], ['movements', 'Movements', History]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'levels' && <LevelsTab warehouseId={warehouseId} hasWarehouses={activeWarehouses.length > 0} onAction={(mode, product) => { setError(null); setNotice(null); setModal({ mode, product }) }} />}
      {tab === 'batches' && <BatchesTab warehouseId={warehouseId} />}
      {tab === 'movements' && <MovementsTab warehouseId={warehouseId} />}

      {modal && (
        <ActionModal
          mode={modal.mode}
          product={modal.product}
          warehouses={activeWarehouses}
          defaultWarehouseId={warehouseId || (activeWarehouses.find(w => w.is_primary)?.id || activeWarehouses[0]?.id || '')}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setNotice(msg); }}
          onError={setError}
        />
      )}
    </div>
  )
}

function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }

function LevelsTab({ warehouseId, hasWarehouses, onAction }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async (q) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (warehouseId) params.set('warehouse_id', warehouseId)
      if (q) params.set('search', q)
      const res = await fetch(`/api/console/inventory?${params}`)
      const data = await res.json()
      if (res.ok) setRows(data.products || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [warehouseId])

  useEffect(() => { const t = setTimeout(() => load(search), 200); return () => clearTimeout(t) }, [load, search])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No products.</div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {rows.map(p => {
            const low = p.on_hand > 0 && p.on_hand <= (p.reorder_point ?? 10)
            const out = p.on_hand <= 0
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.sku && <p className="text-[10px] text-muted-foreground">{p.sku}</p>}
                </div>
                <div className="text-right shrink-0 w-24">
                  <p className={`text-sm font-bold ${out ? 'text-tibetan' : low ? 'text-amber-600' : 'text-foreground'}`}>{p.on_hand} <span className="text-[10px] font-normal text-muted-foreground">{p.unit || ''}</span></p>
                  {out ? <p className="text-[10px] text-tibetan">out</p> : low ? <p className="text-[10px] text-amber-600">low</p> : null}
                </div>
                {hasWarehouses && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon-sm" variant="ghost" title="Receive" onClick={() => onAction('receive', p)}><PackagePlus className="h-4 w-4" /></Button>
                    <Button size="icon-sm" variant="ghost" title="Adjust" onClick={() => onAction('adjust', p)}><SlidersHorizontal className="h-4 w-4" /></Button>
                    <Button size="icon-sm" variant="ghost" title="Transfer" onClick={() => onAction('transfer', p)}><ArrowLeftRight className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BatchesTab({ warehouseId }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true; setLoading(true)
    ;(async () => {
      const params = new URLSearchParams(); if (warehouseId) params.set('warehouse_id', warehouseId)
      try { const res = await fetch(`/api/console/inventory/batches?${params}`); const d = await res.json(); if (alive && res.ok) setRows(d.batches || []) } catch { /* */ } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [warehouseId])
  if (loading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>
  if (!rows.length) return <div className="text-center py-12 text-sm text-muted-foreground">No active batches.</div>
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {rows.map(b => (
        <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{b.product_name}</p><p className="text-[10px] text-muted-foreground">Batch {b.batch_number}{b.expires_at ? ` · exp ${new Date(b.expires_at).toLocaleDateString()}` : ''}</p></div>
          {b.unit_cost != null && <p className="text-xs text-muted-foreground shrink-0">cost {money(b.unit_cost)}</p>}
          <p className="text-sm font-bold shrink-0 w-16 text-right">{b.quantity}</p>
        </div>
      ))}
    </div>
  )
}

const MV_SIGN = { SALE: '−', LOSS: '−', DAMAGED: '−', RESTOCK: '+', RETURN: '+', OPEN: '±', TRANSFER: '⇄' }
function MovementsTab({ warehouseId }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true; setLoading(true)
    ;(async () => {
      const params = new URLSearchParams(); if (warehouseId) params.set('warehouse_id', warehouseId)
      try { const res = await fetch(`/api/console/inventory/movements?${params}`); const d = await res.json(); if (alive && res.ok) setRows(d.movements || []) } catch { /* */ } finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [warehouseId])
  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>
  if (!rows.length) return <div className="text-center py-12 text-sm text-muted-foreground">No movements yet.</div>
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {rows.map(m => (
        <div key={m.id} className="flex items-center gap-3 px-4 py-2">
          <span className="text-xs font-mono w-6 text-center shrink-0">{MV_SIGN[m.movement_type] || ''}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{m.product_name}</p>
            <p className="text-[10px] text-muted-foreground">{m.movement_type}{m.warehouse_name ? ` · ${m.warehouse_name}` : ''} · {new Date(m.created_at).toLocaleString()}</p>
          </div>
          <p className={`text-sm font-bold shrink-0 ${m.quantity < 0 ? 'text-tibetan' : 'text-emerald-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</p>
        </div>
      ))}
    </div>
  )
}

function ActionModal({ mode, product, warehouses, defaultWarehouseId, onClose, onDone, onError }) {
  const [form, setForm] = useState({
    warehouse_id: defaultWarehouseId, from_warehouse_id: defaultWarehouseId,
    to_warehouse_id: warehouses.find(w => w.id !== defaultWarehouseId)?.id || '',
    quantity: '', unit_cost: '', mrp: '', selling_price: '', batch_number: '', expires_at: '',
    type: 'RESTOCK', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const title = { receive: 'Receive stock', adjust: 'Adjust stock', transfer: 'Transfer stock' }[mode]

  async function submit() {
    setBusy(true); onError(null)
    try {
      let url, body
      if (mode === 'receive') {
        url = '/api/console/inventory/receive'
        body = { product_id: product.id, warehouse_id: form.warehouse_id, quantity: Number(form.quantity),
          unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined, mrp: form.mrp ? Number(form.mrp) : undefined,
          selling_price: form.selling_price ? Number(form.selling_price) : undefined,
          batch_number: form.batch_number || undefined, expires_at: form.expires_at || undefined, notes: form.notes || undefined }
      } else if (mode === 'adjust') {
        url = '/api/console/inventory/adjust'
        body = { product_id: product.id, warehouse_id: form.warehouse_id, type: form.type, quantity: Number(form.quantity), notes: form.notes || undefined }
      } else {
        url = '/api/console/inventory/transfer'
        body = { product_id: product.id, from_warehouse_id: form.from_warehouse_id, to_warehouse_id: form.to_warehouse_id, quantity: Number(form.quantity), notes: form.notes || undefined }
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onDone(`${title} — ${product.name} done`)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  const num = (k, ph, extra = {}) => (
    <input type="number" placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)} {...extra}
      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
  )
  const whSelect = (k) => (
    <select value={form[k]} onChange={e => set(k, e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring">
      <option value="">— warehouse —</option>
      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-serif font-bold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground truncate">{product.name}</p>

        {mode === 'transfer' ? (
          <>
            <label className="text-xs text-muted-foreground">From</label>{whSelect('from_warehouse_id')}
            <label className="text-xs text-muted-foreground">To</label>{whSelect('to_warehouse_id')}
            <label className="text-xs text-muted-foreground">Quantity</label>{num('quantity', 'Qty', { min: 1 })}
          </>
        ) : mode === 'adjust' ? (
          <>
            <label className="text-xs text-muted-foreground">Warehouse</label>{whSelect('warehouse_id')}
            <label className="text-xs text-muted-foreground">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring">
              <option value="RESTOCK">Add (found extra)</option>
              <option value="LOSS">Loss</option>
              <option value="DAMAGED">Damaged</option>
              <option value="COUNT">Set to counted quantity</option>
            </select>
            <label className="text-xs text-muted-foreground">{form.type === 'COUNT' ? 'Counted quantity' : 'Quantity'}</label>{num('quantity', 'Qty', { min: 0 })}
          </>
        ) : (
          <>
            <label className="text-xs text-muted-foreground">Warehouse</label>{whSelect('warehouse_id')}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Quantity</label>{num('quantity', 'Qty', { min: 1 })}</div>
              <div><label className="text-xs text-muted-foreground">Unit cost</label>{num('unit_cost', 'Cost')}</div>
              <div><label className="text-xs text-muted-foreground">MRP</label>{num('mrp', 'MRP')}</div>
              <div><label className="text-xs text-muted-foreground">Sell price</label>{num('selling_price', 'Sell')}</div>
            </div>
            <label className="text-xs text-muted-foreground">Batch no. (optional)</label>
            <input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} placeholder="auto" className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
            <label className="text-xs text-muted-foreground">Expiry (optional)</label>
            <input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />
          </>
        )}

        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : title}
        </Button>
      </div>
    </div>
  )
}
