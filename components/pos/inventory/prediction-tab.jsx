"use client"

import { useState } from "react"
import { RefreshCw, TrendingDown, AlertTriangle, CheckCircle, HelpCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

const STATUS_CONFIG = {
  CRITICAL:            { icon: XCircle,           color: 'text-tibetan',       bg: 'bg-tibetan/10 border-tibetan/30',     badge: 'bg-tibetan/10 text-tibetan border-tibetan/20' },
  AT_RISK:             { icon: AlertTriangle,      color: 'text-amber-600',     bg: 'bg-amber-500/10 border-amber-500/30', badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  HEALTHY:             { icon: CheckCircle,         color: 'text-emerald-600',   bg: 'bg-emerald-500/10 border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  INSUFFICIENT_DATA:   { icon: HelpCircle,          color: 'text-muted-foreground', bg: 'bg-muted/30 border-border',  badge: 'bg-muted/30 text-muted-foreground border-border' },
  DEAD_STOCK:          { icon: TrendingDown,        color: 'text-muted-foreground', bg: 'bg-muted/30 border-border',  badge: 'bg-muted/30 text-muted-foreground border-border' },
  ERROR:               { icon: XCircle,             color: 'text-tibetan',       bg: 'bg-tibetan/10 border-tibetan/30',   badge: 'bg-tibetan/10 text-tibetan border-tibetan/20' },
}

const FILTERS = ['ALL', 'CRITICAL', 'AT_RISK', 'HEALTHY']

/**
 * @param {{ predictions: object[], summary: object, calculatedAt: string|null, loading: boolean, refreshing: boolean, onRefresh: () => void, onSetLeadTime: (product: object) => void }} props
 */
export function PredictionTab({ predictions, summary, calculatedAt, loading, refreshing, onRefresh, onSetLeadTime }) {
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('ALL')

  const displayed = predictions.filter(p => {
    if (filter !== 'ALL' && p.status !== filter) return false
    if (!search.trim()) return true
    const name = p.products?.name ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Critical" count={summary.critical} icon={XCircle} color="text-tibetan" bg="bg-tibetan/5" />
        <SummaryCard label="At Risk" count={summary.at_risk} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-500/5" />
        <SummaryCard label="Healthy" count={summary.healthy} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-500/5" />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-primary' : ''}
            >
              {f === 'ALL' ? 'All' :
               f === 'CRITICAL' ? `${summary.critical} Crit` :
               f === 'AT_RISK' ? `${summary.at_risk} Risk` :
               `${summary.healthy} OK`}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Last calculated */}
      {calculatedAt && (
        <p className="text-xs text-muted-foreground">
          Last calculated: {new Date(calculatedAt).toLocaleString()}
        </p>
      )}

      {/* Predictions table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {predictions.length === 0
            ? 'No predictions yet. Click "Refresh" to calculate.'
            : 'No products match your filter.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayed.map(p => (
            <PredictionRow key={p.id} prediction={p} onSetLeadTime={onSetLeadTime} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, count, icon: Icon, color, bg }) {
  return (
    <div className={`p-3 rounded-lg border border-border ${bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>{count}</p>
    </div>
  )
}

function PredictionRow({ prediction, onSetLeadTime }) {
  const p = prediction
  const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.HEALTHY
  const StatusIcon = cfg.icon
  const product = p.products ?? {}
  const stock = product.current_stock ?? 0
  const daysLeft = p.days_until_stockout

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs transition-colors ${cfg.bg}`}>
      <StatusIcon className={`h-4 w-4 shrink-0 ${cfg.color}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground truncate">{product.name ?? '—'}</span>
          <Badge className={`text-[9px] shrink-0 ${cfg.badge}`}>{p.status.replace('_', ' ')}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-muted-foreground">
          <span>Stock: {stock}</span>
          <span>ADS: {parseFloat(p.weighted_ads).toFixed(1)}/day</span>
          {daysLeft !== null && daysLeft !== undefined && (
            <span className={daysLeft < 7 ? cfg.color : ''}>
              {daysLeft < 1 ? '< 1 day' : `${Math.round(daysLeft)} days`}
            </span>
          )}
          {p.suggested_reorder_qty && (
            <span>Reorder: {Math.round(p.suggested_reorder_qty)} units</span>
          )}
        </div>
      </div>

      <button
        onClick={() => onSetLeadTime(p)}
        className="text-primary hover:underline text-[10px] shrink-0"
      >
        Lead time
      </button>
    </div>
  )
}
