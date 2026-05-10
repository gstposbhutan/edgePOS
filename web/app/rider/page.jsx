"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Package, History, LogOut, RefreshCw, MapPin, Phone, DollarSign, CheckCircle, Loader2, Store } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { OtpInputModal } from "@/components/rider/otp-input-modal"
import { useRider } from "@/hooks/use-rider"
import { createClient } from "@/lib/supabase/client"
import { signOut } from "@/lib/auth"

export default function RiderDashboard() {
  const router = useRouter()
  const { current, history, rider, loading, error, fetchOrders, accept, reject, pickup, deliver } = useRider()

  const [otpModal,    setOtpModal]    = useState(null)
  const [otpLoading,  setOtpLoading]  = useState(false)
  const [otpError,    setOtpError]    = useState(null)

  // Delivery fee state
  const [feeInput,    setFeeInput]    = useState('')
  const [feeLoading,  setFeeLoading]  = useState(false)
  const [feeError,    setFeeError]    = useState(null)
  const [feeSubmitted, setFeeSubmitted] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Reset fee state when order changes
  useEffect(() => {
    setFeeInput('')
    setFeeError(null)
    setFeeSubmitted(current?.delivery_fee != null)
  }, [current?.id, current?.delivery_fee])

  async function handleAccept() {
    try { await accept(current?.id) } catch (err) { console.error(err) }
  }

  async function handleReject() {
    try { await reject(current?.id) } catch (err) { console.error(err) }
  }

  async function handleOtpConfirm(otp) {
    if (!otpModal) return
    setOtpLoading(true)
    setOtpError(null)
    try {
      if (otpModal.type === 'pickup') {
        await pickup(otpModal.orderId, otp)
      } else {
        await deliver(otpModal.orderId, otp)
      }
      setOtpModal(null)
    } catch (err) {
      setOtpError(err.message)
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleSubmitFee(e) {
    e.preventDefault()
    const fee = parseFloat(feeInput)
    if (!fee || fee <= 0) { setFeeError('Enter a valid delivery fee'); return }
    setFeeLoading(true)
    setFeeError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/rider/orders/${current.id}/fee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ delivery_fee: fee }),
      })
      const data = await res.json()
      if (!res.ok) { setFeeError(data.error); return }
      setFeeSubmitted(true)
      fetchOrders()
    } catch (err) {
      setFeeError(err.message)
    } finally {
      setFeeLoading(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/rider/login')
  }

  const completedToday = history.filter(o => {
    const d = new Date(o.completed_at || o.updated_at)
    return d.toDateString() === new Date().toDateString()
  }).length

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛵</span>
          <div>
            <p className="text-sm font-bold">{rider?.name || 'Rider'}</p>
            <p className="text-xs text-muted-foreground">Delivery Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchOrders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-primary">{completedToday}</p>
            <p className="text-xs text-muted-foreground mt-1">Delivered today</p>
          </div>
          <div className="border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold">{history.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total deliveries</p>
          </div>
        </div>

        {/* Current order */}
        {current ? (
          <div className="border-2 border-primary/30 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Current Order</p>
                <p className="text-xs text-muted-foreground font-mono">{current.order_no}</p>
              </div>
              <OrderStatusBadge status={current.status} size="sm" />
            </div>

            <div className="p-4 space-y-4">

              {/* Pickup address (vendor) */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Store className="h-3.5 w-3.5" /> Pickup — Vendor
                </div>
                {current.seller && (
                  <>
                    <p className="text-sm font-medium">{current.seller.name}</p>
                    {current.seller.address && (
                      <p className="text-xs text-muted-foreground">{current.seller.address}</p>
                    )}
                    {current.seller.whatsapp_no && (
                      <a href={`tel:${current.seller.whatsapp_no}`}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Phone className="h-3 w-3" /> {current.seller.whatsapp_no}
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* Delivery address (customer) */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <MapPin className="h-3.5 w-3.5" /> Deliver to — Customer
                </div>
                {current.delivery_address
                  ? <p className="text-sm">{current.delivery_address}</p>
                  : <p className="text-xs text-muted-foreground">No address provided</p>
                }
                {current.buyer_whatsapp && (
                  <a href={`tel:${current.buyer_whatsapp}`}
                    className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Phone className="h-3 w-3" /> {current.buyer_whatsapp}
                  </a>
                )}
                {current.delivery_lat && (
                  <a href={`https://maps.google.com/?q=${current.delivery_lat},${current.delivery_lng}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline block">
                    Open in Maps →
                  </a>
                )}
              </div>

              {/* Items summary */}
              {current.items?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {current.items.length} item{current.items.length > 1 ? 's' : ''}: {current.items.map(i => i.name).join(', ')}
                </p>
              )}

              {/* Order value */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order value</span>
                <span className="font-semibold text-primary">Nu. {parseFloat(current.grand_total).toFixed(2)}</span>
              </div>

              {/* Action buttons by status */}
              <div className="space-y-2">
                {(current.status === 'CONFIRMED' || current.status === 'PROCESSING') && current.pickup_otp === null && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleReject} className="flex-1">Reject</Button>
                    <Button onClick={handleAccept} className="flex-1">Accept Order</Button>
                  </div>
                )}

                {(current.status === 'CONFIRMED' || current.status === 'PROCESSING') && current.pickup_otp !== null && (
                  <Button className="w-full h-11"
                    onClick={() => setOtpModal({ type: 'pickup', orderId: current.id })}>
                    Confirm Pickup (Enter vendor OTP)
                  </Button>
                )}

                {current.status === 'DISPATCHED' && (
                  <Button className="w-full h-11"
                    onClick={() => setOtpModal({ type: 'deliver', orderId: current.id })}>
                    Confirm Delivery (Enter customer OTP)
                  </Button>
                )}

                {/* Delivery fee — shown after delivery */}
                {current.status === 'DELIVERED' && (
                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <DollarSign className="h-4 w-4 text-primary" /> Delivery Fee
                    </div>
                    {feeSubmitted || current.delivery_fee ? (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-500/10 px-3 py-2 rounded">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        Nu. {parseFloat(current.delivery_fee).toFixed(2)} submitted
                        {current.delivery_fee_paid
                          ? ' · Payment confirmed by vendor'
                          : ' · Awaiting vendor payment confirmation'}
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitFee} className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Enter the delivery cost to charge the customer. The vendor will confirm payment.
                        </p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Nu.</span>
                            <input
                              type="number" min="1" step="0.01"
                              value={feeInput}
                              onChange={e => setFeeInput(e.target.value)}
                              placeholder="0.00"
                              className="w-full h-9 pl-9 pr-3 text-sm border border-input rounded bg-background"
                            />
                          </div>
                          <Button type="submit" disabled={feeLoading} className="h-9 px-4">
                            {feeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                          </Button>
                        </div>
                        {feeError && <p className="text-xs text-tibetan">{feeError}</p>}
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No active order</p>
            <p className="text-xs text-muted-foreground/60 mt-1">You'll receive a WhatsApp notification when assigned</p>
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
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.completed_at || order.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.delivery_fee && (
                      <span className="text-xs text-muted-foreground">Nu. {parseFloat(order.delivery_fee).toFixed(2)}</span>
                    )}
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
