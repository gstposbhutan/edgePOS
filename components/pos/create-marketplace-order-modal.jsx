"use client"

import { useState, useEffect, useRef } from "react"
import { X, Plus, Minus, Trash2, Search, Loader2, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export function CreateMarketplaceOrderModal({ open, entityId, onClose, onCreated }) {
  const supabase = createClient()

  // Customer fields
  const [customerPhone,   setCustomerPhone]   = useState('')
  const [customerName,    setCustomerName]    = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')

  // Product search
  const [search,         setSearch]         = useState('')
  const [searchResults,  setSearchResults]  = useState([])
  const [searching,      setSearching]      = useState(false)
  const [cartItems,      setCartItems]      = useState([])

  // Submission
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const phoneInputRef = useRef(null)
  const searchRef     = useRef(null)

  // Auto-focus phone on open
  useEffect(() => {
    if (open) {
      setTimeout(() => phoneInputRef.current?.focus(), 50)
    } else {
      // Reset on close
      setCustomerPhone('')
      setCustomerName('')
      setDeliveryAddress('')
      setSearch('')
      setSearchResults([])
      setCartItems([])
      setError(null)
    }
  }, [open])

  // Product search debounced
  useEffect(() => {
    if (!search.trim() || !entityId) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('sellable_products')
        .select('id, name, sku, mrp, available_stock')
        .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        .gt('available_stock', 0)
        .eq('is_active', true)
        .limit(20)
      setSearchResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, entityId])

  function addProduct(product) {
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
        )
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        mrp: parseFloat(product.mrp),
        quantity: 1,
        stock: product.available_stock,
      }]
    })
    setSearch('')
    setSearchResults([])
    searchRef.current?.focus()
  }

  function updateQty(productId, delta) {
    setCartItems(prev => prev
      .map(i => i.product_id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
    )
  }

  function removeFromCart(productId) {
    setCartItems(prev => prev.filter(i => i.product_id !== productId))
  }

  const grandTotal = cartItems.reduce((sum, i) => sum + i.mrp * i.quantity * 1.05, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!customerPhone.trim()) {
      setError('Customer WhatsApp number is required')
      return
    }
    if (cartItems.length === 0) {
      setError('Add at least one product')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const phone = customerPhone.trim().startsWith('+')
        ? customerPhone.trim()
        : `+${customerPhone.trim()}`

      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_whatsapp: phone,
          customer_name: customerName.trim() || undefined,
          delivery_address: deliveryAddress.trim() || undefined,
          items: cartItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create order')
        return
      }

      onCreated(data.order)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-background rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold">New Customer Order</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Customer WhatsApp — required */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-primary" />
                WhatsApp Number <span className="text-tibetan">*</span>
              </label>
              <Input
                ref={phoneInputRef}
                type="tel"
                placeholder="+975 17 123 456"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                required
              />
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Customer Name</label>
                <Input
                  placeholder="Optional"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Delivery Address</label>
                <Input
                  placeholder="Optional"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Product search */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Add Products</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Search by name or SKU..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {(searchResults.length > 0 || searching) && (
                <div className="border border-border rounded-lg overflow-hidden shadow-md">
                  {searching ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">Searching...</div>
                  ) : (
                    searchResults.map(product => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 text-left border-b border-border last:border-0 text-sm"
                      >
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.sku} · Stock: {product.available_stock}</p>
                        </div>
                        <p className="font-semibold text-primary ml-3 shrink-0">Nu. {parseFloat(product.mrp).toFixed(2)}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Cart items */}
            {cartItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="divide-y divide-border">
                  {cartItems.map(item => (
                    <div key={item.product_id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Nu. {(item.mrp * item.quantity * 1.05).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.product_id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-tibetan" onClick={() => removeFromCart(item.product_id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-muted/30 text-sm font-semibold border-t border-border">
                  <span>Total (inc. GST)</span>
                  <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
                <p className="text-sm text-tibetan">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border shrink-0 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !customerPhone.trim() || cartItems.length === 0}
              className="flex-1"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                : 'Place Order'
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
