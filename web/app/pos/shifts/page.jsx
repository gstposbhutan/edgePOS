"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Clock, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getUser, getRoleClaims } from "@/lib/auth"

const fmt = (n) => "Nu. " + Number(n || 0).toLocaleString("en-IN", {
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <span className="text-foreground font-medium">Shift History</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{shifts.length} closed shift{shifts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20" />
            <p className="text-sm">No closed shifts yet</p>
            <p className="text-xs max-w-xs text-center">Closed shifts and their cash reconciliations will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {shifts.map(s => (
              <div key={s.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium flex-1 min-w-0 truncate">
                    {s.register_name || 'Register'}
                  </p>
                  {s.classification && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${CLASS_STYLES[s.classification] || ''}`}>
                      {s.classification}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{s.opened_by_name || 'Cashier'}</span>
                  <span>·</span>
                  <span>{fmtTime(s.opened_at)} → {fmtTime(s.closed_at)}</span>
                </div>
                {manager && s.expected_total != null && (
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                    <div className="rounded-md bg-muted/50 px-2 py-1">
                      <div className="text-muted-foreground">Opening</div>
                      <div className="font-medium tabular-nums">{fmt(s.opening_float)}</div>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1">
                      <div className="text-muted-foreground">Expected</div>
                      <div className="font-medium tabular-nums">{fmt(s.expected_total)}</div>
                    </div>
                    <div className="rounded-md bg-muted/50 px-2 py-1">
                      <div className="text-muted-foreground">Counted</div>
                      <div className="font-medium tabular-nums">{fmt(s.closing_count)}</div>
                    </div>
                    <div className="col-span-3 rounded-md bg-muted/50 px-2 py-1 flex items-center justify-between">
                      <span className="text-muted-foreground">Variance</span>
                      <span className={`font-medium tabular-nums ${
                        s.discrepancy > 0 ? 'text-gold' : s.discrepancy < 0 ? 'text-tibetan' : 'text-emerald'
                      }`}>
                        {Number(s.discrepancy) >= 0 ? '+' : ''}{fmt(s.discrepancy).replace('Nu. ', 'Nu. ')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
