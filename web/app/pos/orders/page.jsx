"use client"

import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Search, RefreshCw, ShoppingBag, MessageCircle, Plus, Store, FileText, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { useOrders } from "@/hooks/use-orders"
import { getUser, getRoleClaims } from "@/lib/auth"

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
    const params = new URLSearchParams({ tab: salesTab })
    try {
      const res = await fetch(`/api/pos/orders/sales?${params}`)
      if (res.ok) {
        const { orders } = await res.json()
        setSalesOrders(orders || [])
      }
    } catch {}
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

  // The order register (spec WF-09) — counter orders and sales vouchers, each as its own register.
  //
  // Both lists answer "which order was that, and what was it worth", which is a column read: the
  // voucher number down one side, the amount down the other. The section switch changes WHICH
  // register is on screen rather than reflowing the page.
  const money = (n) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')

  const POS_COLUMNS = [
    { key: 'order_no', label: 'Order No', width: 170 },
    { key: 'date',     label: 'Date',     width: 120 },
    { key: 'source',   label: 'Source',   width: 120 },
    { key: 'buyer',    label: 'Customer' },
    { key: 'method',   label: 'Payment',  width: 110 },
    { key: 'status',   label: 'Status',   width: 150 },
    { key: 'gst',      label: 'GST',      width: 110, align: 'right' },
    { key: 'total',    label: 'Amount',   width: 130, align: 'right' },
  ]

  const SALES_COLUMNS = [
    { key: 'order_no', label: salesTab === 'SI' ? 'Invoice No' : 'Order No', width: 170 },
    { key: 'date',     label: 'Date',     width: 120 },
    { key: 'buyer',    label: 'Customer' },
    { key: 'against',  label: 'Against',  width: 150 },
    { key: 'method',   label: 'Payment',  width: 110 },
    { key: 'status',   label: 'Status',   width: 150 },
    { key: 'total',    label: 'Amount',   width: 130, align: 'right' },
  ]

  const posRows = displayedPOS.map(o => ({
    id: o.id,
    order_no: o.order_no,
    date: day(o.created_at),
    source: o.order_source === 'WHATSAPP' ? 'WhatsApp' : o.order_type === 'MARKETPLACE' ? 'Marketplace' : 'Counter',
    buyer: o.buyer_whatsapp || o.buyer_phone || 'Walk-in',
    method: o.payment_method ?? '—',
    status: o.status ?? '—',
    gst: money(o.gst_total),
    total: money(o.grand_total),
  }))

  const salesRows = displayedSales.map(o => ({
    id: o.id,
    order_no: o.order_no,
    date: day(o.created_at),
    buyer: o.buyer_whatsapp || o.buyer_phone || '—',
    against: salesTab === 'SI' && o.sales_order_id ? (o.sales_orders?.order_no || 'SO') : '—',
    method: o.payment_method ?? '—',
    status: o.status ?? '—',
    total: money(o.grand_total),
  }))

  const onSales = effectiveSection === 'SALES'
  const rows = onSales ? salesRows : posRows
  const busy = onSales ? salesLoading : loading
  const total = (onSales ? displayedSales : displayedPOS)
    .reduce((sum, o) => sum + parseFloat(o.grand_total ?? 0), 0)
  const canManage = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)

  const SALES_TABS = [['SO', 'Sales Orders'], ['SI', 'Invoices'], ['MKT', 'Marketplace']]

  return (
    <OfficeShell
      crumb="Sale Management"
      title={onSales
        ? (salesTab === 'SO' ? 'Sales Order Register' : salesTab === 'SI' ? 'Sales Invoice Register' : 'Marketplace Register')
        : 'Order Register'}
      keys={[
        ...(onSales && salesTab === 'SO' && canManage
          ? [{ key: 'N', label: 'New Sales Order', onClick: () => router.push('/salesorder') }] : []),
        ...(subRole !== 'CASHIER'
          ? [{ key: 'V', label: onSales ? 'Counter Orders' : 'Sales Vouchers', onClick: () => setSection(onSales ? 'POS' : 'SALES') }] : []),
        { key: 'R', label: 'Refresh', onClick: () => (onSales ? loadSalesOrders() : fetchOrders()) },
        ...withHandlers(REPORT_KEYS, {
          P: () => window.print(),
          'Ctrl+⇧L': () => router.push('/pos/stores'),
        }),
      ]}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        {subRole !== 'CASHIER' && [['SALES', 'Sales'], ['POS', 'Counter Orders']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSection(key)}
            className="px-3 py-1 text-[11px] border"
            style={{
              borderColor: 'var(--office-line)',
              background: effectiveSection === key ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
              color: effectiveSection === key ? '#fff' : undefined,
              fontWeight: effectiveSection === key ? 700 : 400,
            }}>
            {label}
          </button>
        ))}

        {onSales && SALES_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSalesTab(key)}
            className="px-2 py-1 text-[11px] border"
            style={{
              borderColor: 'var(--office-line)',
              background: salesTab === key ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
              color: salesTab === key ? '#fff' : undefined,
            }}>
            {label}
          </button>
        ))}

        {!onSales && POS_FILTERS.map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className="px-2 py-1 text-[11px] border"
            style={{
              borderColor: 'var(--office-line)',
              background: filter === f ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
              color: filter === f ? '#fff' : undefined,
            }}>
            {f}
          </button>
        ))}

        <label className="flex items-center gap-1.5 ml-2">
          <span className="sr-only">Search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="order no or phone"
            className="px-1.5 py-0.5 border bg-white w-56" style={{ borderColor: 'var(--office-line)' }} />
        </label>

        <span className="ml-auto opacity-75">{rows.length} {onSales ? 'voucher' : 'order'}{rows.length === 1 ? '' : 's'}</span>
      </div>

      {busy ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={onSales ? SALES_COLUMNS : POS_COLUMNS}
          rows={rows}
          totals={{ order_no: 'Total', total: money(total) }}
          onOpen={(row) => router.push(`/pos/orders/${row.id}`)}
          openOnClick
          empty={onSales ? 'No vouchers found.' : 'No orders found.'}
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">Enter opens the selected voucher. Amounts in Nu.</p>
    </OfficeShell>
  )
}
