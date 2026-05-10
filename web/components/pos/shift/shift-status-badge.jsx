"use client"

import { Clock } from "lucide-react"

export function ShiftStatusBadge({ shift, onStart, onEnd }) {
  if (!shift) {
    return (
      <button
        onClick={onStart}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors border border-border"
      >
        <Clock className="h-3.5 w-3.5" /> Start Shift
      </button>
    )
  }

  if (shift.status === 'ACTIVE') {
    return (
      <button
        onClick={onEnd}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gold/10 text-gold border border-gold/30 animate-pulse transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-gold inline-block" />
        Shift Active
      </button>
    )
  }

  if (shift.status === 'CLOSING') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-tibetan/10 text-tibetan border border-tibetan/20">
        <span className="h-2 w-2 rounded-full bg-tibetan inline-block animate-pulse" />
        Counting...
      </div>
    )
  }

  return null
}
