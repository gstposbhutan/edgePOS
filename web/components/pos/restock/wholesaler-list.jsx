'use client'

import { Building2, Star, CheckCircle } from 'lucide-react'

export function WholesalerList({ wholesalers, selected, onSelect }) {
  if (!wholesalers.length) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground" data-testid="no-wholesalers">
        No wholesaler connections found.
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="wholesaler-list">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Suppliers</p>
      {wholesalers.map(w => (
        <button
          key={w.id}
          onClick={() => onSelect(w)}
          data-testid={`wholesaler-${w.name}`}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            selected?.id === w.id
              ? 'bg-primary/10 border-primary/30 text-foreground'
              : 'bg-card border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
              selected?.id === w.id ? 'bg-primary/20' : 'bg-muted/50'
            }`}>
              <Building2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{w.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {w.is_primary && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-primary">
                    <Star className="h-3 w-3 fill-primary" /> Primary
                  </span>
                )}
                {w.category && (
                  <span className="text-xs text-muted-foreground">{w.category}</span>
                )}
              </div>
            </div>
            {selected?.id === w.id && (
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
