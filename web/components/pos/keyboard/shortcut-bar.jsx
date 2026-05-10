/**
 * Bottom status bar showing active keyboard shortcuts.
 */
export function ShortcutBar({ shortcuts = [] }) {
  const defaultShortcuts = [
    { key: 'F1',   label: 'Help' },
    { key: 'F2',   label: 'Clear' },
    { key: 'F3',   label: 'Search' },
    { key: 'F4',   label: 'New Cart' },
    { key: 'F5',   label: 'Pay' },
    { key: 'F6',   label: 'Cancel Cart' },
    { key: 'F7',   label: 'Void Row' },
    { key: 'Ctrl+M', label: 'Discount' },
    { key: 'Tab',       label: 'Next Cart' },
    { key: 'Ctrl+1–9', label: 'Switch Cart' },
    { key: 'Del',  label: 'Remove' },
    { key: 'Enter', label: 'Edit Qty' },
  ]

  const items = shortcuts.length > 0 ? shortcuts : defaultShortcuts

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-1.5 flex items-center gap-4 overflow-x-auto shrink-0">
      {items.map(s => (
        <div key={s.key} className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
            {s.key}
          </span>
          <span className="text-[10px] text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
