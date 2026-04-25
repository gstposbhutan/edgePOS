"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, XCircle, RefreshCw, RotateCcw, Loader2, Receipt, MessageCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { OrderTimeline }    from "@/components/pos/orders/order-timeline"
import { CancelModal }      from "@/components/pos/orders/cancel-modal"
import { RefundModal }      from "@/components/pos/orders/refund-modal"
import { useOrders }        from "@/hooks/use-orders"
import { getUser, getRoleClaims } from "@/lib/auth"

// Statuses where cancellation is still possible
const CANCELLABLE_STATUSES = [
  'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
  'PROCESSING', 'DISPATCHED', 'CANCELLATION_REQUESTED',
]
// Statuses where refund can be requested
const REFUNDABLE_STATUSES = [
  'CONFIRMED', 'DELIVERED', 'COMPLETED', 'REPLACEMENT_REQUESTED',
]

export default function OrderDetailPage() {
  const { id }  = useParams()
  const router  = useRouter()

  const [user,          setUser]          = useState(null)
  const [subRole,       setSubRole]       = useState('CASHIER')
  const [entityId,      setEntityId]      = useState(null)
  const [detail,        setDetail]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [showCancel,    setShowCancel]    = useState(false)
  const [showRefund,    setShowRefund]    = useState(false)

  const { fetchOrderDetail, cancelOrder, requestRefund, approveRefund } = useOrders(entityId)

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId: eid, subRole: sr } = getRoleClaims(currentUser)
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
      await loadDetail()
    }
    load()
  }, [id])

  async function loadDetail() {
    setLoading(true)
    const data = await fetchOrderDetail(id)
    setDetail(data)
    setLoading(false)
  }

  const order        = detail?.order
  const items        = detail?.items ?? []
  const timeline     = detail?.timeline ?? []
  const refunds      = detail?.refunds ?? []
  const replacements = detail?.replacements ?? []

  const canCancel  = order && CANCELLABLE_STATUSES.includes(order.status)
  const canRefund  = order && REFUNDABLE_STATUSES.includes(order.status)
  const isManager  = ['MANAGER', 'OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(subRole)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Order not found</p>
        <Button onClick={() => router.push('/pos/orders')} variant="outline">Back to Orders</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/orders')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-sm font-mono font-bold text-foreground">{order.order_no}</h1>
            {order.order_source === 'WHATSAPP' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <MessageCircle className="h-3 w-3" /> WhatsApp Order
              </span>
            )}
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.created_at).toLocaleString('en-IN')}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={loadDetail} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/pos/order/${id}`)}
          >
            <Receipt className="h-4 w-4 mr-1.5" /> View Receipt
          </Button>
          {canRefund && (
            <Button variant="outline" size="sm" onClick={() => setShowRefund(true)}
              className="border-blue-500/40 text-blue-600 hover:bg-blue-500/5">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Request Refund
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => setShowCancel(true)}
              className="border-tibetan/40 text-tibetan hover:bg-tibetan/5">
              <XCircle className="h-4 w-4 mr-1.5" /> Cancel Order
            </Button>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg border border-border bg-card space-y-1">
            <p className="text-xs text-muted-foreground">Grand Total</p>
            <p className="text-lg font-bold text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">GST: Nu. {parseFloat(order.gst_total).toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-card space-y-1">
            <p className="text-xs text-muted-foreground">Payment</p>
            <p className="text-sm font-semibold text-foreground">{order.payment_method}</p>
            <p className="text-xs text-muted-foreground">{order.buyer_phone ?? order.buyer_whatsapp ?? 'Face-ID'}</p>
          </div>
        </div>

        {/* Unmatched items warning */}
        {order.order_source === 'WHATSAPP' && items.some(i => i.matched === false) && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-600">Unmatched Items</p>
              <p className="text-[10px] text-muted-foreground">
                {items.filter(i => i.matched === false).length} item(s) could not be matched to products. Review and update before confirming.
              </p>
            </div>
          </div>
        )}

        {/* Order items */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-2">Items</p>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg border bg-card ${
                item.matched === false ? 'border-amber-500/40' : 'border-border'
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.quantity} × Nu. {parseFloat(item.unit_price).toFixed(2)}
                    {parseFloat(item.discount) > 0 && ` (−Nu.${parseFloat(item.discount).toFixed(2)} disc.)`}
                  </p>
                  {item.raw_request_text && item.raw_request_text !== item.name && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Customer wrote: "{item.raw_request_text}"
                      {item.match_confidence && ` (${Math.round(item.match_confidence * 100)}% match)`}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-primary">Nu. {parseFloat(item.total).toFixed(2)}</p>
                  {item.matched === false ? (
                    <Badge className="text-[10px] px-1.5 py-0 mt-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      No match
                    </Badge>
                  ) : (
                    <Badge className={`text-[10px] px-1.5 py-0 mt-0.5 ${
                      item.status === 'ACTIVE'   ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                      item.status === 'REFUNDED' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                      item.status === 'REPLACED' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                      'bg-tibetan/10 text-tibetan border-tibetan/20'
                    }`}>{item.status}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Refund history */}
        {refunds.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Refunds</p>
            <div className="space-y-2">
              {refunds.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
                  <div>
                    <p className="text-xs font-medium text-foreground">{r.reason}</p>
                    <p className="text-[10px] text-muted-foreground">via {r.refund_method}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-blue-600">Nu. {parseFloat(r.amount).toFixed(2)}</p>
                    <OrderStatusBadge status={r.status} size="sm" />
                    {r.status === 'REQUESTED' && isManager && (
                      <button
                        onClick={() => approveRefund(r.id, order.id, user?.id).then(loadDetail)}
                        className="text-[10px] text-emerald-600 hover:underline mt-0.5 block"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status timeline */}
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Status History</p>
          <OrderTimeline timeline={timeline} />
        </div>

      </div>

      <CancelModal
        open={showCancel}
        order={order}
        subRole={subRole}
        userId={user?.id}
        onCancel={async (...args) => { const r = await cancelOrder(...args); await loadDetail(); return r }}
        onClose={() => setShowCancel(false)}
      />

      <RefundModal
        open={showRefund}
        order={order}
        items={items}
        userId={user?.id}
        onRequest={async (...args) => { const r = await requestRefund(...args); await loadDetail(); return r }}
        onClose={() => setShowRefund(false)}
      />
    </div>
  )
}
