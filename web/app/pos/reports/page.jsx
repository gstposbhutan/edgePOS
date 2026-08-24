"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// Retailer GST report: output tax (GST collected on sales), input tax / ITC (GST paid on intra-platform
// purchases), net GST payable, and a taxable-vs-exempt turnover split, with a monthly breakdown.
// Financial data — MANAGER/OWNER/ADMIN only (cashiers are bounced to the register).
//
// Dressed as a register (spec WF-09): the period on the band, the months as a real grid with the
// totals under the columns they total. A shop reading a tax register expects to see the year at
// once and the total at the foot — cards scattered above a list do not read as one.
function money(v) { return parseFloat(v ?? 0).toFixed(2) }
const iso = (d) => d.toISOString().slice(0, 10)

const COLUMNS = [
  { key: 'month',       label: 'Month',       width: 140 },
  { key: 'gross_sales', label: 'Gross Sales', align: 'right' },
  { key: 'output_gst',  label: 'Output GST',  align: 'right' },
  { key: 'input_gst',   label: 'Input GST',   align: 'right' },
  { key: 'net_gst',     label: 'Net GST',     align: 'right' },
]

export default function PosReportsPage() {
  const router = useRouter()
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 365 * 86400000)

  const [authed, setAuthed] = useState(false)
  const [from, setFrom] = useState(iso(yearAgo))
  const [to, setTo] = useState(iso(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      const res = await fetch(`/api/pos/reports/gst?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load report')
      setData(d)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { if (authed) load() }, [authed, load])

  const s = data?.summary
  const months = data?.months || []

  const rows = months.map(m => ({
    id: m.month,
    month: m.month,
    gross_sales: money(m.gross_sales),
    output_gst: money(m.output_gst),
    input_gst: money(m.input_gst),
    net_gst: money(m.net_gst),
  }))

  const totals = s ? {
    month: 'Total',
    gross_sales: money(s.gross_sales),
    output_gst: money(s.output_gst),
    input_gst: money(s.input_gst),
    net_gst: money(s.net_gst),
  } : undefined

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Tax Register (GST)"
      date={`${from} — ${to}`}
      keys={withHandlers(REPORT_KEYS, { P: () => window.print() })}
    >
      <div className="flex flex-wrap items-end gap-3 mb-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
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
        {s && (
          <span className="ml-auto opacity-75">
            {s.sales_count} sale{s.sales_count === 1 ? '' : 's'} · {s.purchases_count} purchase{s.purchases_count === 1 ? '' : 's'}
            {' · '}taxable {money(s.taxable_sales)} · exempt {money(s.exempt_sales)}
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-red-700">{error}</p>}

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid columns={COLUMNS} rows={rows} totals={totals} empty="No activity in this period." />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Input GST (ITC) covers intra-platform B2B purchases. Exempt sales are excluded from output
        GST but shown as turnover. Amounts in Nu.
      </p>
    </OfficeShell>
  )
}
