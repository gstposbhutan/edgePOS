// The Counter key map for the terminal.
//
// Shops arrive trained on RanceLab, so the till speaks that dialect (spec:
// docs/keyboard-shortcuts.html in the repo root). This table is the ONE source of truth —
// use-pos-shortcuts registers by `id`, the listing footer renders entries by `rail` page, and
// the F1 sheet renders the whole table. Those three each kept their own copy before and drifted.
//
// Unlike the web till the terminal owns the whole keyboard, so F11 (Day) and F12 (Location)
// are real here; the Electron fullscreen toggle moved to Alt+Enter to free F11.

export interface KeyEntry {
  id: string;
  combo: string;                 // what the operator sees
  match: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
  label: string;
  rail?: 1 | 2;                  // which page of the two-page footer (spec WF-01 / WF-02)
  group: string;                 // heading in the F1 sheet
  go?: boolean;                  // the tender key, highlighted everywhere
  todo?: boolean;                // reserved by the spec, action not built yet
}

export const COUNTER_KEYS: KeyEntry[] = [
  // ── Line editing ────────────────────────────────────────────────────────────────────────
  { id: "qtyUp",        combo: "F3",     match: { key: "F3" },                 label: "Add Quantity",    rail: 1, group: "Line" },
  { id: "qtyDown",      combo: "F4",     match: { key: "F4" },                 label: "Less Quantity",   rail: 1, group: "Line" },
  { id: "rate",         combo: "F5",     match: { key: "F5" },                 label: "Rate Change",     rail: 1, group: "Line" },
  { id: "qtyFocus",     combo: "Alt+Q",  match: { key: "q", alt: true },       label: "Qty",                      group: "Line" },
  { id: "unitSheet",    combo: "Alt+U",  match: { key: "u", alt: true },       label: "Unit",                     group: "Line", todo: true },
  { id: "itemDiscount", combo: "Ctrl+M", match: { key: "m", ctrl: true },      label: "Item Discount",   rail: 1, group: "Line" },
  { id: "itemRemark",   combo: "Ctrl+T", match: { key: "t", ctrl: true },      label: "Item Remark",     rail: 1, group: "Line", todo: true },
  { id: "complimentary",combo: "Ctrl+C", match: { key: "c", ctrl: true },      label: "Complimentary",   rail: 1, group: "Line" },
  { id: "removeLine",   combo: "Del",    match: { key: "Delete" },             label: "Remove",          rail: 1, group: "Line" },
  { id: "undo",         combo: "Ctrl+Z", match: { key: "z", ctrl: true },      label: "Undo",                     group: "Line" },

  // ── The sale ────────────────────────────────────────────────────────────────────────────
  { id: "productInfo",  combo: "F8",     match: { key: "F8" },                 label: "Product Info",    rail: 1, group: "Sale" },
  { id: "products",     combo: "Alt+L",  match: { key: "l", alt: true },       label: "Products",                 group: "Sale" },
  { id: "customerInfo", combo: "F9",     match: { key: "F9" },                 label: "Customer Info",   rail: 1, group: "Sale" },
  { id: "party",        combo: "F7",     match: { key: "F7" },                 label: "Party",           rail: 2, group: "Sale" },
  { id: "salesperson",  combo: "F6",     match: { key: "F6" },                 label: "Sales Person",    rail: 2, group: "Sale" },
  { id: "priceList",    combo: "Alt+P",  match: { key: "p", alt: true },       label: "Price List",      rail: 2, group: "Sale" },
  { id: "gstIncluded",  combo: "Alt+T",  match: { key: "t", alt: true },       label: "GST Included",             group: "Sale", todo: true },
  { id: "deliveryDetail",combo: "Ctrl+L",match: { key: "l", ctrl: true },      label: "Delivery Detail", rail: 1, group: "Sale" },
  { id: "tender",       combo: "F10",    match: { key: "F10" },                label: "Tender",          rail: 1, group: "Sale", go: true },
  { id: "tenderAlt",    combo: "Alt+S",  match: { key: "s", alt: true },       label: "Tender",                   group: "Sale", go: true },

  // ── The ticket ──────────────────────────────────────────────────────────────────────────
  { id: "hold",         combo: "Ctrl+H", match: { key: "h", ctrl: true },      label: "Hold Trans",      rail: 1, group: "Ticket" },
  { id: "retrieve",     combo: "Ctrl+R", match: { key: "r", ctrl: true },      label: "Retrieve Trans",  rail: 1, group: "Ticket" },
  { id: "clearTicket",  combo: "Ctrl+D", match: { key: "d", ctrl: true },      label: "Clear Ticket",             group: "Ticket" },
  { id: "print",        combo: "Ctrl+P", match: { key: "p", ctrl: true },      label: "Print",                    group: "Ticket" },
  { id: "lastGst",      combo: "PgUp",   match: { key: "PageUp" },             label: "Last GST",                 group: "Ticket" },
  { id: "date",         combo: "F2",     match: { key: "F2" },                 label: "Date",            rail: 2, group: "Ticket", todo: true },
  { id: "help",         combo: "F1",     match: { key: "F1" },                 label: "Help",            rail: 2, group: "Ticket" },
  { id: "exit",         combo: "Esc",    match: { key: "Escape" },             label: "Exit",            rail: 2, group: "Ticket" },
  // Real on the terminal: it owns the keyboard. Fullscreen moved off F11 to Alt+Enter.
  { id: "day",          combo: "F11",    match: { key: "F11" },                label: "Day",             rail: 2, group: "Ticket" },
  { id: "location",     combo: "F12",    match: { key: "F12" },                label: "Location",        rail: 2, group: "Ticket" },
  { id: "barcodePrn",   combo: "Ctrl+B", match: { key: "b", ctrl: true },      label: "Barcode Prn",     rail: 2, group: "Ticket", todo: true },

  // ── Ours, kept alongside the RanceLab set ───────────────────────────────────────────────
  // Bill discount and quotation moved off Ctrl+D / Alt+Q, which the spec gives to Clear Ticket
  // and Qty.
  { id: "billDiscount", combo: "Ctrl+Shift+B", match: { key: "b", ctrl: true, shift: true }, label: "Bill Discount", group: "Pelbu" },
  { id: "quotation",    combo: "Ctrl+Q", match: { key: "q", ctrl: true },      label: "Quotation / SO",           group: "Pelbu" },
  { id: "exchange",     combo: "Ctrl+E", match: { key: "e", ctrl: true },      label: "Exchange / Return",        group: "Pelbu" },
  { id: "postMarket",   combo: "Alt+M",  match: { key: "m", alt: true },       label: "Post to Market",           group: "Pelbu" },
];

// Grid navigation, listed for the F1 sheet only — the POS screen handles these directly.
export const COUNTER_NAV = [
  { combo: "↑ ↓",    label: "Move the highlighted line" },
  { combo: "Enter",  label: "Edit qty on the highlighted line" },
  { combo: "Any key", label: "Start a product search" },
];

export const RAIL_PAGES = 2;

export function railPage(page: number): KeyEntry[] {
  return COUNTER_KEYS.filter((e) => e.rail === page);
}

export function byId(id: string): KeyEntry | undefined {
  return COUNTER_KEYS.find((e) => e.id === id);
}
