"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Store, CreditCard, MapPin, KeyRound, Truck } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { OrderTimeline } from "@/components/pos/orders/order-timeline"
import { useShopOrders } from "@/hooks/use-shop-orders"

export default function ShopOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { orderDetail, loading, error, fetchOrderDetail } = useShopOrders()

  useEffect(() => {
    if (params.id) fetchOrderDetail(params.id)
  }, [params.id, fetchOrderDetail])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !orderDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{error || 'Order not found'}</p>
          <Link href="/shop/orders"><Button>Back to Orders</Button></Link>
        </div>
      </div>
    )
  }

  const { order, items, timeline, payment_token } = orderDetail
  const payUrl = payment_token ? `/pay/${order.id}?token=${payment_token}` : null

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/shop/orders">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{order.order_no}</p>
            <OrderStatusBadge status={order.status} size="sm" />
          </div>
          <p className="text-sm font-bold text-primary shrink-0">
            Nu. {parseFloat(order.grand_total).toFixed(2)}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Pay Now CTA — shown only when DELIVERED */}
        {order.status === 'DELIVERED' && payUrl && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
            <p className="text-sm font-medium text-amber-800">Your order has been delivered!</p>
            <p className="text-sm text-amber-700">
              Please pay <strong>Nu. {parseFloat(order.grand_total).toFixed(2)}</strong> to complete your order.
            </p>
            <Button
              onClick={() => router.push(payUrl)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Pay Now
            </Button>
          </div>
        )}

        {/* Store info */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
          <Store className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">{order.seller?.name}</p>
            <p className="text-xs text-muted-foreground">Sold by</p>
          </div>
        </div>

        {/* Delivery address */}
        {order.delivery_address && (
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
            <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{order.delivery_address}</p>
              <p className="text-xs text-muted-foreground">Delivery address</p>
            </div>
          </div>
        )}

        {/* Delivery OTP — customer gives this to rider at doorstep */}
        {order.delivery_otp && order.status === 'DISPATCHED' && (
          <div className="p-4 rounded-xl border border-gold/30 bg-gold/5 space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gold" />
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rider is on the way!</p>
            </div>
            <p className="text-xs text-muted-foreground">Give this code to the rider when they arrive.</p>
            <p className="text-3xl font-mono font-bold text-gold tracking-[0.3em] text-center py-3">{order.delivery_otp}</p>
          </div>
        )}

        {/* Order items */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-sm font-medium">Items ({items.length})</p>
          </div>
          <div className="divide-y divide-border">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.sku} × {item.quantity}</p>
                </div>
                <p className="font-semibold ml-4 shrink-0">Nu. {parseFloat(item.total).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="divide-y divide-border bg-muted/20">
            <div className="flex justify-between px-4 py-2 text-sm">
              <span className="text-muted-foreground">GST (5%)</span>
              <span>Nu. {parseFloat(order.gst_total).toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-4 py-2 text-sm font-bold">
              <span>Total</span>
              <span className="text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Status timeline */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-sm font-medium">Order Timeline</p>
          </div>
          <div className="p-4">
            <OrderTimeline timeline={timeline} />
          </div>
        </div>

        {/* Order metadata */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>Order placed: {new Date(order.created_at).toLocaleString()}</p>
          {order.completed_at && <p>Completed: {new Date(order.completed_at).toLocaleString()}</p>}
          {order.cancelled_at && <p>Cancelled: {new Date(order.cancelled_at).toLocaleString()}</p>}
        </div>
      </main>
    </div>
  )
}
