"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Search, RefreshCw, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { useOrders } from "@/hooks/use-orders"
import { getUser, getRoleClaims } from "@/lib/auth"

const FILTERS = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUNDS']

export default function OrdersPage() {
  const router = useRouter()

  const [entityId, setEntityId] = useState(null)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid } = getRoleClaims(user)
      setEntityId(eid)
    }
    load()
  }, [])

  const { orders, loading, filter, setFilter, fetchOrders } = useOrders(entityId)

  const displayed = orders.filter(o =>
    !search.trim() ||
    o.order_no.toLowerCase().includes(search.toLowerCase()) ||
    (o.buyer_whatsapp ?? '').includes(search)
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold text-foreground">Orders</h1>
          <p className="text-xs text-muted-foreground">{orders.length} orders</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={fetchOrders}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Search + filter */}
      <div className="px-4 py-3 space-y-2 shrink-0 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order no. or WhatsApp..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FILTERS.map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className={`shrink-0 ${filter === f ? 'bg-primary' : ''}`}
            >
              {f.charAt(0) + f.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Order list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShoppingBag className="h-10 w-10 opacity-20" />
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayed.map(order => (
              <button
                key={order.id}
                onClick={() => router.push(`/pos/orders/${order.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-mono font-medium text-foreground">{order.order_no}</p>
                    <OrderStatusBadge status={order.status} size="sm" />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    {order.buyer_whatsapp && <span>{order.buyer_whatsapp}</span>}
                    <span>{order.payment_method}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">GST Nu. {parseFloat(order.gst_total).toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
