"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePurchases } from "@/hooks/use-purchases"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// The purchase register (spec WF-09) — orders and invoices, each as its own register.
//
// A buyer checks this screen to answer one question at a time: what is outstanding with whom,
// and for how much. That reads as a register with the amount column aligned and a total under
// it, so the tab switch changes WHICH register is on screen rather than reflowing the page.
const money = (v) => parseFloat(v ?? 0).toFixed(2)
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') : '—')

const COLUMNS_PO = [
  { key: 'order_no', label: 'Order No',  width: 130 },
  { key: 'date',     label: 'Date',      width: 110 },
  { key: 'supplier', label: 'Supplier',  width: '26%' },
  { key: 'status',   label: 'Status',    width: 150 },
  { key: 'due',      label: 'Due',       width: 110 },
  { key: 'method',   label: 'Payment',   width: 110 },
  { key: 'total',    label: 'Amount',    align: 'right' },
]

const COLUMNS_INV = [
  { key: 'order_no', label: 'Invoice No', width: 130 },
  { key: 'date',     label: 'Date',       width: 110 },
  { key: 'supplier', label: 'Supplier',   width: '26%' },
  { key: 'status',   label: 'Status',     width: 150 },
  { key: 'against',  label: 'Against PO', width: 130 },
  { key: 'method',   label: 'Payment',    width: 110 },
  { key: 'total',    label: 'Amount',     align: 'right' },
]

export default function PurchasesPage() {
  const router = useRouter()
  const { purchases, loading, error, fetchPurchases } = usePurchases()
  const [tab, setTab] = useState('PO') // 'PO' | 'INVOICE'

  useEffect(() => {
    getUser().then(user => {
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      if (subRole === 'CASHIER') return router.push('/pos')
    })
  }, [])

  useEffect(() => { fetchPurchases({ type: tab }) }, [tab])

  const supplierName = (p) => p.seller?.name || p.supplier_name || 'Unknown Supplier'

  const rows = purchases.map(p => ({
    id: p.id,
    order_no: p.order_no,
    date: day(p.created_at),
    supplier: supplierName(p),
    status: p.status,
    due: p.expected_delivery ? day(p.expected_delivery) : '—',
    against: p.purchase_order_no || (p.purchase_order_id ? p.purchase_order_id.slice(0, 8) : '—'),
    method: p.payment_method ?? '—',
    total: money(p.grand_total),
  }))

  const total = purchases.reduce((sum, p) => sum + parseFloat(p.grand_total ?? 0), 0)
  const isPO = tab === 'PO'

  return (
    <OfficeShell
      crumb="Purchase Management"
      title={isPO ? 'Purchase Order Register' : 'Purchase Invoice Register'}
      keys={[
        { key: 'N', label: 'New PO', onClick: () => router.push('/pos/purchases/new') },
        { key: 'Tab', label: isPO ? 'Invoices' : 'Orders', onClick: () => setTab(isPO ? 'INVOICE' : 'PO') },
        ...withHandlers(REPORT_KEYS, { P: () => window.print() }),
      ]}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        {[['PO', 'Purchase Orders'], ['INVOICE', 'Purchase Invoices']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="px-3 py-1 text-[11px] border"
            style={{
              borderColor: 'var(--office-line)',
              background: tab === key ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
              color: tab === key ? '#fff' : undefined,
              fontWeight: tab === key ? 700 : 400,
            }}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => fetchPurchases({ type: tab })}
          className="px-2.5 py-1 text-[11px] border" style={{ borderColor: 'var(--office-line)', background: 'var(--office-panel-bg)' }}>
          Refresh
        </button>
        <span className="ml-auto opacity-75">
          {purchases.length} {isPO ? 'order' : 'invoice'}{purchases.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <p className="mb-2 text-[12px] text-red-700">{String(error)}</p>}

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={isPO ? COLUMNS_PO : COLUMNS_INV}
          rows={rows}
          totals={{ order_no: 'Total', total: money(total) }}
          onOpen={(row) => router.push(`/pos/purchases/${row.id}`)}
          openOnClick
          empty={`No ${isPO ? 'purchase orders' : 'invoices'} yet.`}
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">Enter opens the selected voucher. Amounts in Nu.</p>
    </OfficeShell>
  )
}
