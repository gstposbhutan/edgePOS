'use client'

import { useState, useEffect } from 'react'
import { X, ShoppingBag, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRestock } from '@/hooks/use-restock'
import { WholesalerList } from './wholesaler-list'
import { WholesalerCatalog } from './wholesaler-catalog'
import { RestockCart } from './restock-cart'

/**
 * Vendor restock modal for retailers to place wholesale orders.
 * Flow: Select wholesaler → Browse catalog → Add to cart → Place order.
 *
 * The order is created with payment_method=CREDIT, which debits the
 * retailer's khata account with the wholesaler automatically.
 */
export function RestockModal({ open, onClose }) {
  const {
    connections,
    catalog,
    orders,
    loading,
    error,
    setError,
    fetchConnections,
    fetchCatalog,
    placeOrder,
  } = useRestock()

  const [step, setStep] = useState('wholesalers') // wholesalers | catalog
  const [selectedWholesaler, setSelectedWholesaler] = useState(null)
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    if (open && step === 'wholesalers') {
      fetchConnections()
    }
  }, [open, step, fetchConnections])

  function handleSelectWholesaler(wholesaler) {
    setSelectedWholesaler(wholesaler)
    setStep('catalog')
    fetchCatalog(wholesaler.id, '')
  }

  function handleBack() {
    if (step === 'catalog') {
      setStep('wholesalers')
      setSelectedWholesaler(null)
      setSearch('')
      setCart([])
    }
  }

  function handleSearch(value) {
    setSearch(value)
    if (selectedWholesaler) {
      fetchCatalog(selectedWholesaler.id, value)
    }
  }

  function handleAddToCart(product) {
    const existing = cart.find(c => c.product_id === product.id)
    if (existing) {
      setCart(prev => prev.map(c =>
        c.product_id === product.id
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ))
    } else {
      setCart(prev => [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: parseFloat(product.wholesale_price),
        quantity: 1,
      }])
    }
  }

  function handleUpdateQty(productId, delta) {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  function handleRemove(productId) {
    setCart(prev => prev.filter(item => item.product_id !== productId))
  }

  async function handleSubmit() {
    if (!selectedWholesaler || !cart.length) return

    setSubmitting(true)
    setError(null)

    try {
      const order = await placeOrder(selectedWholesaler.id, cart)

      if (order) {
        setSuccess(order)
        setCart([])
        setTimeout(() => {
          setSuccess(null)
          setStep('wholesalers')
          setSelectedWholesaler(null)
        }, 3000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const gstTotal = subtotal * 0.05
  const grandTotal = subtotal + gstTotal

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl h-[85vh] p-0 gap-0" data-testid="restock-modal">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step === 'catalog' && (
                <button
                  onClick={handleBack}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="back-to-wholesalers-btn"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="font-serif text-lg" data-testid="restock-modal-title">
                    {step === 'wholesalers' ? 'Restock from Wholesaler' : selectedWholesaler?.name || 'Browse Catalog'}
                  </DialogTitle>
                  {step === 'catalog' && (
                    <p className="text-xs text-muted-foreground">{selectedWholesaler?.category}</p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="close-restock-btn"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2" data-testid="restock-error">
            <AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" />
            <p className="text-sm text-tibetan">{error}</p>
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2" data-testid="restock-success">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-emerald-500">Order placed successfully!</p>
              <p className="text-muted-foreground">{success.order_no}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {step === 'wholesalers' ? (
              <WholesalerList
                wholesalers={connections}
                selected={selectedWholesaler}
                onSelect={handleSelectWholesaler}
              />
            ) : (
              <WholesalerCatalog
                products={catalog}
                loading={loading}
                search={search}
                onSearch={handleSearch}
                onAddToCart={handleAddToCart}
              />
            )}
          </div>

          {/* Right panel - Cart */}
          <div className="w-80 border-l border-border bg-muted/30 p-4 overflow-y-auto">
            <RestockCart
              items={cart}
              onUpdateQty={handleUpdateQty}
              onRemove={handleRemove}
              grandTotal={grandTotal}
              gstTotal={gstTotal}
              onSubmit={handleSubmit}
              loading={submitting}
              wholesalerName={selectedWholesaler?.name}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
