"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Package, History, LogOut, RefreshCw, MapPin, User } from "lucide-react"
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

  const [otpModal,    setOtpModal]    = useState(null) // { type: 'pickup'|'deliver', orderId }
  const [otpLoading,  setOtpLoading]  = useState(false)
  const [otpError,    setOtpError]    = useState(null)

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

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
              <p className="text-sm font-semibold">Current Order</p>
              <OrderStatusBadge status={current.status} size="sm" />
            </div>
            <div className="p-4 space-y-3">
              <p className="text-base font-bold">{current.order_no}</p>

              {current.seller && (
                <div className="flex items-start gap-2 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Pickup: {current.seller.name}</p>
                  </div>
                </div>
              )}

              {current.delivery_address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Deliver to:</p>
                    <p className="text-muted-foreground">{current.delivery_address}</p>
                    {current.delivery_lat && (
                      <a
                        href={`https://maps.google.com/?q=${current.delivery_lat},${current.delivery_lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs hover:underline"
                      >
                        Open in Maps
                      </a>
                    )}
                  </div>
                </div>
              )}

              {current.items?.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {current.items.length} item{current.items.length > 1 ? 's' : ''}: {current.items.map(i => i.name).join(', ')}
                </div>
              )}

              {/* Action buttons by status */}
              <div className="pt-1 space-y-2">
                {(current.status === 'CONFIRMED' || current.status === 'PROCESSING') && current.pickup_otp === null && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleReject} className="flex-1">Reject</Button>
                    <Button onClick={handleAccept} className="flex-1">Accept Order</Button>
                  </div>
                )}

                {(current.status === 'CONFIRMED' || current.status === 'PROCESSING') && current.pickup_otp !== null && (
                  <Button
                    className="w-full h-11"
                    onClick={() => setOtpModal({ type: 'pickup', orderId: current.id })}
                  >
                    Confirm Pickup (Enter OTP from vendor)
                  </Button>
                )}

                {current.status === 'DISPATCHED' && (
                  <Button
                    className="w-full h-11"
                    onClick={() => setOtpModal({ type: 'deliver', orderId: current.id })}
                  >
                    Confirm Delivery (Enter OTP from customer)
                  </Button>
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
                  <OrderStatusBadge status={order.status} size="sm" />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* OTP modals */}
      <OtpInputModal
        open={otpModal?.type === 'pickup'}
        title="Confirm Pickup"
        description="Ask the vendor for the 6-digit OTP shown on their invoice or WhatsApp."
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
