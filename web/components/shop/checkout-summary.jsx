"use client"

import { MapPin, Navigation, Store } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CheckoutSummary({
  carts,
  deliveryAddress,
  deliveryLat,
  deliveryLng,
  onDeliveryAddressChange,
  onLocationCapture,
  locating,
}) {
  const grandTotal = carts.reduce((sum, cart) => sum + cart.subtotal, 0)
  const subtotalExGst = grandTotal / 1.05
  const gstAmount = grandTotal - subtotalExGst

  return (
    <div className="space-y-6">
      {/* Per-vendor order sections */}
      {carts.map((cart) => (
        <div key={cart.id} className="border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
            <Store className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{cart.entities?.name}</span>
          </div>
          <div className="divide-y divide-border">
            {cart.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku} × {item.quantity}</p>
                </div>
                <p className="font-semibold ml-4 shrink-0">Nu. {parseFloat(item.total).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 text-sm">
            <span className="text-muted-foreground">Store subtotal</span>
            <span className="font-semibold">Nu. {cart.subtotal.toFixed(2)}</span>
          </div>
        </div>
      ))}

      {/* Grand total */}
      <div className="border border-border rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (ex-GST)</span>
          <span>Nu. {subtotalExGst.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">GST (5%)</span>
          <span>Nu. {gstAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
          <span>Total</span>
          <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
        </div>
        <p className="text-xs text-muted-foreground text-center pt-1">
          Payment collected after delivery
        </p>
      </div>

      {/* Delivery address */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          Delivery Address <span className="text-tibetan">*</span>
        </label>
        <textarea
          value={deliveryAddress}
          onChange={(e) => onDeliveryAddressChange(e.target.value)}
          placeholder="Enter your full delivery address..."
          rows={3}
          className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLocationCapture}
          disabled={locating}
          className="w-full gap-2"
        >
          <Navigation className="h-4 w-4" />
          {locating ? 'Getting location...' : deliveryLat ? `GPS captured (${deliveryLat.toFixed(4)}, ${deliveryLng.toFixed(4)})` : 'Use my current location'}
        </Button>
      </div>
    </div>
  )
}
