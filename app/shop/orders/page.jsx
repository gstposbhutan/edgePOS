"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ShoppingBag, Store, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { useShopOrders } from "@/hooks/use-shop-orders"
import { formatCurrency } from "@/lib/utils"

const TABS = [
  { key: 'ALL',             label: 'All' },
  { key: 'ACTIVE',          label: 'Active' },
  { key: 'DELIVERED',       label: 'Awaiting Payment' },
  { key: 'COMPLETED',       label: 'Completed' },
  { key: 'CANCELLED',       label: 'Cancelled' },
]

const ACTIVE_STATUSES = ['CONFIRMED', 'PROCESSING', 'DISPATCHED']

export default function ShopOrdersPage() {
  const searchParams = useSearchParams()
  const confirmedNos = searchParams.get('confirmed')
  const partial = searchParams.get('partial')

  const { orders, loading, fetchOrders } = useShopOrders()
  const [tab, setTab] = useState('ALL')

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filtered = orders.filter(o => {
    if (tab === 'ALL') return true
    if (tab === 'ACTIVE') return ACTIVE_STATUSES.includes(o.status)
    return o.status === tab
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/shop">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-semibold text-lg">My Orders</h1>
        </div>

        {/* Status tabs */}
        <div className="max-w-2xl mx-auto px-4 flex gap-1 pb-2 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Success banner */}
        {confirmedNos && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <p className="text-sm font-medium text-emerald-700">
              {partial ? 'Some orders placed successfully!' : 'Orders placed successfully!'}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Order{confirmedNos.includes(',') ? 's' : ''}: {confirmedNos}
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No orders yet</p>
          </div>
        ) : (
          filtered.map(order => (
            <Link key={order.id} href={`/shop/orders/${order.id}`}>
              <div className="border border-border rounded-xl p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{order.order_no}</p>
                      <OrderStatusBadge status={order.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Store className="h-3 w-3" />
                      <span>{order.seller?.name ?? order.entities?.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(order.created_at).toLocaleDateString('en-BT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-primary shrink-0">
                    Nu. {parseFloat(order.grand_total).toFixed(2)}
                  </p>
                </div>
                {order.status === 'DELIVERED' && (
                  <div className="mt-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-xs text-amber-700 font-medium">Payment required — tap to pay</p>
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </main>
    </div>
  )
}
