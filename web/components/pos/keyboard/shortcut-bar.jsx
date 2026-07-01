/**
 * Bottom keyboard-map bar. Every entry is now a real, touch-sized button: tapping it
 * re-dispatches the exact keydown its physical shortcut fires, so the existing
 * document-level key handlers on each screen run unchanged (single source of truth —
 * no per-screen wiring). `stub: true` marks keys whose feature ships later — dimmed,
 * badged and non-interactive.
 */

// Map a display label ('F10', 'Ctrl+D', 'Ctrl+⇧X', 'Del', 'Esc', …) to a KeyboardEvent
// init. Returns null for informational labels ('Any key', '↑↓') that aren't a single
// dispatchable key, so those render as plain (non-clickable) hints.
const NAMED_KEYS = { del: 'Delete', delete: 'Delete', esc: 'Escape', escape: 'Escape', enter: 'Enter', tab: 'Tab', space: ' ' }

export function keyEventInit(label) {
  const init = { bubbles: true, cancelable: true }
  let key = null
  for (let part of String(label).split('+')) {
    part = part.trim()
    if (!part) continue
    if (/^(ctrl|control)$/i.test(part)) { init.ctrlKey = true; continue }
    if (/^alt$/i.test(part))            { init.altKey = true;  continue }
    if (/^shift$/i.test(part))          { init.shiftKey = true; continue }
    if (part.startsWith('⇧'))           { init.shiftKey = true; part = part.slice(1) }
    const low = part.toLowerCase()
    if (NAMED_KEYS[low])            key = NAMED_KEYS[low]
    else if (/^f\d{1,2}$/i.test(part)) key = part.toUpperCase()   // F1..F12
    else if (part.length === 1)        key = part.toLowerCase()   // letters — handlers lowercase or match both cases
  }
  if (!key) return null
  init.key = key
  return init
}

function triggerShortcut(label) {
  const init = keyEventInit(label)
  if (!init) return
  // A focused text field makes the screen handlers bail (they ignore keys while typing);
  // drop that focus so the click behaves like a real shortcut press.
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) el.blur?.()
  document.dispatchEvent(new KeyboardEvent('keydown', init))
}

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
    <div className="border-t border-border bg-muted/30 px-3 py-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 shrink-0">
      {items.map(s => {
        const clickable = !s.stub && keyEventInit(s.key) !== null
        return (
          <button
            key={s.key}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => triggerShortcut(s.key) : undefined}
            title={clickable ? `${s.key} — ${s.label}` : s.label}
            className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[52px] select-none transition
              ${clickable
                ? 'border-border bg-background hover:bg-accent hover:border-primary/50 active:scale-95 cursor-pointer'
                : 'border-transparent bg-transparent cursor-default'}
              ${s.stub ? 'opacity-40' : ''}`}
          >
            <span className="inline-flex items-center justify-center min-w-[3.5rem] text-sm font-mono font-bold px-2 py-1 rounded bg-muted text-foreground border border-border whitespace-nowrap">
              {s.key}
            </span>
            <span className="text-sm font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
              {s.label}{s.stub ? ' ◌' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
