"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, FileBarChart, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * GST report for the distributor/wholesaler consoles. Pick a period; shows output tax (GST collected
 * on sales), input tax / ITC (GST paid on B2B purchases), net GST payable, a taxable-vs-exempt
 * turnover split, and a monthly breakdown. Data from /api/console/reports/gst (entity-scoped).
 */
function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }
const iso = (d) => d.toISOString().slice(0, 10)

export function GstReport() {
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 365 * 86400000)
  const [from, setFrom] = useState(iso(yearAgo))
  const [to, setTo] = useState(iso(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` })
      const res = await fetch(`/api/console/reports/gst?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load report')
      setData(d)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  const s = data?.summary

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">GST Report</h2>
          <p className="text-xs text-muted-foreground">Output tax, input tax credit &amp; net GST payable</p>
        </div>
        <div className="flex items-end gap-2">
          <div><label className="text-[10px] text-muted-foreground block">From</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" /></div>
          <div><label className="text-[10px] text-muted-foreground block">To</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" /></div>
          <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {error && <p className="text-sm text-tibetan">{error}</p>}

      {loading || !s ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card label="Gross sales" value={money(s.gross_sales)} sub={`${s.sales_count} sale${s.sales_count === 1 ? '' : 's'}`} />
            <Card label="Taxable sales" value={money(s.taxable_sales)} />
            <Card label="Exempt sales" value={money(s.exempt_sales)} muted />
            <Card label="Output GST" value={money(s.output_gst)} tone="amber" sub="collected on sales" />
            <Card label="Input GST (ITC)" value={money(s.input_gst)} tone="emerald" sub={`${s.purchases_count} purchase${s.purchases_count === 1 ? '' : 's'}`} />
            <Card label="Net GST payable" value={money(s.net_gst)} tone={s.net_gst >= 0 ? 'primary' : 'emerald'} sub="output − input" strong />
          </div>

          {/* Monthly breakdown */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Month</span><span className="text-right">Gross sales</span><span className="text-right">Output GST</span><span className="text-right">Input GST</span><span className="text-right">Net GST</span>
            </div>
            {(data.months || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground"><FileBarChart className="h-10 w-10 opacity-20" /><p className="text-sm">No activity in this period.</p></div>
            ) : (
              <div className="divide-y divide-border">
                {data.months.map(m => (
                  <div key={m.month} className="grid grid-cols-5 gap-2 px-4 py-2 text-xs">
                    <span className="font-medium">{m.month}</span>
                    <span className="text-right">{money(m.gross_sales)}</span>
                    <span className="text-right text-amber-600">{money(m.output_gst)}</span>
                    <span className="text-right text-emerald-600">{money(m.input_gst)}</span>
                    <span className="text-right font-semibold">{money(m.net_gst)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Input GST (ITC) covers intra-platform B2B purchases. Exempt sales are excluded from output GST but shown as turnover.</p>
        </>
      )}
    </div>
  )
}

function Card({ label, value, sub, tone, muted, strong }) {
  const toneCls = tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : tone === 'primary' ? 'text-primary' : muted ? 'text-muted-foreground' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`${strong ? 'text-xl' : 'text-lg'} font-bold ${toneCls} mt-0.5`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}
