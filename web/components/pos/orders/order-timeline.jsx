import { CheckCircle, Circle, Clock } from "lucide-react"

/**
 * Vertical timeline of order status transitions.
 * @param {{ timeline: object[] }} props
 */
export function OrderTimeline({ timeline }) {
  if (!timeline.length) {
    return <p className="text-xs text-muted-foreground text-center py-4">No status history yet</p>
  }

  return (
    <div className="space-y-0">
      {timeline.map((entry, i) => {
        const isLast = i === timeline.length - 1
        const date   = new Date(entry.created_at)
        const time   = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        const day    = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Icon + line */}
            <div className="flex flex-col items-center">
              <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5
                ${isLast ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                {isLast
                  ? <Circle className="h-2.5 w-2.5 text-primary fill-primary" />
                  : <CheckCircle className="h-3 w-3 text-emerald-600" />
                }
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>

            {/* Content */}
            <div className={`pb-4 flex-1 min-w-0 ${isLast ? '' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{entry.to_status?.replace(/_/g, ' ')}</p>
                <span className="text-xs text-muted-foreground shrink-0">{day} {time}</span>
              </div>
              {entry.from_status && (
                <p className="text-xs text-muted-foreground">from {entry.from_status?.replace(/_/g, ' ')}</p>
              )}
              {entry.reason && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.reason}"</p>
              )}
              {entry.actor_role && (
                <p className="text-xs text-muted-foreground">by {entry.actor_role}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
