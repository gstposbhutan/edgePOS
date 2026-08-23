"use client"

import { useState } from "react"
import { railPage, RAIL_PAGES } from "@/lib/pos/shortcuts"

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
const NAMED_KEYS = { del: 'Delete', delete: 'Delete', esc: 'Escape', escape: 'Escape', enter: 'Enter', tab: 'Tab', space: ' ', pgup: 'PageUp', pgdn: 'PageDown' }

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
    else if (part.length === 1)      { key = part.toLowerCase(); init.code = `Key${part.toUpperCase()}` }   // letters
  }
  if (!key) return null
  init.key = key
  // `code` matters for the Alt combos: the map matches those on the physical key because
  // macOS rewrites the character. A synthesised event without it would never match.
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

/**
 * The Counter rail: the RanceLab footer, paged. Entries come from the shared key map so the
 * rail can never disagree with what the keys actually do. Other screens keep passing their own
 * `shortcuts` array and render unpaged, as before.
 */
function CounterRail() {
  const [page, setPage] = useState(1)
  const entries = railPage(page).map(e => ({ key: e.combo, label: e.label, stub: e.todo, go: e.go, alias: e.alias }))
  const flip = (d) => setPage(p => ((p - 1 + d + RAIL_PAGES) % RAIL_PAGES) + 1)

  return (
    <div className="border-t border-border bg-muted/30 shrink-0">
      <div className="flex items-center justify-between px-3 pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Footer page {page}</span>
        <span className="flex gap-1">
          <button type="button" onClick={() => flip(-1)} title="Previous page" className="px-2 py-0.5 rounded border border-border hover:bg-accent">&lt; More</button>
          <button type="button" onClick={() => flip(1)} title="Next page" className="px-2 py-0.5 rounded border border-border hover:bg-accent">&gt; More</button>
        </span>
      </div>
      <ShortcutGrid items={entries} />
    </div>
  )
}

export function ShortcutBar({ shortcuts = [] }) {
  if (shortcuts.length === 0) return <CounterRail />
  return (
    <div className="border-t border-border bg-muted/30 shrink-0">
      <ShortcutGrid items={shortcuts} />
    </div>
  )
}

function ShortcutGrid({ items }) {
  return (
    <div className="px-3 py-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
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
              ${s.go ? 'border-primary bg-primary/10' : ''}
              ${s.stub ? 'opacity-40' : ''}`}
          >
            <span className="inline-flex items-center justify-center min-w-[3.5rem] text-sm font-mono font-bold px-2 py-1 rounded bg-muted text-foreground border border-border whitespace-nowrap">
              {s.key}
            </span>
            <span className="text-sm font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
              {s.label}{s.stub ? ' ◌' : ''}
              {/* The one key the browser keeps (F12) carries the combo that actually reaches
                  the till, so the button is not a promise the page cannot keep. */}
              {s.alias && <span className="block text-[10px] font-mono text-muted-foreground">or {s.alias}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
