"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft, Building2, Search, Plus, Minus, Trash2,
  ShoppingCart, Send, Loader2, Package, Boxes, AlertCircle, CheckCircle2, Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Seller-initiated B2B selling for the distributor / wholesaler consoles — the mirror of
 * DistributorRestock. Flow: pick a linked downstream buyer (a distributor sells to wholesalers, a
 * wholesaler to retailers) → browse MY OWN catalog → build a cart → choose credit or cash → sell.
 * Posts to /api/console/sales, which confirms the order immediately: my stock is deducted, the
 * order is received into the buyer's inventory, and a CREDIT sale debits the buyer's khata with me.
 */
export function SellToBuyer() {
  const [step, setStep]             = useState('buyers')   // buyers | catalog
  const [buyers, setBuyers]         = useState([])
  const [selected, setSelected]     = useState(null)
  const [catalog, setCatalog]       = useState([])
  const [cart, setCart]             = useState([])
  const [payment, setPayment]       = useState('CREDIT')
  const [mode, setMode]             = useState('INVOICE')  // INVOICE | SALES_ORDER | QUOTATION
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)
  const [success, setSuccess]       = useState(null)

  const fetchBuyers = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/console/buyers')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load buyers')
      setBuyers(data.buyers || [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  const fetchCatalog = useCallback(async (q = '') => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      const res = await fetch(`/api/console/catalog?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load catalog')
      // Only sellable, in-catalog products; the server re-validates + prices authoritatively.
      setCatalog((data.products || []).filter(p => p.is_active))
    } catch (err) { setError(err.message); setCatalog([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (step === 'buyers') fetchBuyers() }, [step, fetchBuyers])

  // Display price for a product given who we're selling to. A wholesaler buyer means we're a
  // distributor (distributor_price → wholesale → mrp); a retailer buyer means we're a wholesaler
  // (wholesale → mrp). The server is authoritative; this is just the shown estimate.
  const unitPrice = useCallback((p) => {
    const ladder = selected?.role === 'WHOLESALER'
      ? [p.distributor_price, p.wholesale_price, p.mrp]
      : [p.wholesale_price, p.mrp]
    for (const c of ladder) { const n = parseFloat(c); if (Number.isFinite(n) && n > 0) return n }
    return 0
  }, [selected])

  function selectBuyer(b) {
    setSelected(b); setStep('catalog'); setSearch(''); setCart([]); setPayment('CREDIT'); setMode('INVOICE'); fetchCatalog('')
  }
  function back() {
    setStep('buyers'); setSelected(null); setSearch(''); setCart([]); setCatalog([])
  }
  function onSearch(v) { setSearch(v); fetchCatalog(v) }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id)
      if (existing) return prev.map(c => c.product_id === product.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, {
        product_id: product.id, name: product.name, sku: product.sku,
        product_type: product.product_type || 'SINGLE',
        unit_price: unitPrice(product), stock: parseFloat(product.current_stock ?? 0), quantity: 1,
      }]
    })
  }
  function updateQty(pid, delta) {
    setCart(prev => prev.map(c => c.product_id === pid ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c))
  }
  function removeItem(pid) { setCart(prev => prev.filter(c => c.product_id !== pid)) }

  async function submit() {
    if (!selected || !cart.length) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/console/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: selected.id,
          payment_method: payment,
          mode,
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create sale')
      setSuccess({ ...data.order, _mode: mode })
      if (data.warning) setError(data.warning)
      setCart([])
      setTimeout(() => { setSuccess(null); back() }, 3500)
    } catch (err) { setError(err.message) } finally { setSubmitting(false) }
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const gstTotal = subtotal * 0.05
  const grandTotal = subtotal + gstTotal

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {step === 'catalog' && (
          <button onClick={back} className="text-muted-foreground hover:text-foreground transition-colors" title="Back to buyers">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">
            {step === 'buyers' ? 'Sell to a Buyer' : `Sell to ${selected?.name || ''}`}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === 'buyers' ? 'Pick a linked buyer, then build their order' : 'Add your products, then confirm the sale'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" />
          <p className="text-sm text-tibetan">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-emerald-500">
              {success._mode === 'QUOTATION' ? 'Quotation created' : success._mode === 'SALES_ORDER' ? 'Sales order created' : 'Sale confirmed'}
            </p>
            <p className="text-muted-foreground">{success.order_no} · {success.status}</p>
          </div>
        </div>
      )}

      {step === 'buyers' ? (
        <BuyerList buyers={buyers} loading={loading} onSelect={selectBuyer} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search your products..." value={search} onChange={e => onSearch(e.target.value)} className="pl-9" />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !catalog.length ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {search ? 'No products match your search' : 'You have no sellable products yet'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catalog.map(p => {
                  const isPkg = p.product_type === 'PACKAGE'
                  const price = unitPrice(p)
                  const avail = parseFloat(p.current_stock ?? 0)
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={avail <= 0 || price <= 0}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                        {isPkg ? <Boxes className="h-5 w-5 text-emerald-500" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-bold text-primary">Nu. {price.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">/ {p.unit || 'pcs'}</span>
                        </div>
                        <span className={`text-xs ${avail > 10 ? 'text-emerald-500' : avail > 0 ? 'text-amber-500' : 'text-tibetan'}`}>
                          {avail} in stock{price <= 0 ? ' · no price set' : ''}
                        </span>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg bg-muted/30 p-4 h-fit">
            <Cart
              items={cart} onUpdateQty={updateQty} onRemove={removeItem}
              subtotal={subtotal} gstTotal={gstTotal} grandTotal={grandTotal}
              payment={payment} setPayment={setPayment} mode={mode} setMode={setMode}
              onSubmit={submit} submitting={submitting} buyerName={selected?.name}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }

function BuyerList({ buyers, loading, onSelect }) {
  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
  }
  if (!buyers.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Building2 className="h-12 w-12 opacity-20" />
        <p className="text-sm text-center max-w-xs">No connected buyers yet — connect one from the network browser first.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Buyers</p>
      {buyers.map(b => {
        const owing = parseFloat(b.outstanding_balance ?? 0)
        return (
          <button key={b.id} onClick={() => onSelect(b)}
            className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.name}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  {b.whatsapp_no && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.whatsapp_no}</span>}
                  {owing > 0 && <span className="text-amber-600">owes {money(owing)}</span>}
                  {b.khata_status === 'FROZEN' && <span className="text-tibetan">khata frozen</span>}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

const MODES = [
  { id: 'INVOICE', label: 'Sell now' },
  { id: 'SALES_ORDER', label: 'Sales order' },
  { id: 'QUOTATION', label: 'Quotation' },
]
const SUBMIT_LABEL = { INVOICE: 'Confirm Sale', SALES_ORDER: 'Create Sales Order', QUOTATION: 'Create Quotation' }
const SUBMIT_BUSY = { INVOICE: 'Confirming sale...', SALES_ORDER: 'Creating order...', QUOTATION: 'Creating quotation...' }

function Cart({ items, onUpdateQty, onRemove, subtotal, gstTotal, grandTotal, payment, setPayment, mode, setMode, onSubmit, submitting, buyerName }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sale</p>
        {buyerName && <p className="text-xs text-muted-foreground truncate ml-2">{buyerName}</p>}
      </div>

      {!items.length ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Click products to add
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {money(item.unit_price)} × {item.quantity}
                    {item.quantity > item.stock && <span className="text-tibetan"> · over stock ({item.stock})</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateQty(item.product_id, -1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                  <button onClick={() => onUpdateQty(item.product_id, +1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"><Plus className="h-3 w-3" /></button>
                </div>
                <p className="text-xs font-bold w-16 text-right">{money(item.unit_price * item.quantity)}</p>
                <button onClick={() => onRemove(item.product_id)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-tibetan hover:bg-tibetan/10"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">GST (5%)</span><span>{money(gstTotal)}</span></div>
            <div className="flex justify-between text-sm font-bold pt-1"><span>Grand Total</span><span className="text-primary">{money(grandTotal)}</span></div>
          </div>

          {/* Document type */}
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`h-8 rounded-lg text-[11px] font-medium border transition-colors ${mode === m.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Payment method */}
          <div className="flex gap-2">
            {['CREDIT', 'CASH'].map(m => (
              <button key={m} onClick={() => setPayment(m)}
                className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${payment === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {m === 'CREDIT' ? 'Khata / Credit' : 'Cash'}
              </button>
            ))}
          </div>
          {mode !== 'INVOICE' && (
            <p className="text-[11px] text-muted-foreground">
              {mode === 'QUOTATION' ? 'A quote — no stock or credit moves until you invoice it.' : 'A sales order — stock and credit move when you fulfil it into an invoice.'}
            </p>
          )}

          <Button onClick={onSubmit} disabled={submitting || !items.length} className="w-full bg-primary hover:bg-primary/90">
            {submitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {SUBMIT_BUSY[mode]}</>
              : <><Send className="mr-2 h-4 w-4" /> {SUBMIT_LABEL[mode]}</>}
          </Button>
        </>
      )}
    </div>
  )
}
