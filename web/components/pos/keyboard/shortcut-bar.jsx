/**
 * Bottom status bar showing the canonical Pelbu keyboard map.
 * `stub: true` marks keys whose feature ships in a later phase — they are
 * dimmed and badged so operators can see the full intended layout today.
 */
export function ShortcutBar({ shortcuts = [] }) {
  const defaultShortcuts = [
    { key: 'F1',        label: 'Help' },
    { key: 'F2',        label: 'Clear' },
    { key: 'F3',        label: 'Search' },
    { key: 'F4',        label: 'New Cart' },
    { key: 'F5',        label: 'Prev Cart' },
    { key: 'F6',        label: 'Customer' },
    { key: 'F7',        label: 'Price List' },
    { key: 'F8',        label: 'Sales Person' },
    { key: 'F9',        label: 'Change Qty' },
    { key: 'F10',       label: 'Tender' },
    { key: 'Ctrl+A',    label: 'Add' },
    { key: 'Ctrl+R',    label: 'Remove' },
    { key: 'Ctrl+D',    label: 'Bill Disc' },
    { key: 'Ctrl+M',    label: 'Row Disc' },
    { key: 'Ctrl+⇧X',   label: 'Cash In/Out' },
    { key: 'Ctrl+⇧Z',   label: 'Z-Report' },
  ]

  const items = shortcuts.length > 0 ? shortcuts : defaultShortcuts

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-1.5 flex items-center gap-3 overflow-x-auto shrink-0">
      {items.map(s => (
        <div key={s.key} className={`flex items-center gap-1 shrink-0 ${s.stub ? 'opacity-40' : ''}`}>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
            {s.key}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {s.label}{s.stub ? ' ◌' : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
