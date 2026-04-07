"use client"

import { ArrowUpCircle, ArrowDownCircle, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const TYPE_CONFIG = {
  SALE:     { label: 'Sale',     color: 'text-tibetan',    icon: ArrowDownCircle, sign: '-' },
  RESTOCK:  { label: 'Restock',  color: 'text-emerald-600', icon: ArrowUpCircle,  sign: '+' },
  TRANSFER: { label: 'Transfer', color: 'text-blue-600',    icon: ArrowDownCircle, sign: '-' },
  LOSS:     { label: 'Loss',     color: 'text-tibetan',    icon: ArrowDownCircle, sign: '-' },
  DAMAGED:  { label: 'Damaged',  color: 'text-amber-600',  icon: ArrowDownCircle, sign: '-' },
  RETURN:   { label: 'Return',   color: 'text-emerald-600', icon: ArrowUpCircle,  sign: '+' },
}

/**
 * @param {{ movements: object[], loading: boolean }} props
 */
export function MovementHistory({ movements, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No movements recorded yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {movements.map((m) => {
        const cfg  = TYPE_CONFIG[m.movement_type] ?? TYPE_CONFIG.SALE
        const Icon = cfg.icon
        const qty  = Math.abs(m.quantity)
        const date = new Date(m.created_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
        const time = new Date(m.created_at).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        })

        return (
          <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
            <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.products?.name ?? 'Unknown product'}
                </p>
                <Badge className="text-[10px] px-1.5 py-0 shrink-0">{cfg.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{m.notes}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-bold tabular-nums ${cfg.color}`}>
                {cfg.sign}{qty}
              </p>
              <p className="text-[10px] text-muted-foreground">{date} {time}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
