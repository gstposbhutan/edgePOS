"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Trash2, Minus, Plus,
  Phone, MapPin, Navigation, Loader2, CheckCircle, X, Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { getUser, getRoleClaims } from "@/lib/auth"

// ── Fullscreen product search modal (same pattern as keyboard POS) ──────────
function ProductSearchModal({ open, initialQuery, entityId, onAdd, onClose }) {
  const supabase = createClient()
  const [query,    setQuery]    = useState(initialQuery)
  const [results,  setResults]  = useState([])
  const [selected, setSelected] = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [qty,      setQty]      = useState('1')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setResults([])
      setSelected(0)
      setQty('1')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open, initialQuery])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (/^\d{8,}$/.test(query.trim())) {
      // Barcode — exact lookup, add immediately
      setLoading(true)
      supabase.from('sellable_products')
        .select('id, name, sku, mrp, available_stock, unit')
        .eq('sku', query.trim()).gt('available_stock', 0).limit(1)
        .then(({ data }) => {
          if (data?.[0]) { onAdd(data[0], parseInt(qty, 10) || 1); onClose() }
          setLoading(false)
        })
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase.from('sellable_products')
        .select('id, name, sku, mrp, available_stock, unit')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .gt('available_stock', 0).order('name').limit(9)
      setResults(data || [])
      setSelected(0)
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function handleAdd(product) {
    onAdd(product, Math.max(1, parseInt(qty, 10) || 1))
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => results.length > 0 ? (s + 1) % results.length : 0); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => results.length > 0 ? (s - 1 + results.length) % results.length : 0); return }
    if (e.key === 'Enter')     { e.preventDefault(); if (results[selected]) handleAdd(results[selected]); return }
    if (/^[1-9]$/.test(e.key) && !e.ctrlKey) {
      const idx = parseInt(e.key, 10) - 1
      if (results[idx]) { e.preventDefault(); handleAdd(results[idx]) }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Search input */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search product name or SKU, or scan barcode..."
          className="flex-1 text-base bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border"
        >
          Esc
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground text-center">Searching...</div>
        ) : results.length === 0 && query.trim() ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm">No products found for "{query}"</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-left px-4 py-2 font-medium">SKU</th>
                <th className="text-right px-4 py-2 font-medium">Stock</th>
                <th className="text-right px-4 py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {results.map((product, i) => (
                <tr
                  key={product.id}
                  onClick={() => handleAdd(product)}
                  onMouseEnter={() => setSelected(i)}
                  className={`border-b border-border cursor-pointer transition-colors ${
                    i === selected ? 'bg-primary/10' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-2 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${
                      i === selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">{product.name}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{product.sku}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{product.available_stock}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">Nu. {parseFloat(product.mrp).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom hints + qty */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-6 bg-muted/20">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Qty:</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[selected]) handleAdd(results[selected]) } }}
            className="w-16 px-2 py-1 text-sm border border-input rounded bg-background text-center"
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>1–9 add directly</span>
          <span>Enter add selected</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SalesOrderPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [entity,    setEntity]    = useState(null)
  const [token,     setToken]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [name,      setName]      = useState('')
  const [address,   setAddress]   = useState('')
  const [lat,       setLat]       = useState(null)
  const [lng,       setLng]       = useState(null)
  const [locating,  setLocating]  = useState(false)
  const [items,     setItems]     = useState([])
  const [editRow,   setEditRow]   = useState(null)
  const [editQty,   setEditQty]   = useState('')
  const [selectedRow, setSelectedRow] = useState(0)
  const [searchOpen,  setSearchOpen]  = useState(false)
  const [pendingChar, setPendingChar] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [done,      setDone]      = useState(null)

  const phoneRef   = useRef(null)
  const editQtyRef = useRef(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }
      const { entityId } = getRoleClaims(user)
      if (!entityId) { router.push('/pos'); return }
      const { data } = await supabase.from('entities').select('id, name, tpn_gstin').eq('id', entityId).single()
      setEntity(data)
      const { data: { session } } = await supabase.auth.getSession()
      setToken(session?.access_token ?? '')
      setTimeout(() => phoneRef.current?.focus(), 100)
    }
    init()
  }, [])

  // Snap selected row when items change
  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return }
    if (selectedRow >= items.length) setSelectedRow(items.length - 1)
  }, [items.length])

  // ── Cart ──────────────────────────────────────────────────────────────────
  function addToCart(product, qty = 1) {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + qty } : i)
      return [...prev, { product_id: product.id, name: product.name, sku: product.sku, mrp: parseFloat(product.mrp), quantity: qty }]
    })
    setSelectedRow(items.length)
  }

  function removeItem(productId) { setItems(prev => prev.filter(i => i.product_id !== productId)) }
  function updateQty(productId, qty) {
    if (qty < 1) { removeItem(productId); return }
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: qty } : i))
  }

  const subtotal   = items.reduce((s, i) => s + i.mrp * i.quantity, 0)
  const gstTotal   = parseFloat((subtotal * 0.05).toFixed(2))
  const grandTotal = parseFloat((subtotal + gstTotal).toFixed(2))

  // ── GPS ───────────────────────────────────────────────────────────────────
  function handleGps() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocating(false) },
      () => setLocating(false)
    )
  }

  // ── Global keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (loading || done || searchOpen) return
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (inInput) return

      if (e.key === 'Escape')    { e.preventDefault(); router.back(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r + 1) % items.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r - 1 + items.length) % items.length); return }
      if (e.key === 'Delete')    { e.preventDefault(); if (items[selectedRow]) removeItem(items[selectedRow].product_id); return }
      if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault()
        setEditRow(selectedRow)
        setEditQty(String(items[selectedRow]?.quantity ?? 1))
        setTimeout(() => editQtyRef.current?.select(), 20)
        return
      }
      if (e.key === 'F5' && items.length > 0 && phone.trim()) { e.preventDefault(); handleSubmit(); return }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        setPendingChar(e.key)
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loading, done, searchOpen, items, selectedRow, phone])

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!phone.trim()) { phoneRef.current?.focus(); return }
    if (items.length === 0) return
    setLoading(true); setError(null)
    try {
      const normalPhone = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`

      // Ensure a khata account exists for this customer before placing the order.
      // The DB trigger (khata_debit_on_confirm) requires one for CREDIT orders.
      const khataCheck = await supabase
        .from('khata_accounts')
        .select('id')
        .eq('creditor_entity_id', entity.id)
        .eq('debtor_phone', normalPhone)
        .eq('party_type', 'CONSUMER')
        .in('status', ['ACTIVE', 'FROZEN'])
        .limit(1)
        .single()

      if (!khataCheck.data) {
        // Resolve customer name
        const { data: customerEntity } = await supabase
          .from('entities').select('name').eq('whatsapp_no', normalPhone).single()

        const { error: khataErr } = await supabase
          .from('khata_accounts')
          .insert({
            creditor_entity_id: entity.id,
            party_type:   'CONSUMER',
            debtor_phone: normalPhone,
            debtor_name:  name.trim() || customerEntity?.name || `Customer ${normalPhone.slice(-4)}`,
            credit_limit: 1000,
          })

        if (khataErr) {
          setError('Failed to set up credit account: ' + khataErr.message)
          return
        }
      }

      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_whatsapp: normalPhone,
          customer_name: name.trim() || undefined,
          delivery_address: address.trim() || undefined,
          delivery_lat: lat ?? undefined,
          delivery_lng: lng ?? undefined,
          items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setDone({ order_no: data.order.order_no })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setDone(null); setItems([]); setPhone(''); setName(''); setAddress(''); setLat(null); setLng(null); setError(null)
    setTimeout(() => phoneRef.current?.focus(), 50)
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex h-screen items-center justify-center bg-background flex-col gap-4">
        <CheckCircle className="h-16 w-16 text-emerald-500" />
        <h2 className="text-xl font-bold">Order Created</h2>
        <p className="text-muted-foreground font-mono">{done.order_no}</p>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" onClick={resetForm}>New Order</Button>
          <Button onClick={() => router.push('/pos/orders')}>View Orders</Button>
        </div>
      </div>
    )
  }

  if (!entity) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="flex flex-col h-screen bg-background select-none">
      {/* Header */}
      <header className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0 bg-muted/10">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-sm font-bold">New Sales Order</p>
          <p className="text-xs text-muted-foreground">{entity.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm tabular-nums">
          {items.length > 0 && (
            <>
              <span className="text-muted-foreground">{items.length} item{items.length > 1 ? 's' : ''}</span>
              <span className="font-bold text-primary">Nu. {grandTotal.toFixed(2)}</span>
            </>
          )}
        </div>
      </header>

      {error && <div className="px-4 py-2 bg-tibetan/10 border-b border-tibetan/30 text-sm text-tibetan shrink-0">{error}</div>}

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Customer details (narrow) */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col p-4 gap-2.5 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</p>
          <div className="relative">
            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={phoneRef}
              type="tel"
              placeholder="+975 17 123 456 *"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Input
            placeholder="Customer name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="relative">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Delivery address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleGps} disabled={locating} className="h-7 text-xs gap-1.5">
            <Navigation className="h-3 w-3" />
            {locating ? 'Getting...' : lat ? `GPS ✓` : 'Use GPS'}
          </Button>

          <div className="border-t border-border pt-3 mt-1">
            <p className="text-xs text-muted-foreground mb-2">Press any key or click below to search</p>
            <Button
              variant="outline"
              className="w-full h-8 text-xs gap-2 justify-start text-muted-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              Search products...
            </Button>
          </div>

          <div className="mt-auto pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Shortcuts</p>
            {[
              ['Any key', 'Open product search'],
              ['↑↓', 'Navigate rows'],
              ['Enter', 'Edit qty'],
              ['Del', 'Remove row'],
              ['F5', 'Place order'],
              ['Esc', 'Go back'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-muted border border-border rounded text-foreground min-w-[44px] text-center">{k}</span>
                <span className="text-[10px] text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Order table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Search className="h-10 w-10 opacity-20" />
                <p className="text-sm">Press any key to search and add products</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/30 border-b border-border">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 w-8">#</th>
                    <th className="text-left px-4 py-2">Product</th>
                    <th className="text-center px-4 py-2 w-32">Qty</th>
                    <th className="text-right px-4 py-2 w-24">Unit</th>
                    <th className="text-right px-4 py-2 w-28">Total</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const isSelected = selectedRow === i
                    const isEditing  = editRow === i
                    const total = (item.mrp * item.quantity * 1.05).toFixed(2)
                    return (
                      <tr
                        key={item.product_id}
                        onClick={() => setSelectedRow(i)}
                        className={`border-b border-border cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/20'}`}
                      >
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {isSelected ? <span className="text-primary">►</span> : i + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate max-w-[220px]">{item.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isEditing ? (
                            <input
                              ref={editQtyRef}
                              type="number" min="1"
                              value={editQty}
                              onChange={e => setEditQty(e.target.value)}
                              onBlur={() => { updateQty(item.product_id, parseInt(editQty, 10) || 1); setEditRow(null) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  { updateQty(item.product_id, parseInt(editQty, 10) || 1); setEditRow(null) }
                                if (e.key === 'Escape') setEditRow(null)
                              }}
                              onClick={e => e.stopPropagation()}
                              className="w-16 px-1 py-0.5 text-sm text-center border border-primary rounded bg-background outline-none"
                            />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={e => { e.stopPropagation(); updateQty(item.product_id, item.quantity - 1) }} className="h-6 w-6 rounded border border-border hover:bg-muted/50 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                              <button
                                onClick={e => { e.stopPropagation(); setEditRow(i); setEditQty(String(item.quantity)); setTimeout(() => editQtyRef.current?.select(), 20) }}
                                className={`w-10 text-center font-medium ${isSelected ? 'border border-primary/50 rounded bg-background' : 'hover:text-primary'}`}
                              >{item.quantity}</button>
                              <button onClick={e => { e.stopPropagation(); updateQty(item.product_id, item.quantity + 1) }} className="h-6 w-6 rounded border border-border hover:bg-muted/50 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">Nu. {item.mrp.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">Nu. {total}</td>
                        <td className="px-2 py-2">
                          <button onClick={e => { e.stopPropagation(); removeItem(item.product_id) }} className="text-muted-foreground hover:text-tibetan transition-colors"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals + Place Order */}
          <div className="border-t border-border px-4 py-3 space-y-3 shrink-0 bg-muted/10">
            {items.length > 0 && (
              <div className="flex items-center justify-end gap-6 text-sm tabular-nums">
                <span className="text-muted-foreground">Subtotal: <strong>Nu. {subtotal.toFixed(2)}</strong></span>
                <span className="text-muted-foreground">GST (5%): <strong>Nu. {gstTotal.toFixed(2)}</strong></span>
                <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Payment collected after delivery · Customer notified via WhatsApp</p>
              <Button
                onClick={handleSubmit}
                disabled={loading || items.length === 0 || !phone.trim()}
                className="h-10 px-8 text-sm"
              >
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Placing...</>
                  : 'Place Order [F5]'
                }
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen product search modal */}
      <ProductSearchModal
        open={searchOpen}
        initialQuery={pendingChar}
        entityId={entity?.id}
        onAdd={(product, qty) => { addToCart(product, qty); setPendingChar('') }}
        onClose={() => { setSearchOpen(false); setPendingChar('') }}
      />
    </div>
  )
}
