"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ShoppingBag, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useCart } from "@/lib/cart-context"
import { CheckoutSummary } from "@/components/shop/checkout-summary"

export default function CheckoutPage() {
  const router = useRouter()
  const { carts, itemCount, fetchCart } = useCart()

  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryLat, setDeliveryLat] = useState(null)
  const [deliveryLng, setDeliveryLng] = useState(null)
  const [locating, setLocating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const nonEmptyCarts = carts.filter(c => c.items?.length > 0)

  function handleLocationCapture() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryLat(pos.coords.latitude)
        setDeliveryLng(pos.coords.longitude)
        setLocating(false)
      },
      () => {
        setError("Could not get your location. Please enter your address manually.")
        setLocating(false)
      }
    )
  }

  async function handlePlaceOrder() {
    if (!deliveryAddress.trim()) {
      setError("Please enter a delivery address")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_address: deliveryAddress.trim(),
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to place order')
        return
      }

      const successful = data.orders.filter(o => o.id)
      const failed = data.orders.filter(o => !o.id)

      await fetchCart()

      if (successful.length === 0) {
        setError('All orders failed to place. Please try again.')
        return
      }

      // Build toast message
      const orderNos = successful.map(o => o.order_no).join(', ')
      const params = new URLSearchParams({ confirmed: orderNos })
      if (failed.length > 0) params.set('partial', '1')

      router.push(`/shop/orders?${params.toString()}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (nonEmptyCarts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground">Your cart is empty</p>
          <Link href="/shop">
            <Button>Browse Products</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/shop">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-semibold text-lg">Checkout</h1>
          <span className="text-sm text-muted-foreground ml-auto">{itemCount} items</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
            <p className="text-sm text-tibetan">{error}</p>
          </div>
        )}

        <CheckoutSummary
          carts={nonEmptyCarts}
          deliveryAddress={deliveryAddress}
          deliveryLat={deliveryLat}
          deliveryLng={deliveryLng}
          onDeliveryAddressChange={setDeliveryAddress}
          onLocationCapture={handleLocationCapture}
          locating={locating}
        />
      </main>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <Button
            onClick={handlePlaceOrder}
            disabled={loading || !deliveryAddress.trim()}
            className="w-full h-12 text-base"
            size="lg"
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing orders...</>
              : `Place Order (${nonEmptyCarts.length} store${nonEmptyCarts.length > 1 ? 's' : ''})`
            }
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-2">
            You'll pay after delivery via WhatsApp
          </p>
        </div>
      </div>
    </div>
  )
}
