"use client"

import { useEffect } from "react"
import { COUNTER_KEYS, COUNTER_NAV } from "@/lib/pos/shortcuts"

// Rendered from the shared key map, so the sheet can only ever show what the keys really do —
// this list and the bindings used to be maintained separately and had drifted apart.
const MAP_GROUPS = ['Line', 'Sale', 'Ticket', 'Pelbu']

const GROUPS = [
  ...MAP_GROUPS.map(title => ({
    title,
    shortcuts: COUNTER_KEYS
      .filter(entry => entry.group === title)
      .map(entry => ({ key: entry.combo, label: entry.label, stub: entry.todo })),
  })),
  {
    title: 'Moving around',
    shortcuts: COUNTER_NAV.map(nav => ({ key: nav.combo, label: nav.label })),
  },
  {
    title: 'In payment sheet',
    shortcuts: [
      { key: '1–3',      label: 'Select payment method' },
      { key: 'E',        label: 'Exact amount (CASH)' },
      { key: 'R',        label: 'Round to Nu.5 (CASH)' },
      { key: 'Ctrl+1–5', label: 'Add denomination (CASH)' },
    ],
  },
]

/**
 * F1 help overlay — full shortcut reference, grouped by status.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function HelpOverlay({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    function handleKey(e) {
      if (e.key === 'F1' || e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-background rounded-2xl shadow-2xl overflow-hidden mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">Keyboard Shortcuts</h2>
          <span className="text-xs text-muted-foreground">[F1], [Enter] or [Esc] to close</span>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map(group => (
            <div key={group.title}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${group.stub ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-x-4">
                {group.shortcuts.map(s => (
                  <div key={s.key + s.label} className={`flex items-center gap-3 py-1.5 border-b border-border/40 ${s.stub ? 'opacity-50' : ''}`}>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-muted border border-border rounded text-foreground shrink-0 min-w-[64px] text-center">
                      {s.key}
                    </span>
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
