"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, RefreshCw, ShoppingBag, MessageCircle, Plus, Store, FileText, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { useOrders } from "@/hooks/use-orders"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

const POS_FILTERS = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUNDS']

const SO_STATUS_COLORS = {
  DRAFT:                'bg-muted text-muted-foreground border-border',
  PARTIALLY_FULFILLED:  'bg-amber-500/10 text-amber-600 border-amber-500/20',
  CONFIRMED:            'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  CANCELLED:            'bg-tibetan/10 text-tibetan border-tibetan/20',
}

function SalesBadge({ status }) {
  const cls = SO_STATUS_COLORS[status] || 'bg-muted text-muted-foreground'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>{status?.replace('_', ' ')}</span>
}

export default function OrdersPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <OrdersPage />
    </Suspense>
  )
}

function OrdersPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [entityId, setEntityId]     = useState(null)
  const [search,   setSearch]       = useState('')
  const [subRole,  setSubRole]      = useState('CASHIER')
  const [section,  setSection]      = useState(() => {
    const s = searchParams.get('section')
    return s || 'SALES'
  })
  const effectiveSection = subRole === 'CASHIER' ? 'POS' : section
  const [salesTab, setSalesTab]     = useState(() => searchParams.get('tab') || 'SO')
  const [salesOrders, setSalesOrders] = useState([])
  const [salesLoading, setSalesLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
    }
    load()
  }, [])

  const { orders, loading, filter, setFilter, fetchOrders } = useOrders(entityId)

  // Fetch sales orders/invoices
  useEffect(() => {
    if (section !== 'SALES' || !entityId) return
    loadSalesOrders()
  }, [section, salesTab, entityId])

  async function loadSalesOrders() {
    setSalesLoading(true)
    let query = supabase
      .from('orders')
      .select('id, order_no, order_type, order_source, status, grand_total, gst_total, buyer_whatsapp, payment_method, created_at, sales_order_id, sales_orders:orders!sales_order_id(order_no)')
      .eq('seller_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (salesTab === 'SO')  query = query.eq('order_type', 'SALES_ORDER')
    else if (salesTab === 'SI')  query = query.eq('order_type', 'SALES_INVOICE')
    else if (salesTab === 'MKT') query = query.eq('order_type', 'MARKETPLACE')
    else if (salesTab === 'WA')  query = query.eq('order_source', 'WHATSAPP')

    const { data } = await query
    setSalesOrders(data || [])
    setSalesLoading(false)
  }

  const displayedPOS = orders.filter(o => {
    const matchesSearch =
      !search.trim() ||
      o.order_no.toLowerCase().includes(search.toLowerCase()) ||
      (o.buyer_whatsapp ?? '').includes(search)
    if (filter === 'MARKETPLACE') return matchesSearch && o.order_type === 'MARKETPLACE'
    return matchesSearch
  })

  const displayedSales = salesOrders.filter(o =>
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
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <span className="text-foreground font-medium">Orders</span>
            {effectiveSection === 'SALES' && (
              <>
                <span>/</span>
                <span className="text-foreground font-medium">
                  {salesTab === 'SO' ? 'Sales Orders' : salesTab === 'SI' ? 'Invoices' : salesTab === 'MKT' ? 'Marketplace' : 'WhatsApp'}
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {effectiveSection === 'SALES' ? `${salesOrders.length} ${salesTab === 'SO' ? 'sales orders' : 'invoices'}` : `${orders.length} orders`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={effectiveSection === 'SALES' ? loadSalesOrders : fetchOrders}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        {['MANAGER', 'OWNER', 'ADMIN'].includes(subRole) && (
          <Button size="sm" onClick={() => router.push('/salesorder')} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Order
          </Button>
        )}
      </div>

      {/* Section tabs */}
      {subRole !== 'CASHIER' && (
        <div className="px-4 pt-3 pb-1 flex gap-2 shrink-0">
          <button
            onClick={() => setSection('SALES')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              section === 'SALES' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> Sales
          </button>
          <button
            onClick={() => setSection('POS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              section === 'POS' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" /> POS Orders
          </button>
        </div>
      )}

      {/* Sub-tabs + search */}
      <div className="px-4 py-2 space-y-2 shrink-0 border-b border-border">
        {effectiveSection === 'SALES' && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {[
              ['SO',  'Sales Orders',  FileText],
              ['SI',  'Invoices',      Receipt],
              ['MKT', 'Marketplace',   Store],
              ['WA',  'WhatsApp',      MessageCircle],
            ].map(([key, label, Icon]) => (
              <button key={key} onClick={() => setSalesTab(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  salesTab === key ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                <Icon className="h-3 w-3" />{label}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by order no. or WhatsApp..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {effectiveSection === 'POS' && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {POS_FILTERS.map(f => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
                className={`shrink-0 ${filter === f ? 'bg-primary' : ''}`}>
                {f === 'MARKETPLACE'
                  ? <span className="flex items-center gap-1"><Store className="h-3 w-3" /> Marketplace</span>
                  : f.charAt(0) + f.slice(1).toLowerCase()
                }
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {/* POS orders */}
        {effectiveSection === 'POS' && (
          loading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : displayedPOS.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <ShoppingBag className="h-10 w-10 opacity-20" /><p className="text-sm">No orders found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayedPOS.map(order => (
                <button key={order.id} onClick={() => router.push(`/pos/orders/${order.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-mono font-medium text-foreground">{order.order_no}</p>
                      {order.order_source === 'WHATSAPP' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <MessageCircle className="h-3 w-3" /> WA
                        </span>
                      )}
                      {order.order_type === 'MARKETPLACE' && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          <Store className="h-3 w-3" /> MKT
                        </span>
                      )}
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
          )
        )}

        {/* Sales orders / invoices */}
        {effectiveSection === 'SALES' && (
          salesLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
          ) : displayedSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-20" />
              <p className="text-sm">No {salesTab === 'SO' ? 'sales orders' : 'invoices'} yet</p>
              {salesTab === 'SO' && ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole) && (
                <Button size="sm" onClick={() => router.push('/salesorder')}>
                  <Plus className="h-4 w-4 mr-1" /> Create Sales Order
                </Button>
              )}
            </div>
          ) : (
            <div>
              <div className="divide-y divide-border">
                {displayedSales.map(order => (
                  <button key={order.id} onClick={() => router.push(`/pos/orders/${order.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-mono font-medium">{order.order_no}</p>
                        <SalesBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                        {order.buyer_whatsapp && <span>{order.buyer_whatsapp}</span>}
                        <span>{order.payment_method}</span>
                        {salesTab === 'SI' && order.sales_order_id && (
                          <span className="text-primary text-[10px]">← {order.sales_orders?.order_no || 'SO'}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-primary">Nu. {parseFloat(order.grand_total).toFixed(2)}</p>
                    </div>
                  </button>
                ))}
              </div>
              {salesTab === 'SO' && ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole) && (
                <div className="sticky bottom-0 p-3 bg-background/95 backdrop-blur border-t border-border">
                  <Button className="w-full" onClick={() => router.push('/salesorder')}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Sales Order
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
