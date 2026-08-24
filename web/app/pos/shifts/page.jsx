"use client"

import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getUser, getRoleClaims } from "@/lib/auth"

// Register cells carry the number alone — the unit is stated once, in the footnote. Repeating
// "Nu." down a column pushes every figure a different distance from the column edge and defeats
// the scan the alignment exists for.
const amt = (n) => Number(n || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const isManager = (sr) => ["MANAGER", "OWNER", "ADMIN"].includes(sr)

function fmtTime(iso) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

const CLASS_STYLES = {
  BALANCED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  OVERAGE: "bg-gold/10 text-gold border-gold/20",
  SHORTAGE: "bg-tibetan/10 text-tibetan border-tibetan/20",
}

export default function ShiftHistoryPage() {
  const router = useRouter()
  const [subRole, setSubRole] = useState(null)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { subRole: sr } = getRoleClaims(user)
      setSubRole(sr)
      try {
        const res = await fetch('/api/shifts/history')
        const json = await res.json()
        setShifts(json.shifts || [])
      } catch {
        /* ignore */
      }
      setLoading(false)
    }
    load()
  }, [])

  const manager = isManager(subRole)

  // The shift register (spec WF-09) — the day's tills, and where the cash disagreed.
  //
  // A manager reads this for one thing: variance. Cards put opening, expected, counted and
  // variance in four different places on every card, so a run of shifts cannot be compared by
  // eye. In a register the variance column reads straight down and a bad drawer stands out of it.
  const rows = shifts.map(sh => ({
    id: sh.id,
    register: sh.register_name ?? '—',
    cashier: sh.opened_by_name ?? '—',
    opened: fmtTime(sh.opened_at),
    closed: sh.closed_at ? fmtTime(sh.closed_at) : 'Open',
    opening: amt(sh.opening_float),
    expected: amt(sh.expected_total),
    counted: sh.closing_count == null ? '—' : amt(sh.closing_count),
    variance: sh.discrepancy == null ? '—' : amt(sh.discrepancy),
    classification: sh.classification ?? '—',
  }))

  const COLUMNS = [
    { key: 'register',       label: 'Terminal',  width: 150 },
    { key: 'cashier',        label: 'Cashier',   width: 150 },
    { key: 'opened',         label: 'Opened',    width: 130 },
    { key: 'closed',         label: 'Closed',    width: 130 },
    { key: 'opening',        label: 'Opening',   width: 100, align: 'right' },
    { key: 'expected',       label: 'Expected',  width: 100, align: 'right' },
    { key: 'counted',        label: 'Counted',   width: 100, align: 'right' },
    { key: 'variance',       label: 'Variance',  width: 100, align: 'right' },
    { key: 'classification', label: 'Result',    width: 120 },
  ]

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Shift Register"
      keys={withHandlers(REPORT_KEYS, { P: () => window.print() })}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">{shifts.length} shift{shifts.length === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid columns={COLUMNS} rows={rows} empty="No shifts recorded yet." />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Variance is counted minus expected — negative is short. Amounts in Nu.
      </p>
    </OfficeShell>
  )
}
