"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// Cash Book (spec WF-09) — what went through the drawer, with the balance carried down.
//
// CASH ONLY, deliberately. Credit and online takings are revenue but never reach the drawer, so
// counting them here would give a balance no till count could ever match — which is the one thing
// this report exists to support.
const iso = (d) => d.toISOString().slice(0, 10)
const amt = (n) => (n == null ? '' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const COLUMNS = [
  { key: 'when',        label: 'Date',        width: 130 },
  { key: 'particulars', label: 'Particulars' },
  { key: 'note',        label: 'Reason',      width: 200 },
  { key: 'in_amt',      label: 'Cash In',     width: 120, align: 'right' },
  { key: 'out_amt',     label: 'Cash Out',    width: 120, align: 'right' },
  { key: 'balance',     label: 'Balance',     width: 130, align: 'right' },
]

export default function CashBookPage() {
  const router = useRouter()
  const today = new Date()
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const [authed, setAuthed] = useState(false)
  const [from, setFrom] = useState(iso(monthAgo))
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
      const res = await fetch(`/api/pos/reports/cash-book?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load cash book')
      setData(d)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { if (authed) load() }, [authed, load])

  const rows = (data?.rows ?? []).map(r => ({
    id: r.id,
    when: when(r.date),
    particulars: r.particulars,
    note: r.note ?? '',
    in_amt: amt(r.in_amt),
    out_amt: amt(r.out_amt),
    balance: amt(r.balance),
  }))

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Cash Book"
      date={`${from} — ${to}`}
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
            in {amt(data.totals.in)} · out {amt(data.totals.out)} · closing {amt(data.closing)}
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
          totals={data ? { when: 'Closing', in_amt: amt(data.totals.in), out_amt: amt(data.totals.out), balance: amt(data.closing) } : undefined}
          empty="No cash movements in this period."
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Cash only — credit and online takings are revenue but never enter the drawer, so they are
        not counted here. The balance runs from zero at the start of the period, not from a float.
        Amounts in Nu.
      </p>
    </OfficeShell>
  )
}
