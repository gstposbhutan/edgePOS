"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, XCircle, RefreshCw, RotateCcw, Loader2, Receipt, MessageCircle, AlertTriangle, User, Phone, CreditCard, Printer, ChevronDown, ChevronUp, CheckCircle, Plus, Minus, X, KeyRound, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { OrderTimeline }    from "@/components/pos/orders/order-timeline"
import { CancelModal }      from "@/components/pos/orders/cancel-modal"
import { RefundModal }      from "@/components/pos/orders/refund-modal"
import { useOrders }        from "@/hooks/use-orders"
import { useKhata }         from "@/hooks/use-khata"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient }     from "@/lib/supabase/client"
import { ShortcutBar }      from "@/components/pos/keyboard/shortcut-bar"

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
  // Sales Order invoice creation
  const [showInvoice,   setShowInvoice]  = useState(false)
  const [invoiceLines,  setInvoiceLines] = useState([])
  const [invPayMethod,  setInvPayMethod] = useState('CREDIT')
  const [invRef,        setInvRef]       = useState('')
  const [invoicing,     setInvoicing]    = useState(false)
  const [invoiceResult, setInvoiceResult] = useState(null)
  const [selectedLine,  setSelectedLine] = useState(0)
  // Delivery fee confirmation
  const [feeReceiptUrl,  setFeeReceiptUrl]  = useState('')
  const [feeConfirming,  setFeeConfirming]  = useState(false)
  const [feeConfirmErr,  setFeeConfirmErr]  = useState(null)
  const [feeConfirmed,   setFeeConfirmed]   = useState(false)

  const supabase = createClient()
  const { fetchOrderDetail, cancelOrder, requestRefund, approveRefund } = useOrders(entityId)

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId: eid, subRole: sr } = getRoleClaims(currentUser)
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
      await loadDetail(eid)
    }
    load()
  }, [id])

  async function loadDetail(eid) {
    setLoading(true)
    // Pass eid directly — React state (entityId) may not be set yet at call time
    const data = await fetchOrderDetail(id, eid ?? entityId)
    setDetail(data)
    setLoading(false)
  }

  const order        = detail?.order
  const items        = detail?.items ?? []
  const timeline     = detail?.timeline ?? []
  const refunds      = detail?.refunds ?? []
  const replacements = detail?.replacements ?? []

  const [availableBatches, setAvailableBatches] = useState({}) // productId → batch[]

  // Init invoice lines + fetch available batches when SO items load
  useEffect(() => {
    if (order?.order_type === 'SALES_ORDER' && items.length > 0 && entityId) {
      setInvoiceLines(items.map(item => ({
        order_item_id:    item.id,
        product_name:     item.name,
        product_id:       item.product_id,
        sku:              item.sku,
        original_quantity: item.quantity,
        unit_price:       item.unit_price,
        sub_batches: [{
          quantity:    item.quantity,
          batch_id:    null,
          unit_price:  item.unit_price,
        }],
      })))

      // Fetch available batches per product
      const productIds = [...new Set(items.map(i => i.product_id))]
      supabase
        .from('product_batches')
        .select('id, product_id, batch_number, expires_at, quantity, selling_price, mrp')
        .in('product_id', productIds)
        .eq('entity_id', entityId)
        .eq('status', 'ACTIVE')
        .gt('quantity', 0)
        .order('expires_at', { ascending: true, nullsFirst: false })
        .then(({ data }) => {
          const map = {}
          for (const b of (data || [])) {
            if (!map[b.product_id]) map[b.product_id] = []
            map[b.product_id].push(b)
          }
          setAvailableBatches(map)
        })
      setInvPayMethod(order.payment_method || 'CREDIT')
    }
  }, [detail?.items, order?.order_type])

  const canCancel  = order && CANCELLABLE_STATUSES.includes(order.status)
  const canRefund  = order && REFUNDABLE_STATUSES.includes(order.status)
  const isManager  = ['MANAGER', 'OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(subRole)
  const isSalesOrder  = order?.order_type === 'SALES_ORDER'
  const isSalesInvoice = order?.order_type === 'SALES_INVOICE'

  // Global keyboard shortcuts (only active when order is loaded)
  useEffect(() => {
    if (!order) return
    function onKey(e) {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (inInput) return
      if (e.key === 'Escape') { e.preventDefault(); router.push(ordersBackUrl()); return }
      if (e.key === 'F5')     { e.preventDefault(); loadDetail(entityId); return }
      if (e.key === 'F3' && isSalesOrder && order.status !== 'CANCELLED' && order.status !== 'CONFIRMED') {
        e.preventDefault(); setShowInvoice(v => !v); return
      }
      if (e.key === 'F3' && isSalesInvoice) {
        e.preventDefault(); handlePrintInvoice(); return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [order, isSalesOrder, entityId])

  function ordersBackUrl() {
    if (isSalesOrder)   return '/pos/orders?section=SALES&tab=SO'
    if (isSalesInvoice) return '/pos/orders?section=SALES&tab=SI'
    const t = order?.order_type === 'MARKETPLACE' ? 'MKT'
            : order?.order_source === 'WHATSAPP'  ? 'WA'
            : null
    if (t) return `/pos/orders?section=SALES&tab=${t}`
    return '/pos/orders?section=POS'
  }

  async function handleCreateInvoice(e) {
    e.preventDefault()
    setInvoicing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/sales/${id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          items: invoiceLines.map(l => ({
            order_item_id: l.order_item_id,
            sub_batches:   l.sub_batches.map(sb => ({
              quantity:   parseInt(sb.quantity, 10) || 1,
              batch_id:   sb.batch_id || undefined,
              unit_price: parseFloat(sb.unit_price) || l.unit_price,
            })),
          })),
          payment_method: invPayMethod,
          invoice_ref:    invRef || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInvoiceResult(data)
      await loadDetail(entityId)
    } catch (err) {
      setInvoiceResult({ error: err.message })
    } finally {
      setInvoicing(false)
    }
  }

  async function handlePrintInvoice() {
    const printEl = document.getElementById('sales-invoice-print')
    if (!printEl) return
    try {
      const { default: jsPDF }       = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printEl, { scale: 2, backgroundColor: '#fff', useCORS: true })
      const pdf = new jsPDF('p', 'mm', 'a5')
      const w = pdf.internal.pageSize.getWidth()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width)
      pdf.save(`${order.order_no}.pdf`)
    } catch (err) { console.error('Print error:', err) }
  }

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
        <Button variant="ghost" size="icon-sm" onClick={() => router.push(ordersBackUrl())}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <button onClick={() => router.push(ordersBackUrl())} className="hover:text-foreground transition-colors">Orders</button>
            <span>/</span>
            <span className="text-foreground font-mono font-medium truncate">{order.order_no}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {order.order_source === 'WHATSAPP' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </span>
            )}
            <OrderStatusBadge status={order.status} />
            <span className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleString('en-IN')}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={loadDetail} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {!isSalesOrder && !isSalesInvoice && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/pos/order/${id}`)}>
              <Receipt className="h-4 w-4 mr-1.5" /> View Receipt
            </Button>
          )}
          {isSalesInvoice && (
            <Button variant="outline" size="sm" onClick={handlePrintInvoice}>
              <Printer className="h-4 w-4 mr-1.5" /> Print Invoice
            </Button>
          )}
          {canRefund && !isSalesOrder && !isSalesInvoice && (
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
            {order.payment_ref && (
              <p className="text-xs text-muted-foreground">
                Journal: <span className="font-mono font-medium text-foreground">{order.payment_ref}</span>
              </p>
            )}
          </div>
        </div>

        {/* Pickup OTP — vendor gives this to rider at collection */}
        {order.order_type === 'MARKETPLACE' && order.pickup_otp && ['CONFIRMED', 'PROCESSING'].includes(order.status) && (
          <div className="p-3 rounded-lg border border-gold/30 bg-gold/5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Pickup OTP
            </p>
            <p className="text-xs text-muted-foreground">Give this code to the rider when they collect the order.</p>
            <p className="text-2xl font-mono font-bold text-gold tracking-[0.3em] text-center py-2">{order.pickup_otp}</p>
          </div>
        )}

        {/* Delivery fee — shown for MARKETPLACE orders after delivery */}
        {order.order_type === 'MARKETPLACE' && ['DELIVERED', 'COMPLETED'].includes(order.status) && (
          <div className="p-3 rounded-lg border border-border bg-card space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5" /> Delivery Fee
            </p>
            {order.delivery_fee ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rider charged</span>
                  <span className="font-semibold">Nu. {parseFloat(order.delivery_fee).toFixed(2)}</span>
                </div>
                {order.delivery_fee_paid ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-500/10 px-2 py-1.5 rounded">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Payment confirmed
                    {order.delivery_fee_receipt_url && (
                      <a href={order.delivery_fee_receipt_url} target="_blank" rel="noreferrer"
                        className="ml-auto text-primary hover:underline">View receipt</a>
                    )}
                  </div>
                ) : feeConfirmed ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-500/10 px-2 py-1.5 rounded">
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Payment confirmed
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Upload a screenshot of the payment receipt to confirm the rider was paid.</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={feeReceiptUrl}
                        onChange={e => setFeeReceiptUrl(e.target.value)}
                        placeholder="Paste receipt image URL"
                        className="flex-1 h-8 px-2 text-xs border border-input rounded bg-background"
                      />
                      <Button size="sm" className="h-8 px-3 text-xs"
                        disabled={feeConfirming || !feeReceiptUrl.trim()}
                        onClick={async () => {
                          setFeeConfirming(true); setFeeConfirmErr(null)
                          try {
                            const { data: { session } } = await supabase.auth.getSession()
                            const res = await fetch(`/api/shop/orders/${order.id}/confirm-delivery-fee`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
                              body: JSON.stringify({ receipt_url: feeReceiptUrl }),
                            })
                            const data = await res.json()
                            if (!res.ok) { setFeeConfirmErr(data.error); return }
                            setFeeConfirmed(true)
                            await loadDetail(entityId)
                          } catch (err) { setFeeConfirmErr(err.message) }
                          finally { setFeeConfirming(false) }
                        }}>
                        {feeConfirming ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                      </Button>
                    </div>
                    {feeConfirmErr && <p className="text-xs text-tibetan">{feeConfirmErr}</p>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Awaiting rider to submit delivery cost.</p>
            )}
          </div>
        )}

        {/* Customer details — shown for all CREDIT orders */}
        {order.payment_method === 'CREDIT' && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Customer (Credit)
            </p>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">
                {detail?.customerName ?? (order.buyer_hash ? 'Face-ID Customer' : 'Unknown Customer')}
              </p>
              {(order.buyer_whatsapp || order.buyer_phone) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span>{order.buyer_whatsapp ?? order.buyer_phone}</span>
                </div>
              )}
            </div>
            {detail?.khataAccount ? (
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className="font-semibold text-tibetan">
                      Nu. {parseFloat(detail.khataAccount.outstanding_balance ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Limit</p>
                    <p className="font-semibold">
                      Nu. {parseFloat(detail.khataAccount.credit_limit ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">After order</p>
                    <p className="font-semibold text-amber-600">
                      Nu. {(parseFloat(detail.khataAccount.outstanding_balance ?? 0) + parseFloat(order.grand_total)).toFixed(2)}
                    </p>
                  </div>
                </div>
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-1 pt-0.5"
                  onClick={() => router.push(`/pos/khata?phone=${encodeURIComponent(order.buyer_whatsapp ?? order.buyer_phone)}`)}
                >
                  <CreditCard className="h-3 w-3" /> View full Khata ledger
                </button>
              </div>
            ) : (
              <div className="pt-1 space-y-2">
                <p className="text-xs text-muted-foreground">No khata account found for this customer.</p>
                {isManager && (order.buyer_whatsapp || order.buyer_phone) && (
                  <CreateKhataButton
                    phone={order.buyer_whatsapp ?? order.buyer_phone}
                    name={detail?.customerName}
                    entityId={entityId}
                    onCreated={loadDetail}
                  />
                )}
              </div>
            )}
          </div>
        )}

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
                    {parseFloat(item.discount) > 0 && (
                      <span className="text-emerald-600">
                        {item.discount_type === 'PERCENTAGE'
                          ? ` (−${item.discount_value}% = Nu.${parseFloat(item.discount).toFixed(2)} disc.)`
                          : ` (−Nu.${parseFloat(item.discount).toFixed(2)} disc.)`}
                      </span>
                    )}
                  </p>
                  {item.batch?.batch_number && (
                    <p className="text-[10px] text-blue-600">
                      Batch: {item.batch.batch_number}
                      {item.batch.expires_at ? ` · Exp: ${new Date(item.batch.expires_at).toLocaleDateString()}` : ''}
                    </p>
                  )}
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

        {/* ── SALES ORDER: Create Invoice button ───────────────────────────── */}
        {isSalesOrder && order.status !== 'CANCELLED' && order.status !== 'CONFIRMED' && (
          <Button onClick={() => setShowInvoice(true)} className="w-full gap-2">
            <Plus className="h-4 w-4" /> Create Sales Invoice [F3]
          </Button>
        )}

        {isSalesOrder && order.status === 'CONFIRMED' && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-sm text-emerald-700 font-medium">
            <CheckCircle className="h-4 w-4 shrink-0" /> All items fully invoiced — Sales Order complete.
          </div>
        )}

        {isSalesOrder && order.status === 'PARTIALLY_FULFILLED' && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-700 font-medium">
            Partially fulfilled — create another invoice for remaining items.
          </div>
        )}

      </div>

      {/* Shortcut bar */}
      <ShortcutBar shortcuts={[
        ...(isSalesOrder && order.status !== 'CANCELLED' && order.status !== 'CONFIRMED'
          ? [{ key: 'F3', label: showInvoice ? 'Close invoice form' : 'Create Invoice' }]
          : []),
        ...(isSalesInvoice ? [{ key: 'F3', label: 'Print Invoice' }] : []),
        { key: 'F5',  label: 'Refresh' },
        { key: 'Esc', label: 'Back to Orders' },
      ]} />

      {/* Hidden print area for Sales Invoice */}
      {isSalesInvoice && (
        <div className="hidden">
          <div id="sales-invoice-print" className="bg-white p-6 max-w-md font-sans text-sm" style={{ color: '#000' }}>
            <div className="text-center mb-4">
              <p className="text-lg font-bold">SALES INVOICE</p>
              <p className="text-xs text-gray-500">Bhutan GST 2026</p>
            </div>
            <div className="mb-3 space-y-0.5">
              <p><strong>Invoice No:</strong> {order?.order_no}</p>
              {order?.sales_order_id && <p><strong>Sales Order:</strong> {order.sales_order?.order_no || order.sales_order_id}</p>}
              <p><strong>Date:</strong> {new Date(order?.created_at).toLocaleDateString()}</p>
              <p><strong>Customer:</strong> {detail?.customerName || order?.buyer_whatsapp}</p>
              <p><strong>Payment:</strong> {order?.payment_method}</p>
            </div>
            <table className="w-full border-collapse text-xs mb-3">
              <thead><tr className="border-b border-gray-300">
                <th className="text-left py-1">Product</th><th className="text-right py-1">Qty</th>
                <th className="text-right py-1">Price</th><th className="text-right py-1">Total</th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-1">{item.name}{item.batch?.batch_number ? ` (Batch ${item.batch.batch_number})` : ''}</td>
                    <td className="py-1 text-right">{item.quantity}</td>
                    <td className="py-1 text-right">Nu. {parseFloat(item.unit_price||0).toFixed(2)}</td>
                    <td className="py-1 text-right">Nu. {parseFloat(item.total||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>Nu. {parseFloat(order?.subtotal||0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>GST (5%)</span><span>Nu. {parseFloat(order?.gst_total||0).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1"><span>Total</span><span>Nu. {parseFloat(order?.grand_total||0).toFixed(2)}</span></div>
            </div>
            {order?.digital_signature && (
              <p className="text-[9px] text-gray-400 mt-3 break-all">Sig: {order.digital_signature}</p>
            )}
            <p className="text-center text-[9px] text-gray-400 mt-2">Compliant with Bhutan GST Act 2026 · Ministry of Finance</p>
          </div>
        </div>
      )}

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

      {/* ── Full-screen Sales Invoice creation overlay ─────────────────────── */}
      {showInvoice && isSalesOrder && (
        <SalesInvoiceOverlay
          order={order}
          invoiceLines={invoiceLines}
          setInvoiceLines={setInvoiceLines}
          availableBatches={availableBatches}
          invPayMethod={invPayMethod}
          setInvPayMethod={setInvPayMethod}
          invRef={invRef}
          setInvRef={setInvRef}
          invoicing={invoicing}
          invoiceResult={invoiceResult}
          selectedLine={selectedLine}
          setSelectedLine={setSelectedLine}
          onSubmit={handleCreateInvoice}
          onClose={() => { setShowInvoice(false); setInvoiceResult(null) }}
        />
      )}
    </div>
  )
}

function SalesInvoiceOverlay({
  order, invoiceLines, setInvoiceLines, availableBatches,
  invPayMethod, setInvPayMethod, invRef, setInvRef,
  invoicing, invoiceResult, selectedLine, setSelectedLine,
  onSubmit, onClose,
}) {
  // Keyboard: Esc = close, ↑↓ = navigate lines, F5 = submit
  useEffect(() => {
    function onKey(e) {
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if (e.key === 'Escape' && !inInput) { e.preventDefault(); onClose(); return }
      if (e.key === 'F5') { e.preventDefault(); onSubmit(e); return }
      if (e.key === 'ArrowDown' && !inInput) {
        e.preventDefault()
        setSelectedLine(r => invoiceLines.length > 0 ? (r + 1) % invoiceLines.length : 0)
      }
      if (e.key === 'ArrowUp' && !inInput) {
        e.preventDefault()
        setSelectedLine(r => invoiceLines.length > 0 ? (r - 1 + invoiceLines.length) % invoiceLines.length : 0)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [invoiceLines, onSubmit, onClose])

  const allBatchesSelected = invoiceLines.every(l => l.sub_batches.every(sb => sb.batch_id))
  const allQtyMatch = invoiceLines.every(l =>
    l.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0) === l.original_quantity
  )
  const canSubmit = !invoicing && allBatchesSelected && allQtyMatch

  const grandTotal = invoiceLines.reduce((sum, l) =>
    sum + l.sub_batches.reduce((s, sb) =>
      s + (parseFloat(sb.unit_price) || 0) * (parseInt(sb.quantity, 10) || 0), 0
    ), 0
  )

  // ── Success screen ───────────────────────────────────────────────────────
  if (invoiceResult && !invoiceResult.error) {
    const inv = invoiceResult.invoice
    const printId = 'si-print-' + inv.id

    async function handlePrint() {
      const el = document.getElementById(printId)
      if (!el) return
      const { default: jsPDF }       = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true })
      const pdf = new jsPDF('p', 'mm', 'a5')
      const w = pdf.internal.pageSize.getWidth()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, (canvas.height * w) / canvas.width)
      pdf.save(`${inv.order_no}.pdf`)
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="glassmorphism border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
              <span>Orders</span><span>/</span>
              <span className="font-mono">{order.order_no}</span><span>/</span>
              <span className="text-foreground font-medium">{inv.order_no}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" /> Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/pos/orders/${inv.id}`)} className="gap-1.5">
            <Receipt className="h-4 w-4" /> View Invoice
          </Button>
          <Button size="sm" onClick={onClose} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Order
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 w-full max-w-lg">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">{inv.order_no} created</p>
              <p className="text-xs text-emerald-600">
                SO {invoiceResult.so_status === 'CONFIRMED' ? 'fully fulfilled' : 'partially fulfilled'}
                {inv.payment_method && ` · ${inv.payment_method}`}
              </p>
            </div>
          </div>

          {/* Printable invoice preview */}
          <div id={printId} className="bg-white border border-border rounded-xl p-6 w-full max-w-lg text-sm font-sans" style={{ color: '#000' }}>
            <div className="text-center mb-4 border-b border-gray-200 pb-3">
              <p className="text-lg font-bold tracking-wide">SALES INVOICE</p>
              <p className="text-xs text-gray-500">Bhutan GST Act 2026</p>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs mb-4">
              <div><span className="text-gray-500">Invoice No:</span> <strong>{inv.order_no}</strong></div>
              <div><span className="text-gray-500">Date:</span> {new Date(inv.created_at || Date.now()).toLocaleDateString()}</div>
              <div><span className="text-gray-500">Sales Order:</span> {order.order_no}</div>
              <div><span className="text-gray-500">Payment:</span> {inv.payment_method}</div>
              {(inv.buyer_whatsapp || order.buyer_whatsapp) && (
                <div className="col-span-2"><span className="text-gray-500">Customer:</span> {inv.buyer_whatsapp ?? order.buyer_whatsapp}</div>
              )}
              {inv.invoice_ref && (
                <div className="col-span-2"><span className="text-gray-500">Ref:</span> {inv.invoice_ref}</div>
              )}
            </div>
            <table className="w-full border-collapse text-xs mb-4">
              <thead>
                <tr className="border-b-2 border-gray-300 text-left">
                  <th className="py-1.5 pr-2">Product</th>
                  <th className="py-1.5 px-2 text-right">Qty</th>
                  <th className="py-1.5 px-2 text-right">Unit Price</th>
                  <th className="py-1.5 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(inv.items || invoiceLines.flatMap(l => l.sub_batches.map(sb => ({
                  name: l.product_name, sku: l.sku,
                  quantity: parseInt(sb.quantity, 10) || 0,
                  unit_price: parseFloat(sb.unit_price) || 0,
                  total: ((parseFloat(sb.unit_price) || 0) * (parseInt(sb.quantity, 10) || 0) * 1.05),
                  batch_number: availableBatches[l.product_id]?.find(b => b.id === sb.batch_id)?.batch_number,
                })))).map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">
                      {item.name}
                      {item.batch_number && <span className="text-gray-400 ml-1">· {item.batch_number}</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right">{item.quantity}</td>
                    <td className="py-1.5 px-2 text-right">Nu. {parseFloat(item.unit_price || 0).toFixed(2)}</td>
                    <td className="py-1.5 pl-2 text-right">Nu. {parseFloat(item.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-xs border-t border-gray-200 pt-2">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>Nu. {parseFloat(inv.subtotal ?? grandTotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GST (5%)</span><span>Nu. {parseFloat(inv.gst_total ?? grandTotal * 0.05).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 mt-1">
                <span>Total</span><span>Nu. {parseFloat(inv.grand_total ?? grandTotal * 1.05).toFixed(2)}</span>
              </div>
            </div>
            <p className="text-center text-[9px] text-gray-400 mt-4 pt-2 border-t border-gray-100">
              Computer-generated · Compliant with Bhutan GST Act 2026 · Ministry of Finance
            </p>
          </div>
        </div>

        <ShortcutBar shortcuts={[
          { key: 'Esc', label: 'Back to Order' },
        ]} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background select-none">
      {/* Header */}
      <header className="glassmorphism border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <span>Orders</span>
            <span>/</span>
            <span className="font-mono">{order.order_no}</span>
            <span>/</span>
            <span className="text-foreground font-medium">Create Invoice</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{invoiceLines.length} line{invoiceLines.length !== 1 ? 's' : ''}</p>
        </div>
        {grandTotal > 0 && (
          <span className="text-sm font-bold text-primary tabular-nums shrink-0">
            Nu. {(grandTotal * 1.05).toFixed(2)}
          </span>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close [Esc]">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — invoice metadata */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col p-4 gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Details</p>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Payment Method</label>
            <select value={invPayMethod} onChange={e => setInvPayMethod(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-input rounded bg-background">
              {['ONLINE','CASH','CREDIT'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Invoice Reference</label>
            <input value={invRef} onChange={e => setInvRef(e.target.value)}
              placeholder="e.g. SI-001"
              className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
          </div>

          <div className="border-t border-border pt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-[10px] uppercase tracking-wide mb-2">Status</p>
            {invoiceLines.map((l, i) => {
              const qty = l.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0)
              const ok = qty === l.original_quantity && l.sub_batches.every(sb => sb.batch_id)
              return (
                <button key={l.order_item_id} onClick={() => setSelectedLine(i)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                    selectedLine === i ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                  }`}>
                  <span className="truncate max-w-[130px]">{l.product_name}</span>
                  <span className={`text-[10px] font-mono font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {qty}/{l.original_quantity}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-auto border-t border-border pt-3 space-y-1">
            {[
              ['↑↓',    'Navigate lines'],
              ['F5',    'Create invoice'],
              ['Esc',   'Cancel'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-muted border border-border rounded min-w-[36px] text-center">{k}</span>
                <span className="text-[10px] text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — line item batch assignment */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {invoiceLines.map((line, lineIdx) => {
              const isSelected = selectedLine === lineIdx
              const totalQty = line.sub_batches.reduce((s, sb) => s + (parseInt(sb.quantity, 10) || 0), 0)
              const mismatch = totalQty !== line.original_quantity
              const productBatches = availableBatches[line.product_id] || []

              function updateSB(sbIdx, field, value) {
                setInvoiceLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: l.sub_batches.map((sb, si) => si !== sbIdx ? sb : { ...sb, [field]: value })
                }))
              }
              function addSB() {
                setInvoiceLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: [...l.sub_batches, { quantity: '', batch_id: null, unit_price: l.unit_price }]
                }))
              }
              function removeSB(sbIdx) {
                setInvoiceLines(prev => prev.map((l, li) => li !== lineIdx ? l : {
                  ...l, sub_batches: l.sub_batches.filter((_, si) => si !== sbIdx)
                }))
              }

              return (
                <div key={line.order_item_id}
                  onClick={() => setSelectedLine(lineIdx)}
                  className={`border-b border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}>
                  {/* Line header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 border-l-2 transition-colors ${
                    isSelected ? 'border-primary' : 'border-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      {isSelected && <span className="text-primary text-xs">►</span>}
                      <p className="text-sm font-medium">{line.product_name}</p>
                      <span className="text-xs text-muted-foreground font-mono">{line.sku}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold tabular-nums ${mismatch ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {totalQty} / {line.original_quantity} units
                      </span>
                      <button type="button" onClick={e => { e.stopPropagation(); addSB() }}
                        className="text-xs text-primary hover:underline font-medium px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/5">
                        + Batch
                      </button>
                    </div>
                  </div>

                  {/* Sub-batch rows */}
                  <div className="px-4 pb-3 space-y-2">
                    {line.sub_batches.map((sb, sbIdx) => {
                      const selectedBatch = sb.batch_id ? productBatches.find(pb => pb.id === sb.batch_id) : null
                      const usedElsewhere = sb.batch_id
                        ? line.sub_batches.reduce((sum, other, oi) =>
                            oi !== sbIdx && other.batch_id === sb.batch_id
                              ? sum + (parseInt(other.quantity, 10) || 0) : sum, 0)
                        : 0
                      const maxQty = selectedBatch ? Math.max(0, selectedBatch.quantity - usedElsewhere) : Infinity
                      const enteredQty = parseInt(sb.quantity, 10) || 0
                      const overBatch = sb.batch_id && enteredQty > maxQty

                      return (
                        <div key={sbIdx} className="grid grid-cols-12 gap-2 items-end" onClick={e => e.stopPropagation()}>
                          {/* Batch selector */}
                          <div className="col-span-5">
                            {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Batch</label>}
                            {productBatches.length > 0 ? (
                              <select
                                value={sb.batch_id || ''}
                                onChange={e => {
                                  const batch = productBatches.find(b => b.id === e.target.value)
                                  if (batch) {
                                    updateSB(sbIdx, 'batch_id', batch.id)
                                    updateSB(sbIdx, 'unit_price', batch.selling_price ?? batch.mrp ?? sb.unit_price)
                                  } else {
                                    updateSB(sbIdx, 'batch_id', null)
                                  }
                                }}
                                className="w-full h-8 px-2 text-xs border border-input rounded bg-background"
                              >
                                <option value="">— Select batch —</option>
                                {productBatches.map(b => (
                                  <option key={b.id} value={b.id}>
                                    {b.batch_number} · {b.quantity} in stock{b.expires_at ? ` · exp ${new Date(b.expires_at).toLocaleDateString()}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <p className="text-xs text-amber-600 h-8 flex items-center">No active batches</p>
                            )}
                          </div>

                          {/* Qty */}
                          <div className="col-span-3">
                            {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Qty</label>}
                            <input
                              type="number" min="1"
                              max={selectedBatch ? maxQty : undefined}
                              value={sb.quantity}
                              onChange={e => {
                                const v = parseInt(e.target.value, 10) || 0
                                updateSB(sbIdx, 'quantity', selectedBatch && v > maxQty ? maxQty : e.target.value)
                              }}
                              className={`w-full h-8 px-2 text-sm border rounded bg-background ${overBatch ? 'border-tibetan' : 'border-input'}`}
                            />
                            {selectedBatch && (
                              <p className={`text-[10px] mt-0.5 ${overBatch ? 'text-tibetan font-medium' : 'text-muted-foreground'}`}>
                                {overBatch ? `Max ${maxQty}` : `${maxQty} avail.`}
                              </p>
                            )}
                          </div>

                          {/* Unit price */}
                          <div className="col-span-3">
                            {sbIdx === 0 && <label className="text-[10px] text-muted-foreground block mb-0.5">Unit Price</label>}
                            <input type="number" step="0.01" value={sb.unit_price || ''}
                              onChange={e => updateSB(sbIdx, 'unit_price', e.target.value)}
                              className="w-full h-8 px-2 text-sm border border-input rounded bg-background" />
                          </div>

                          {/* Remove */}
                          <div className="col-span-1 flex items-end pb-0.5">
                            {line.sub_batches.length > 1 && (
                              <button type="button" onClick={() => removeSB(sbIdx)}
                                className="text-muted-foreground hover:text-tibetan transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals + submit */}
          <div className="border-t border-border px-4 py-3 space-y-2 shrink-0 bg-muted/10">
            {invoiceResult?.error && (
              <p className="text-xs text-tibetan bg-tibetan/10 px-3 py-2 rounded">{invoiceResult.error}</p>
            )}
            {!allBatchesSelected && <p className="text-xs text-amber-600">⚠ Select a batch for every line.</p>}
            {allBatchesSelected && !allQtyMatch && <p className="text-xs text-amber-600">⚠ Batch quantities must match ordered quantities.</p>}
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm tabular-nums text-muted-foreground">
                Subtotal <strong>Nu. {grandTotal.toFixed(2)}</strong>
                <span className="mx-2">·</span>
                GST (5%) <strong>Nu. {(grandTotal * 0.05).toFixed(2)}</strong>
                <span className="mx-2">·</span>
                <span className="text-base font-bold text-primary">Total Nu. {(grandTotal * 1.05).toFixed(2)}</span>
              </div>
              <Button onClick={onSubmit} disabled={!canSubmit} className="h-10 px-8 shrink-0">
                {invoicing
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                  : 'Create Invoice [F5]'}
              </Button>
            </div>
          </div>

          <ShortcutBar shortcuts={[
            { key: '↑↓',  label: 'Navigate lines' },
            { key: 'F5',  label: 'Create invoice' },
            { key: 'Esc', label: 'Cancel' },
          ]} />
        </div>
      </div>
    </div>
  )
}

function CreateKhataButton({ phone, name, entityId, onCreated }) {
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const { createAccount } = useKhata(entityId)

  async function handleCreate() {
    setLoading(true)
    const supabase = createClient()
    const { data: customerEntity } = await supabase
      .from('entities')
      .select('name')
      .eq('whatsapp_no', phone)
      .single()

    const { error } = await createAccount({
      party_type:   'CONSUMER',
      debtor_phone: phone,
      debtor_name:  name ?? customerEntity?.name ?? `Customer ${phone.slice(-4)}`,
      credit_limit: 1000,
    })

    setLoading(false)
    if (!error) { setDone(true); onCreated() }
  }

  if (done) return null

  return (
    <Button size="sm" variant="outline" onClick={handleCreate} disabled={loading} className="h-7 text-xs gap-1.5">
      {loading ? <><Loader2 className="h-3 w-3 animate-spin" /> Creating...</> : <><CreditCard className="h-3 w-3" /> Create Khata Account</>}
    </Button>
  )
}
