"use client"

import { useEffect } from "react"

const GROUPS = [
  {
    title: 'Functional',
    shortcuts: [
      { key: 'F1',        label: 'Help overlay' },
      { key: 'F2',        label: 'Clear / new transaction' },
      { key: 'F3',        label: 'Search / add item' },
      { key: 'F4',        label: 'New cart (hold current)' },
      { key: 'F5',        label: 'Previous cart' },
      { key: 'F6',        label: 'Customer select' },
      { key: 'F7',        label: 'Price list (cycle tier)' },
      { key: 'F8',        label: 'Sales person' },
      { key: 'F9',        label: 'Change qty (selected row)' },
      { key: 'F10',       label: 'Tender / payment' },
      { key: 'Enter',     label: 'Change qty (selected row)' },
      { key: 'Ctrl+A',    label: 'Add product (open search)' },
      { key: 'Ctrl+R',    label: 'Remove selected row' },
      { key: 'Ctrl+D',    label: 'Bill discount (all lines)' },
      { key: 'Ctrl+C',    label: 'Complimentary (manager)' },
      { key: 'Ctrl+E',    label: 'Exchange / return' },
      { key: 'Alt+A',     label: 'Apply price list (cycle)' },
      { key: 'Alt+Q',     label: 'Convert to quotation' },
      { key: 'Alt+M',     label: 'Post to market' },
      { key: 'Alt+D',     label: 'Delivery address' },
      { key: 'Ctrl+M',    label: 'Discount on selected row' },
      { key: 'Tab / ⇧Tab', label: 'Next / previous cart' },
      { key: 'Ctrl+1–9',  label: 'Jump to cart by number' },
      { key: '↑ ↓',       label: 'Navigate rows' },
      { key: 'Delete',    label: 'Remove selected row' },
      { key: 'Any key',   label: 'Open product search' },
    ],
  },
  {
    title: 'Manager',
    shortcuts: [
      { key: 'Ctrl+⇧X', label: 'Cash In/Out (manager)' },
      { key: 'Ctrl+⇧Z', label: 'Z-Report (manager)' },
    ],
  },
  {
    title: 'In payment modal',
    shortcuts: [
      { key: '1–5',     label: 'Select payment method' },
      { key: 'E',       label: 'Exact amount (CASH)' },
      { key: 'R',       label: 'Round to Nu.5 (CASH)' },
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
                  <div key={s.key + s.label} className={`flex items-center gap-3 py-1.5 border-b border-border/40 ${group.stub ? 'opacity-50' : ''}`}>
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
