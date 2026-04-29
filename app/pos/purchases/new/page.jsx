"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Search, Trash2, Minus, Plus,
  Building2, Calendar, FileText, Loader2, CheckCircle, X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { getUser, getRoleClaims } from "@/lib/auth"
import { usePurchases } from "@/hooks/use-purchases"

// ── Fullscreen product search modal (same pattern as /salesorder) ─────────────
function ProductSearchModal({ open, initialQuery, entityId, onAdd, onClose }) {
  const supabase = createClient()
  const [query,    setQuery]    = useState(initialQuery)
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [qty,      setQty]      = useState('1')
  const [cost,     setCost]     = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) { setQuery(initialQuery); setResults([]); setSelected(0); setQty('1'); setCost('')
      setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open, initialQuery])

  useEffect(() => {
    if (!query.trim() || !entityId) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      // Query distinct products this entity has batches for
      const { data } = await supabase
        .from('product_batches')
        .select('unit_cost, mrp, products!inner(id, name, sku, wholesale_price, unit)')
        .eq('entity_id', entityId)
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`, { referencedTable: 'products' })
        .order('batch_number', { ascending: false })
        .limit(20)

      // Deduplicate by product_id, keeping most recent batch cost
      const seen = new Map()
      for (const b of (data || [])) {
        if (!seen.has(b.products.id)) seen.set(b.products.id, {
          ...b.products,
          wholesale_price: b.unit_cost ?? b.mrp ?? b.products.wholesale_price,
        })
      }
      setResults([...seen.values()].slice(0, 9))
      setSelected(0)
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query, entityId])

  function handleAdd(product) {
    const q = Math.max(1, parseInt(qty, 10) || 1)
    const c = cost ? parseFloat(cost) : parseFloat(product.wholesale_price || product.mrp || 0)
    onAdd(product, q, c); onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => results.length > 0 ? (s + 1) % results.length : 0) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => results.length > 0 ? (s - 1 + results.length) % results.length : 0) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[selected]) handleAdd(results[selected]) }
    else if (/^[1-9]$/.test(e.key) && !e.ctrlKey) {
      const idx = parseInt(e.key, 10) - 1
      if (results[idx]) { e.preventDefault(); handleAdd(results[idx]) }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown} placeholder="Search product name or SKU..."
          className="flex-1 text-base bg-transparent outline-none text-foreground placeholder:text-muted-foreground" />
        {query && <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        <button onClick={onClose} className="text-xs text-muted-foreground px-2 py-1 rounded border border-border">Esc</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="p-4 text-sm text-center text-muted-foreground">Searching...</div>
        : results.length === 0 && query ? <div className="p-8 text-center text-muted-foreground text-sm">No products found</div>
        : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="text-right px-4 py-2">Stock</th>
              <th className="text-right px-4 py-2">Wholesale</th>
            </tr></thead>
            <tbody>
              {results.map((p, i) => (
                <tr key={p.id} onClick={() => handleAdd(p)} onMouseEnter={() => setSelected(i)}
                  className={`border-b border-border cursor-pointer ${i === selected ? 'bg-primary/10' : 'hover:bg-muted/30'}`}>
                  <td className="px-2 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${i === selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground'}`}>{i+1}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{p.current_stock}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    Nu. {parseFloat(p.wholesale_price || p.mrp || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 flex items-center gap-6 bg-muted/20">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Qty:</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
            className="w-16 px-2 py-1 text-sm border border-input rounded bg-background text-center" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Unit Cost:</label>
          <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
            placeholder="From product" className="w-24 px-2 py-1 text-sm border border-input rounded bg-background text-center" />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>1–9 add · ↑↓ navigate · Enter add · Esc close</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const supabase = createClient()
  const { createPO } = usePurchases()

  const [entity,        setEntity]        = useState(null)
  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierResults, setSupplierResults] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [supplierRef,   setSupplierRef]   = useState('')
  const [expectedDate,  setExpectedDate]  = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CREDIT')
  const [items,         setItems]         = useState([])
  const [selectedRow,   setSelectedRow]   = useState(0)
  const [editRow,       setEditRow]       = useState(null)
  const [editQty,       setEditQty]       = useState('')
  const [editQtyRef]                      = useState({ current: null })
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [pendingChar,   setPendingChar]   = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [done,          setDone]          = useState(null)

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }
      const { entityId } = getRoleClaims(user)
      if (!entityId) { router.push('/pos'); return }
      const { data } = await supabase.from('entities').select('id, name, tpn_gstin').eq('id', entityId).single()
      setEntity(data)
    }
    init()
  }, [])

  // ── Supplier search ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supplierQuery.trim() || selectedSupplier) { setSupplierResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('entities')
        .select('id, name, whatsapp_no').eq('role', 'WHOLESALER').ilike('name', `%${supplierQuery}%`).limit(8)
      setSupplierResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [supplierQuery, selectedSupplier])

  // ── Cart ────────────────────────────────────────────────────────────────────
  function addToCart(product, qty, cost) {
    setItems(prev => {
      const ex = prev.find(i => i.product_id === product.id)
      if (ex) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + qty } : i)
      return [...prev, { product_id: product.id, name: product.name, sku: product.sku, unit_cost: cost, quantity: qty }]
    })
    setSelectedRow(items.length)
  }

  function removeItem(pid) { setItems(prev => prev.filter(i => i.product_id !== pid)) }
  function updateQty(pid, qty) {
    if (qty < 1) { removeItem(pid); return }
    setItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: qty } : i))
  }

  const subtotal   = items.reduce((s, i) => s + i.unit_cost * i.quantity, 0)
  const grandTotal = parseFloat(subtotal.toFixed(2))

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (loading || done || searchOpen) return
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (inInput) return
      if (e.key === 'Escape')    { router.back(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r+1)%items.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r-1+items.length)%items.length); return }
      if (e.key === 'Delete')    { e.preventDefault(); if (items[selectedRow]) removeItem(items[selectedRow].product_id); return }
      if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault()
        setEditRow(selectedRow); setEditQty(String(items[selectedRow]?.quantity ?? 1))
        setTimeout(() => editQtyRef.current?.select(), 20); return
      }
      if (e.key === 'F5' && items.length > 0) { e.preventDefault(); handleSubmit(); return }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); setPendingChar(e.key); setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loading, done, searchOpen, items, selectedRow])

  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return }
    if (selectedRow >= items.length) setSelectedRow(items.length - 1)
  }, [items.length])

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedSupplier && !supplierQuery.trim()) { setError('Select or enter a supplier'); return }
    if (items.length === 0) { setError('Add at least one item'); return }
    setLoading(true); setError(null)
    try {
      const order = await createPO({
        supplier_id:       selectedSupplier?.id || null,
        supplier_name:     selectedSupplier ? null : supplierQuery.trim(),
        supplier_ref:      supplierRef.trim() || undefined,
        expected_delivery: expectedDate || undefined,
        payment_method:    paymentMethod,
        items:             items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost })),
      })
      setDone(order)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex h-screen items-center justify-center bg-background flex-col gap-4">
        <CheckCircle className="h-16 w-16 text-emerald-500" />
        <h2 className="text-xl font-bold">Purchase Order Created</h2>
        <p className="text-muted-foreground font-mono">{done.order_no}</p>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={() => { setDone(null); setItems([]); setSupplierQuery(''); setSelectedSupplier(null) }}>New PO</Button>
          <Button onClick={() => router.push('/pos/purchases')}>View Purchases</Button>
        </div>
      </div>
    )
  }

  if (!entity) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  const PAYMENT_METHODS = ['ONLINE', 'CASH', 'CREDIT']

  return (
    <div className="flex flex-col h-screen bg-background select-none">
      <header className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0 bg-muted/10">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <p className="text-sm font-bold">New Purchase Order</p>
          <p className="text-xs text-muted-foreground">{entity.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm tabular-nums">
          {items.length > 0 && <><span className="text-muted-foreground">{items.length} item{items.length > 1 ? 's' : ''}</span><span className="font-bold text-primary">Nu. {grandTotal.toFixed(2)}</span></>}
        </div>
      </header>

      {error && <div className="px-4 py-2 bg-tibetan/10 border-b border-tibetan/30 text-sm text-tibetan shrink-0">{error}</div>}

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Supplier details */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col p-4 gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier</p>

          {/* Supplier search */}
          <div className="relative">
            <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={selectedSupplier ? selectedSupplier.name : supplierQuery}
              onChange={e => { setSupplierQuery(e.target.value); setSelectedSupplier(null) }}
              placeholder="Search or enter supplier..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          {supplierResults.length > 0 && !selectedSupplier && (
            <div className="border border-border rounded-lg overflow-hidden shadow-sm">
              {supplierResults.map(s => (
                <button key={s.id} type="button" onClick={() => { setSelectedSupplier(s); setSupplierQuery(s.name); setSupplierResults([]) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left border-b border-border last:border-0">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div><p className="font-medium">{s.name}</p>{s.whatsapp_no && <p className="text-xs text-muted-foreground">{s.whatsapp_no}</p>}</div>
                </button>
              ))}
            </div>
          )}
          {selectedSupplier && (
            <button onClick={() => { setSelectedSupplier(null); setSupplierQuery('') }} className="text-xs text-muted-foreground hover:text-tibetan self-start">
              ✕ Clear supplier
            </button>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Supplier Reference</label>
            <Input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="Their PO/invoice no." className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Expected Delivery</label>
            <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-8 text-sm" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-input rounded-md bg-background">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="border-t border-border pt-3">
            <Button variant="outline" className="w-full h-8 text-xs gap-2 justify-start text-muted-foreground" onClick={() => setSearchOpen(true)}>
              <Search className="h-3.5 w-3.5" /> Search products...
            </Button>
          </div>

          <div className="mt-auto pt-4 border-t border-border space-y-1">
            {[['Any key','Open product search'],['↑↓','Navigate rows'],['Enter','Edit qty'],['Del','Remove row'],['F5','Save PO'],['Esc','Go back']].map(([k,v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-muted border border-border rounded min-w-[44px] text-center">{k}</span>
                <span className="text-[10px] text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Line items */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <FileText className="h-10 w-10 opacity-20" />
                <p className="text-sm">Press any key to search and add products</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/30 border-b border-border">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 w-8">#</th>
                    <th className="text-left px-4 py-2">Product</th>
                    <th className="text-center px-4 py-2 w-32">Qty</th>
                    <th className="text-right px-4 py-2 w-28">Unit Cost</th>
                    <th className="text-right px-4 py-2 w-28">Total</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const isSelected = selectedRow === i
                    const isEditing  = editRow === i
                    const total = (item.unit_cost * item.quantity).toFixed(2)
                    return (
                      <tr key={item.product_id} onClick={() => setSelectedRow(i)}
                        className={`border-b border-border cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/20'}`}>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{isSelected ? <span className="text-primary">►</span> : i+1}</td>
                        <td className="px-4 py-2.5">
                          <p className="truncate max-w-[220px]">{item.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isEditing ? (
                            <input ref={el => editQtyRef.current = el} type="number" min="1" value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              onBlur={() => { updateQty(item.product_id, parseInt(editQty,10)||1); setEditRow(null) }}
                              onKeyDown={e => { if (e.key==='Enter'){updateQty(item.product_id,parseInt(editQty,10)||1);setEditRow(null)} if(e.key==='Escape')setEditRow(null) }}
                              onClick={e => e.stopPropagation()}
                              className="w-16 px-1 py-0.5 text-sm text-center border border-primary rounded bg-background outline-none" />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={e=>{e.stopPropagation();updateQty(item.product_id,item.quantity-1)}} className="h-6 w-6 rounded border border-border hover:bg-muted/50 flex items-center justify-center"><Minus className="h-3 w-3"/></button>
                              <button onClick={e=>{e.stopPropagation();setEditRow(i);setEditQty(String(item.quantity));setTimeout(()=>editQtyRef.current?.select(),20)}} className={`w-10 text-center font-medium ${isSelected?'border border-primary/50 rounded bg-background':''}`}>{item.quantity}</button>
                              <button onClick={e=>{e.stopPropagation();updateQty(item.product_id,item.quantity+1)}} className="h-6 w-6 rounded border border-border hover:bg-muted/50 flex items-center justify-center"><Plus className="h-3 w-3"/></button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">Nu. {item.unit_cost.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">Nu. {total}</td>
                        <td className="px-2 py-2"><button onClick={e=>{e.stopPropagation();removeItem(item.product_id)}} className="text-muted-foreground hover:text-tibetan transition-colors"><Trash2 className="h-4 w-4"/></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-border px-4 py-3 space-y-3 shrink-0 bg-muted/10">
            {items.length > 0 && (
              <div className="flex items-center justify-end gap-6 text-sm tabular-nums">
                <span className="text-muted-foreground">Subtotal (ex-GST): <strong>Nu. {grandTotal.toFixed(2)}</strong></span>
                <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">GST charged by supplier on their invoice · not tracked here</p>
              <Button onClick={handleSubmit} disabled={loading || items.length === 0} className="h-10 px-8 text-sm">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Saving...</> : 'Save Purchase Order [F5]'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ProductSearchModal open={searchOpen} initialQuery={pendingChar} entityId={entity?.id}
        onAdd={(p, q, c) => { addToCart(p, q, c); setPendingChar('') }}
        onClose={() => { setSearchOpen(false); setPendingChar('') }}
      />
    </div>
  )
}
