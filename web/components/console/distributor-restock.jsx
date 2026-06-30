"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft, Building2, Star, CheckCircle, Search, Plus, Minus, Trash2,
  ShoppingCart, Send, Loader2, Package, AlertCircle, CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Order-supplies section for the wholesaler console — the retailer RestockModal flow rebuilt as a
 * console page, one tier up. Flow: pick a linked distributor → browse its catalog → build a cart →
 * place the order. It hits the console suppliers/catalog/orders APIs (not the retailer routes), and
 * the order is CREDIT, which debits the wholesaler's khata with the distributor automatically.
 */
export function DistributorRestock() {
  const [step, setStep]               = useState('suppliers') // suppliers | catalog
  const [suppliers, setSuppliers]     = useState([])
  const [selected, setSelected]       = useState(null)
  const [catalog, setCatalog]         = useState([])
  const [cart, setCart]               = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState(null)
  const [success, setSuccess]         = useState(null)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/console/suppliers')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load suppliers')
      setSuppliers(data.suppliers || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCatalog = useCallback(async (distributorId, q = '') => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      const res = await fetch(`/api/console/suppliers/${distributorId}/catalog?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load catalog')
      setCatalog(data.products || [])
    } catch (err) {
      setError(err.message)
      setCatalog([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step === 'suppliers') fetchSuppliers()
  }, [step, fetchSuppliers])

  function selectSupplier(s) {
    setSelected(s)
    setStep('catalog')
    setSearch('')
    setCart([])
    fetchCatalog(s.id, '')
  }

  function back() {
    setStep('suppliers')
    setSelected(null)
    setSearch('')
    setCart([])
    setCatalog([])
  }

  function onSearch(value) {
    setSearch(value)
    if (selected) fetchCatalog(selected.id, value)
  }

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id)
      if (existing) {
        return prev.map(c => c.product_id === product.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: parseFloat(product.distributor_price),
        quantity: 1,
      }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev => prev.map(c =>
      c.product_id === productId ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c
    ))
  }

  function removeItem(productId) {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  async function submit() {
    if (!selected || !cart.length) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/console/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: selected.id,
          items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to place order')
      setSuccess(data.order)
      setCart([])
      setTimeout(() => { setSuccess(null); back() }, 3500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const gstTotal = subtotal * 0.05
  const grandTotal = subtotal + gstTotal

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="flex items-center gap-3">
        {step === 'catalog' && (
          <button onClick={back} className="text-muted-foreground hover:text-foreground transition-colors" title="Back to suppliers">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">
            {step === 'suppliers' ? 'Order Supplies' : selected?.name || 'Browse Catalog'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === 'suppliers' ? 'Restock from a linked distributor' : (selected?.category || 'Distributor catalog')}
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
            <p className="font-medium text-emerald-500">Order placed successfully</p>
            <p className="text-muted-foreground">{success.order_no} · {success.status}</p>
          </div>
        </div>
      )}

      {step === 'suppliers' ? (
        <SupplierList suppliers={suppliers} loading={loading} onSelect={selectSupplier} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Catalog */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={search} onChange={e => onSearch(e.target.value)} className="pl-9" />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !catalog.length ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {search ? 'No products match your search' : 'This distributor has no sellable products yet'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catalog.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm font-bold text-primary">Nu. {parseFloat(p.distributor_price).toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">/ {p.unit || 'pcs'}</span>
                      </div>
                      <span className={`text-xs ${p.current_stock > 10 ? 'text-emerald-500' : p.current_stock > 0 ? 'text-amber-500' : 'text-tibetan'}`}>
                        {p.current_stock} in stock
                      </span>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="border border-border rounded-lg bg-muted/30 p-4 h-fit">
            <Cart
              items={cart}
              onUpdateQty={updateQty}
              onRemove={removeItem}
              subtotal={subtotal}
              gstTotal={gstTotal}
              grandTotal={grandTotal}
              onSubmit={submit}
              submitting={submitting}
              supplierName={selected?.name}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SupplierList({ suppliers, loading, onSelect }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
      </div>
    )
  }
  if (!suppliers.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Building2 className="h-12 w-12 opacity-20" />
        <p className="text-sm">No linked distributors yet</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Distributors</p>
      {suppliers.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s)}
          className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.is_primary && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                    <Star className="h-3 w-3 fill-primary" /> Primary
                  </span>
                )}
                {s.category && <span className="text-xs text-muted-foreground">{s.category}</span>}
              </div>
            </div>
            <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </button>
      ))}
    </div>
  )
}

function Cart({ items, onUpdateQty, onRemove, subtotal, gstTotal, grandTotal, onSubmit, submitting, supplierName }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order</p>
        {supplierName && <p className="text-xs text-muted-foreground truncate ml-2">{supplierName}</p>}
      </div>

      {!items.length ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Click products to add
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Nu. {item.unit_price.toFixed(2)} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateQty(item.product_id, -1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                  <button onClick={() => onUpdateQty(item.product_id, +1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs font-bold w-16 text-right">Nu. {(item.unit_price * item.quantity).toFixed(2)}</p>
                <button onClick={() => onRemove(item.product_id)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-tibetan hover:bg-tibetan/10">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span>Nu. {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">GST (5%)</span>
              <span>Nu. {gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1">
              <span>Grand Total</span>
              <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <Button onClick={onSubmit} disabled={submitting || !items.length} className="w-full bg-primary hover:bg-primary/90">
            {submitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing order...</>
              : <><Send className="mr-2 h-4 w-4" /> Place Purchase Order</>
            }
          </Button>
        </>
      )}
    </div>
  )
}
