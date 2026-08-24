"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// Day Book (spec WF-09) — every voucher of the period, in the order it happened.
//
// The Z reading (/api/shifts/z-report) says what the day came to. This says what the day WAS: a
// shop opens it when someone asks about a specific bill, so the ordering is chronological and
// each row carries the number a customer would quote.
const iso = (d) => d.toISOString().slice(0, 10)
const amt = (n) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const TYPE_LABEL = {
  POS_SALE:         'Counter sale',
  MARKETPLACE:      'Marketplace',
  SALES_ORDER:      'Sales order',
  SALES_INVOICE:    'Sales invoice',
  PURCHASE_ORDER:   'Purchase order',
  PURCHASE_INVOICE: 'Purchase invoice',
}
const IS_PURCHASE = (t) => t === 'PURCHASE_ORDER' || t === 'PURCHASE_INVOICE'

const COLUMNS = [
  { key: 'when',    label: 'Time',       width: 120 },
  { key: 'voucher', label: 'Voucher No', width: 170 },
  { key: 'type',    label: 'Particulars' },
  { key: 'party',   label: 'Party',      width: 170 },
  { key: 'method',  label: 'Payment',    width: 100 },
  { key: 'status',  label: 'Status',     width: 140 },
  { key: 'inAmt',   label: 'Received',   width: 120, align: 'right' },
  { key: 'outAmt',  label: 'Paid',       width: 120, align: 'right' },
]

export default function DayBookPage() {
  const router = useRouter()
  const today = new Date()

  const [authed, setAuthed] = useState(false)
  const [from, setFrom] = useState(iso(today))
  const [to, setTo] = useState(iso(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fromRef = useRef(null)

  useEffect(() => {
    async function guard() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) return router.push('/pos')
      setAuthed(true)
    }
    guard()
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` })
      const res = await fetch(`/api/pos/reports/day-book?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load day book')
      setData(d)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { if (authed) load() }, [authed, load])

  const rows = (data?.rows ?? []).map(o => {
    const purchase = IS_PURCHASE(o.order_type)
    return {
      id: o.id,
      when: when(o.created_at),
      voucher: o.order_no ?? '—',
      type: TYPE_LABEL[o.order_type] ?? o.order_type,
      party: o.supplier_name || o.buyer_phone || 'Walk-in',
      method: o.payment_method ?? '—',
      status: o.status ?? '—',
      inAmt: purchase ? '' : amt(o.grand_total),
      outAmt: purchase ? amt(o.grand_total) : '',
    }
  })

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Day Book"
      date={from === to ? from : `${from} — ${to}`}
      keys={withHandlers(REPORT_KEYS, {
        F2: () => { fromRef.current?.focus(); fromRef.current?.select?.() },
        P: () => window.print(),
        'Ctrl+⇧L': () => router.push('/pos/stores'),
      })}
    >
      <div className="flex flex-wrap items-end gap-3 mb-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <span>From</span>
          <input ref={fromRef} type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-1.5 py-0.5 border bg-white" style={{ borderColor: 'var(--office-line)' }} />
        </label>
        <label className="flex items-center gap-1.5">
          <span>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-1.5 py-0.5 border bg-white" style={{ borderColor: 'var(--office-line)' }} />
        </label>
        <button type="button" onClick={load}
          className="px-2.5 py-1 text-[11px] border" style={{ borderColor: 'var(--office-line)', background: 'var(--office-panel-bg)' }}>
          Refresh
        </button>
        {data && (
          <span className="ml-auto opacity-75">
            {data.count} voucher{data.count === 1 ? '' : 's'}
            {Object.entries(data.byType).map(([t, v]) => ` · ${TYPE_LABEL[t] ?? t} ${v.count}`).join('')}
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-red-700">{error}</p>}

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={COLUMNS}
          rows={rows}
          totals={data ? { when: 'Total', inAmt: amt(data.totals.sales), outAmt: amt(data.totals.purchases) } : undefined}
          onOpen={(row) => router.push(`/pos/orders/${row.id}`)}
          empty="No vouchers in this period."
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Received is money in (sales), Paid is money out (purchases) — they are not netted, because a
        single figure across both would mean nothing. GST in the period: {data ? amt(data.totals.gst) : '—'}. Amounts in Nu.
      </p>
    </OfficeShell>
  )
}
