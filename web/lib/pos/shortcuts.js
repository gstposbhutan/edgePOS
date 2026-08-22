// The Counter key map.
//
// Shops arriving from RanceLab bring the muscle memory in this table, so the till speaks that
// dialect rather than the scheme we invented (spec: docs/keyboard-shortcuts.html). This list is
// the ONE source of truth — app/pos/page.jsx binds by `id`, the footer rail renders entries with
// a `rail` page, and the F1 sheet renders the whole table. The binding, the rail and the help
// sheet previously drifted apart because each kept its own copy.
//
// `rail`   1 | 2 — which page of the two-page footer the entry sits on (spec WF-01 / WF-02).
// `group`  heading in the F1 sheet.
// `go`     the tender key, highlighted everywhere.
// `todo`   the spec reserves this key but the action is not built yet. It is shown dimmed and
//          reports that, rather than quietly doing something else under a trained reflex.
// `extra`  ours, not in the RanceLab spec — kept because the feature exists and is used.

export const COUNTER_KEYS = [
  // ── Line editing ────────────────────────────────────────────────────────────────────────
  { id: 'qtyUp',        combo: 'F3',      match: { key: 'F3' },                  label: 'Add Quantity',    rail: 1, group: 'Line' },
  { id: 'qtyDown',      combo: 'F4',      match: { key: 'F4' },                  label: 'Less Quantity',   rail: 1, group: 'Line' },
  { id: 'rate',         combo: 'F5',      match: { key: 'F5' },                  label: 'Rate Change',     rail: 1, group: 'Line', todo: true },
  { id: 'qtyFocus',     combo: 'Alt+Q',   match: { key: 'q', alt: true },        label: 'Qty',                      group: 'Line' },
  { id: 'unitSheet',    combo: 'Alt+U',   match: { key: 'u', alt: true },        label: 'Unit',                     group: 'Line', todo: true },
  { id: 'itemDiscount', combo: 'Ctrl+M',  match: { key: 'm', ctrl: true },       label: 'Item Discount',   rail: 1, group: 'Line' },
  { id: 'itemRemark',   combo: 'Ctrl+T',  match: { key: 't', ctrl: true },       label: 'Item Remark',     rail: 1, group: 'Line', todo: true },
  { id: 'complimentary',combo: 'Ctrl+C',  match: { key: 'c', ctrl: true },       label: 'Complimentary',   rail: 1, group: 'Line' },
  { id: 'removeLine',   combo: 'Del',     match: { key: 'Delete' },              label: 'Remove',          rail: 1, group: 'Line' },

  // ── The sale ────────────────────────────────────────────────────────────────────────────
  { id: 'productInfo',  combo: 'F8',      match: { key: 'F8' },                  label: 'Product Info',    rail: 1, group: 'Sale' },
  { id: 'products',     combo: 'Alt+L',   match: { key: 'l', alt: true },        label: 'Products',                 group: 'Sale' },
  { id: 'customerInfo', combo: 'F9',      match: { key: 'F9' },                  label: 'Customer Info',   rail: 1, group: 'Sale' },
  { id: 'party',        combo: 'F7',      match: { key: 'F7' },                  label: 'Party',           rail: 2, group: 'Sale' },
  { id: 'salesperson',  combo: 'F6',      match: { key: 'F6' },                  label: 'Sales Person',    rail: 2, group: 'Sale' },
  // repriceCart() exists in use-cart but takes an explicit tier; the party-vs-retail chooser
  // the spec shows is not built, so the key stays reserved rather than guessing a tier.
  { id: 'priceList',    combo: 'Alt+P',   match: { key: 'p', alt: true },        label: 'Price List',               group: 'Sale', todo: true },
  { id: 'gstIncluded',  combo: 'Alt+T',   match: { key: 't', alt: true },        label: 'GST Included',             group: 'Sale', todo: true },
  { id: 'deliveryDetail',combo: 'Ctrl+L', match: { key: 'l', ctrl: true },       label: 'Delivery Detail', rail: 1, group: 'Sale' },
  { id: 'tender',       combo: 'F10',     match: { key: 'F10' },                 label: 'Tender',          rail: 1, group: 'Sale', go: true },
  { id: 'tenderAlt',    combo: 'Alt+S',   match: { key: 's', alt: true },        label: 'Tender',                   group: 'Sale', go: true },

  // ── The ticket ──────────────────────────────────────────────────────────────────────────
  { id: 'hold',         combo: 'Ctrl+H',  match: { key: 'h', ctrl: true },       label: 'Hold Trans',      rail: 1, group: 'Ticket' },
  { id: 'retrieve',     combo: 'Ctrl+R',  match: { key: 'r', ctrl: true },       label: 'Retrieve Trans',  rail: 1, group: 'Ticket' },
  { id: 'clearTicket',  combo: 'Ctrl+D',  match: { key: 'd', ctrl: true },       label: 'Clear Ticket',             group: 'Ticket' },
  { id: 'print',        combo: 'Ctrl+P',  match: { key: 'p', ctrl: true },       label: 'Print',                    group: 'Ticket' },
  { id: 'lastGst',      combo: 'PgUp',    match: { key: 'PageUp' },              label: 'Last GST',                 group: 'Ticket' },
  { id: 'date',         combo: 'F2',      match: { key: 'F2' },                  label: 'Date',            rail: 2, group: 'Ticket' },
  { id: 'help',         combo: 'F1',      match: { key: 'F1' },                  label: 'Help',            rail: 2, group: 'Ticket' },
  { id: 'exit',         combo: 'Esc',     match: { key: 'Escape' },              label: 'Exit',            rail: 2, group: 'Ticket' },

  // The browser keeps F11 (fullscreen) and F12 (devtools) whatever we do here — only the
  // Electron terminal can take them, so these stay listed but unbound on web.
  { id: 'day',          combo: 'F11',     match: { key: 'F11' },                 label: 'Day',             rail: 2, group: 'Ticket', todo: true },
  { id: 'location',     combo: 'F12',     match: { key: 'F12' },                 label: 'Location',        rail: 2, group: 'Ticket', todo: true },
  { id: 'barcodePrn',   combo: 'B',       match: { key: 'b', ctrl: true },       label: 'Barcode Prn',     rail: 2, group: 'Ticket', todo: true },

  // ── Ours, kept alongside the RanceLab set ───────────────────────────────────────────────
  // Bill discount and quotation moved off Ctrl+D / Alt+Q, which the spec assigns to Clear
  // Ticket and Qty.
  { id: 'billDiscount', combo: 'Ctrl+Shift+B', match: { key: 'b', ctrl: true, shift: true }, label: 'Bill Discount', group: 'Pelbu', extra: true },
  { id: 'quotation',    combo: 'Ctrl+Q',  match: { key: 'q', ctrl: true },       label: 'Quotation / SO',           group: 'Pelbu', extra: true },
  { id: 'exchange',     combo: 'Ctrl+E',  match: { key: 'e', ctrl: true },       label: 'Exchange / Return',        group: 'Pelbu', extra: true },
  { id: 'postMarket',   combo: 'Alt+M',   match: { key: 'm', alt: true },        label: 'Post to Market',           group: 'Pelbu', extra: true },
  { id: 'zReport',      combo: 'Ctrl+Shift+Z', match: { key: 'z', ctrl: true, shift: true }, label: 'Z-Report',     group: 'Pelbu', extra: true },
  { id: 'cashInOut',    combo: 'Ctrl+Shift+X', match: { key: 'x', ctrl: true, shift: true }, label: 'Cash In / Out', group: 'Pelbu', extra: true },
]

// Navigation that is inherent to the grid rather than a bindable command — listed for the F1
// sheet only; the page handles these directly.
export const COUNTER_NAV = [
  { combo: '↑ ↓',   label: 'Move the highlighted line' },
  { combo: 'Enter', label: 'Edit qty on the highlighted line' },
  { combo: 'Tab',   label: 'Next ticket' },
  { combo: 'Ctrl+1…9', label: 'Jump to ticket' },
  { combo: 'Any key', label: 'Start a product search' },
]

/** Does this keydown match a map entry? Modifiers are exact — a combo without ctrl never
 *  matches a ctrl-held press, so Ctrl+M can't fire the plain-M search. */
export function matches(event, entry) {
  const m = entry.match
  const isLetter = m.key.length === 1
  // Option rewrites the character on macOS (Alt+L arrives as '¬'), so letter combos taken with
  // Alt are matched on the physical key instead of the glyph.
  const hit = isLetter
    ? (m.alt ? event.code === `Key${m.key.toUpperCase()}` : event.key.toLowerCase() === m.key)
    : event.key === m.key
  return hit && !!m.ctrl === (event.ctrlKey || event.metaKey) && !!m.alt === event.altKey && !!m.shift === event.shiftKey
}

/** The entry a keydown resolves to, or null. */
export function resolve(event) {
  return COUNTER_KEYS.find((entry) => matches(event, entry)) || null
}

/** Entries on one page of the footer rail, in map order. */
export function railPage(page) {
  return COUNTER_KEYS.filter((entry) => entry.rail === page)
}

export const RAIL_PAGES = 2
