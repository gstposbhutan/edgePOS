"use client"

import { useEffect } from "react"

const SHORTCUTS = [
  { key: 'F1',     label: 'Help overlay' },
  { key: 'F2',   label: 'New transaction (clear active cart)' },
  { key: 'F3',   label: 'Add item / open product search' },
  { key: 'F4',   label: 'New cart (hold current, open blank)' },
  { key: 'F6',   label: 'Cancel / clear active cart' },
  { key: 'Tab',      label: 'Switch to next cart' },
  { key: '⇧Tab',    label: 'Switch to previous cart' },
  { key: 'Ctrl+1–9', label: 'Jump to cart by number' },
  { key: 'F4',     label: 'Assign customer' },
  { key: 'F5',     label: 'Payment' },
  { key: 'F6',     label: 'Print / send last receipt' },
  { key: 'F7',     label: 'Void selected row' },
  { key: 'F8',     label: 'Open cash drawer' },
  { key: 'F9',     label: 'Switch Touch / Keyboard mode' },
  { key: 'Ctrl+M', label: 'Discount on selected row' },
  { key: 'F12',    label: 'Lock terminal' },
  { key: '↑ ↓',    label: 'Navigate rows' },
  { key: 'Enter',  label: 'Edit qty on selected row' },
  { key: 'Delete', label: 'Remove selected row' },
  { key: 'Esc',    label: 'Cancel / close modal' },
  { key: 'Any key', label: 'Open product search' },
  { key: '1–5',    label: 'Select payment method (in payment modal)' },
  { key: 'E',      label: 'Exact amount (CASH)' },
  { key: 'R',      label: 'Round to Nu.5 (CASH)' },
  { key: 'Ctrl+1–5', label: 'Add denomination (CASH)' },
]

/**
 * F1 help overlay — full shortcut reference.
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
        <div className="p-5 grid grid-cols-2 gap-2 max-h-[70vh] overflow-y-auto">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center gap-3 py-1.5 border-b border-border/40">
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-muted border border-border rounded text-foreground shrink-0 min-w-[60px] text-center">
                {s.key}
              </span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
