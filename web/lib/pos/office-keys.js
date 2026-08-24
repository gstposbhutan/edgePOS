// The back-office key rails (spec WF-08/WF-09).
//
// Shops arriving from the incumbent ERP read the bottom of a screen to learn what it answers,
// so every back-office screen prints its keys rather than hiding them in a toolbar. The letters
// follow the same convention the Office letter menu does, and the entries live here — not
// inline in each page — so the terminal and the browser can stay in step the way
// lib/pos/shortcuts.js keeps the till's map in one place.
//
// A key with no handler yet is marked `todo`: printed dimmed and says "Not built yet" rather
// than looking broken under a trained reflex.

/** What every back-office screen answers, when it declares nothing of its own. */
export const OFFICE_KEY_BAR = [
  { key: 'Esc', label: 'Counter' },
]

/**
 * Report screens: the reading keys.
 *
 * `E Expand` is deliberately absent. It expands grouped rows, none of these registers group, and
 * it is not a reflex the way F2 is — advertising it dimmed forever would be clutter, not honesty.
 *
 * Location is `Ctrl+⇧L`, NOT F12. F12 belongs to the browser's devtools and no page can cancel
 * it, so printing F12 here would be a promise the web till cannot keep — the same reason the
 * counter's rail carries the alias (see lib/pos/shortcuts.js). The terminal can bind the real F12.
 */
export const REPORT_KEYS = [
  { key: 'F2',      label: 'Date',     todo: true },
  { key: 'P',       label: 'Print',    todo: true },
  { key: 'Ctrl+⇧L', label: 'Location', todo: true },
  { key: 'Esc',     label: 'Counter' },
]

/** Master-data screens: the editing keys. */
export const MASTER_KEYS = [
  { key: 'N',   label: 'New',     todo: true },
  { key: 'E',   label: 'Edit',    todo: true },
  { key: 'L',   label: 'List',    todo: true },
  { key: 'Esc', label: 'Counter' },
]

/**
 * Merge a screen's real handlers over a template, by key+label.
 * Anything the screen supplies loses its `todo`; anything it does not keeps it, so the rail
 * never promises a key the screen cannot answer.
 */
export function withHandlers(template, handlers = {}) {
  return template.map(entry => {
    const fn = handlers[entry.key]
    return fn ? { ...entry, onClick: fn, todo: false } : entry
  })
}
