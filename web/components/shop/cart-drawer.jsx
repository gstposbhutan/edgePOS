"use client"

import { X, Plus, Minus, Trash2, ShoppingBag, Store } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart-context"
import { formatCurrency } from "@/lib/utils"

export function CartDrawer() {
  const router = useRouter()
  const { carts, isOpen, setIsOpen, updateQuantity, removeItem, itemCount } = useCart()

  const totalItems = carts.reduce((sum, cart) => sum + cart.itemCount, 0)
  // cart.subtotal sums item.total which is already GST-inclusive (price * qty * 1.05)
  const grandTotal = carts.reduce((sum, cart) => sum + cart.subtotal, 0)
  const subtotalExGst = grandTotal / 1.05
  const gstAmount = grandTotal - subtotalExGst

  return (
    <>
      {/* Cart Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Cart Drawer - Bottom sheet on mobile, sidebar on desktop */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-2xl transition-transform duration-300 md:top-0 md:right-0 md:left-auto md:bottom-auto md:w-96 md:rounded-none md:border-t-0 md:border-l ${
          isOpen ? 'translate-y-0' : 'translate-y-full md:translate-x-full'
        }`}
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Your Cart</h2>
            <span className="text-sm text-muted-foreground">({totalItems} items)</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Cart Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {carts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-center">Your cart is empty</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Add products to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {carts.map((cart) => (
                <div key={cart.id} className="px-4 py-3">
                  {/* Store Name */}
                  <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                    <Store className="h-4 w-4" />
                    {cart.entities.name}
                  </div>

                  {/* Cart Items */}
                  <div className="space-y-3">
                    {cart.items.map((item) => (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                          <p className="text-sm font-semibold text-primary mt-1">
                            Nu. {parseFloat(item.total).toFixed(2)}
                          </p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-tibetan hover:text-tibetan"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Total & Checkout */}
        {carts.length > 0 && (
          <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">Nu. {subtotalExGst.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">GST (5%)</span>
              <span className="font-semibold">Nu. {gstAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
            </div>
            <Button
              className="w-full h-12 text-base"
              size="lg"
              onClick={() => { setIsOpen(false); router.push('/shop/checkout') }}
            >
              Checkout ({totalItems} items)
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              5% GST included in total
            </p>
          </div>
        )}
      </div>

      {/* Handle indicator for mobile */}
      {isOpen && (
        <div className="md:hidden fixed bottom-[85vh] left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full z-50" />
      )}
    </>
  )
}
