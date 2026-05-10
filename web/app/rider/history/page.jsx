"use client"

import { useEffect } from "react"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { useRider } from "@/hooks/use-rider"

export default function RiderHistoryPage() {
  const { history, loading, fetchOrders } = useRider()

  useEffect(() => { fetchOrders() }, [fetchOrders])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/rider">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="font-semibold">Delivery History</h1>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No deliveries yet</div>
        ) : (
          history.map(order => (
            <div key={order.id} className="border border-border rounded-xl p-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{order.order_no}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{order.delivery_address}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.completed_at || order.updated_at).toLocaleDateString('en-BT', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right space-y-1">
                <OrderStatusBadge status={order.status} size="sm" />
                <p className="text-xs font-semibold text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
