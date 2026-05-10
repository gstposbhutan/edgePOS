'use client'

import { Minus, Plus, Trash2, ShoppingCart, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RestockCart({ items, onUpdateQty, onRemove, grandTotal, gstTotal, onSubmit, loading, wholesalerName }) {
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  return (
    <div className="space-y-3" data-testid="restock-cart">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order</p>
        {wholesalerName && (
          <p className="text-xs text-muted-foreground truncate ml-2">{wholesalerName}</p>
        )}
      </div>

      {!items.length ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Click products to add
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
            {items.map(item => (
              <div key={item.product_id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30" data-testid={`cart-item-${item.name}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Nu. {item.unit_price.toFixed(2)} x {item.quantity}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateQty(item.product_id, -1)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                    data-testid="qty-decrease"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-medium" data-testid="qty-value">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(item.product_id, +1)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                    data-testid="qty-increase"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                <p className="text-xs font-bold w-16 text-right">
                  Nu. {(item.unit_price * item.quantity).toFixed(2)}
                </p>

                <button
                  onClick={() => onRemove(item.product_id)}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-tibetan hover:bg-tibetan/10"
                  data-testid="remove-item"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
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

          <Button
            onClick={onSubmit}
            disabled={loading || !items.length}
            className="w-full bg-primary hover:bg-primary/90"
            data-testid="place-order-btn"
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing order...</>
              : <><Send className="mr-2 h-4 w-4" /> Place Purchase Order</>
            }
          </Button>
        </>
      )}
    </div>
  )
}
