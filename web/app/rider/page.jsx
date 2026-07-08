"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Package, LogOut, RefreshCw, MapPin, Phone, DollarSign, CheckCircle, Loader2, Store, Navigation, NavigationOff, Power } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { OtpInputModal } from "@/components/rider/otp-input-modal"
import { useRider } from "@/hooks/use-rider"
import { signOut } from "@/lib/auth"

// One order in the rider's queue — pickup + delivery details and the status-appropriate actions.
function QueueOrderCard({ order, onReject, onPickup, onDeliver, rejecting }) {
  const pretransit = order.status === 'CONFIRMED' || order.status === 'PROCESSING'
  return (
    <div className="border-2 border-primary/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">{order.order_no}</p>
          <p className="text-sm font-semibold text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
        </div>
        <OrderStatusBadge status={order.status} size="sm" />
      </div>

      <div className="p-4 space-y-3">
        {/* Pickup — vendor */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Store className="h-3.5 w-3.5" /> Pickup
          </div>
          {order.seller && (
            <>
              <p className="text-sm font-medium">{order.seller.name}</p>
              {order.seller.address && <p className="text-xs text-muted-foreground">{order.seller.address}</p>}
              {order.seller.whatsapp_no && (
                <a href={`tel:${order.seller.whatsapp_no}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Phone className="h-3 w-3" /> {order.seller.whatsapp_no}
                </a>
              )}
            </>
          )}
        </div>

        {/* Deliver — customer */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <MapPin className="h-3.5 w-3.5" /> Deliver to
          </div>
          {order.delivery_address
            ? <p className="text-sm">{order.delivery_address}</p>
            : <p className="text-xs text-muted-foreground">No address provided</p>}
          {order.buyer_whatsapp && (
            <a href={`tel:${order.buyer_whatsapp}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Phone className="h-3 w-3" /> {order.buyer_whatsapp}
            </a>
          )}
          {order.delivery_lat && (
            <a href={`https://maps.google.com/?q=${order.delivery_lat},${order.delivery_lng}`}
              target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline block">
              Open in Maps →
            </a>
          )}
        </div>

        {order.items?.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {order.items.length} item{order.items.length > 1 ? 's' : ''}: {order.items.map(i => i.name).join(', ')}
          </p>
        )}

        {/* Actions by status */}
        <div className="flex gap-2 pt-1">
          {pretransit && (
            <>
              <Button variant="outline" onClick={() => onReject(order.id)} disabled={rejecting} className="flex-1">
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
              </Button>
              <Button onClick={() => onPickup(order.id)} className="flex-1">Confirm Pickup</Button>
            </>
          )}
          {order.status === 'DISPATCHED' && (
            <Button onClick={() => onDeliver(order.id)} className="w-full h-11">Confirm Delivery</Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Delivery-fee entry for an order that's been delivered but has no fee yet.
function DeliveryFeeForm({ order, onSubmitted }) {
  const [fee, setFee] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const v = parseFloat(fee)
    if (!v || v <= 0) { setError('Enter a valid delivery fee'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/rider/orders/${order.id}/fee`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_fee: v }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onSubmitted()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium font-mono">{order.order_no}</span>
        <span className="text-xs text-muted-foreground">delivered</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Nu.</span>
          <input type="number" min="1" step="0.01" value={fee} onChange={e => setFee(e.target.value)}
            placeholder="Delivery fee" className="w-full h-9 pl-9 pr-3 text-sm border border-input rounded bg-background" />
        </div>
        <Button type="submit" disabled={loading} className="h-9 px-4">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
        </Button>
      </div>
      {error && <p className="text-xs text-tibetan">{error}</p>}
    </form>
  )
}

export default function RiderDashboard() {
  const router = useRouter()
  const { queue, history, rider, loading, fetchOrders, reject, pickup, deliver, updateLocation, setShift } = useRider()

  const [otpModal,   setOtpModal]   = useState(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError,   setOtpError]   = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [shiftLoading, setShiftLoading] = useState(false)

  const online = rider?.is_available ?? true

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Report GPS while on shift so dispatch can weight by proximity.
  useEffect(() => {
    if (!online || typeof navigator === 'undefined' || !navigator.geolocation) return
    let cancelled = false
    const report = () => navigator.geolocation.getCurrentPosition(
      (pos) => { if (!cancelled) updateLocation(pos.coords.latitude, pos.coords.longitude) },
      () => { /* denied / unavailable — ignore */ },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    )
    report()
    const iv = setInterval(report, 90000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [online, updateLocation])

  const handlePickup  = useCallback((id) => setOtpModal({ type: 'pickup',  orderId: id }), [])
  const handleDeliver = useCallback((id) => setOtpModal({ type: 'deliver', orderId: id }), [])

  async function handleReject(id) {
    setRejectingId(id)
    try { await reject(id) } catch (err) { console.error(err) } finally { setRejectingId(null) }
  }

  async function handleOtpConfirm(otp) {
    if (!otpModal) return
    setOtpLoading(true); setOtpError(null)
    try {
      if (otpModal.type === 'pickup') await pickup(otpModal.orderId, otp)
      else await deliver(otpModal.orderId, otp)
      setOtpModal(null)
    } catch (err) { setOtpError(err.message) }
    finally { setOtpLoading(false) }
  }

  async function toggleShift() {
    setShiftLoading(true)
    try { await setShift(!online) } catch (err) { console.error(err) } finally { setShiftLoading(false) }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/rider/login')
  }

  const completedToday = history.filter(o => {
    const d = new Date(o.completed_at || o.updated_at)
    return d.toDateString() === new Date().toDateString()
  }).length

  const awaitingFee = history.filter(o => o.status === 'DELIVERED' && o.delivery_fee == null)

  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛵</span>
          <div>
            <p className="text-sm font-bold">{rider?.name || 'Rider'}</p>
            <p className="text-xs text-muted-foreground">Delivery Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={online ? 'default' : 'outline'}
            size="sm"
            onClick={toggleShift}
            disabled={shiftLoading}
            className="gap-1.5"
          >
            {shiftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            {online ? 'Online' : 'Offline'}
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchOrders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Offline banner */}
        {!online && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <NavigationOff className="h-4 w-4 shrink-0" />
            You're offline — you won't receive new orders. Go online to start.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary">{queue.length}</p>
            <p className="text-xs text-muted-foreground mt-1">In queue</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{completedToday}</p>
            <p className="text-xs text-muted-foreground mt-1">Done today</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{history.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total</p>
          </div>
        </div>

        {/* Location status */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {online && rider?.last_lat
            ? <><Navigation className="h-3.5 w-3.5 text-emerald-600" /> Location sharing on</>
            : <><NavigationOff className="h-3.5 w-3.5" /> Location off</>}
        </div>

        {/* Queue */}
        <div>
          <p className="text-sm font-semibold mb-3">Your Queue ({queue.length}) — deliver in any order</p>
          {queue.length > 0 ? (
            <div className="space-y-4">
              {queue.map(order => (
                <QueueOrderCard
                  key={order.id}
                  order={order}
                  onReject={handleReject}
                  onPickup={handlePickup}
                  onDeliver={handleDeliver}
                  rejecting={rejectingId === order.id}
                />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No orders in your queue</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {online ? "New orders arrive automatically." : "Go online to receive orders."}
              </p>
            </div>
          )}
        </div>

        {/* Awaiting delivery fee */}
        {awaitingFee.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold mb-2">
              <DollarSign className="h-4 w-4 text-primary" /> Collect delivery fee
            </div>
            <div className="space-y-2">
              {awaitingFee.map(o => <DeliveryFeeForm key={o.id} order={o} onSubmitted={fetchOrders} />)}
            </div>
          </div>
        )}

        {/* Recent deliveries */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Recent Deliveries</p>
              <Link href="/rider/history" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="space-y-2">
              {history.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between px-3 py-2.5 border border-border rounded-lg text-sm">
                  <div>
                    <p className="font-medium">{order.order_no}</p>
                    <p className="text-xs text-muted-foreground">{new Date(order.completed_at || order.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.delivery_fee && <span className="text-xs text-muted-foreground">Nu. {parseFloat(order.delivery_fee).toFixed(2)}</span>}
                    <OrderStatusBadge status={order.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <OtpInputModal
        open={otpModal?.type === 'pickup'}
        title="Confirm Pickup"
        description="Ask the vendor for the 6-digit OTP shown on their screen or WhatsApp."
        onConfirm={handleOtpConfirm}
        onClose={() => { setOtpModal(null); setOtpError(null) }}
        loading={otpLoading}
        error={otpError}
      />
      <OtpInputModal
        open={otpModal?.type === 'deliver'}
        title="Confirm Delivery"
        description="Ask the customer for the 6-digit OTP sent to their WhatsApp."
        onConfirm={handleOtpConfirm}
        onClose={() => { setOtpModal(null); setOtpError(null) }}
        loading={otpLoading}
        error={otpError}
      />
    </div>
  )
}
