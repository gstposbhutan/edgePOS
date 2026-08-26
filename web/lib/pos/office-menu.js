// The Office letter menu (spec WF-08/WF-09), web edition.
//
// The incumbent ERP's back office is driven by single letters rather than a pointer: P for
// Purchase, W for Warehouse and so on. Shops arriving from it navigate that way by reflex, so
// the till offers the same strip. The letters are the convention; the destinations are ours.
//
// The mirror of desktop/lib/office-menu.ts — same letters in the same order, so a shopkeeper
// moving between the terminal and the browser presses the same key for the same module. The
// difference is what exists on each side: a terminal is a register with the back office in the
// cloud, so several of its modules are marked `todo`, while here the back office IS the app and
// most of them are real screens.
//
// A module with nowhere to go is `todo`: shown dimmed and says so, rather than looking broken
// or, worse, silently doing nothing under a trained reflex.

export const OFFICE_MODULES = [
  {
    letter: 'P', label: 'Purchase Management', href: '/pos/purchases',
    children: [
      { letter: 'O', label: 'Purchase Order Register', href: '/pos/purchases' },
      { letter: 'V', label: 'Purchase Voucher', todo: true },
      { letter: 'R', label: 'Purchase Return Register', todo: true },
    ],
  },
  {
    letter: 'S', label: 'Sale Management', href: '/pos',
    children: [
      { letter: 'T', label: 'Transaction (Counter)', href: '/pos' },
      { letter: 'O', label: 'Order Register', href: '/pos/orders' },
      { letter: 'R', label: 'GST Report', href: '/pos/reports' },
      { letter: 'D', label: 'Day Book', href: '/pos/reports/day-book' },
    ],
  },
  {
    letter: 'W', label: 'Warehouse Management', href: '/pos/inventory',
    children: [
      { letter: 'O', label: 'Stock Register', href: '/pos/inventory' },
      { letter: 'L', label: 'Stock Ledger', href: '/pos/inventory/ledger' },
      { letter: 'D', label: 'Discrepancy', todo: true },
      { letter: 'N', label: 'Opening Stock', todo: true },
      { letter: 'J', label: 'Stock Journal', todo: true },
    ],
  },
  {
    letter: 'F', label: 'Financial Management', href: '/pos/khata',
    children: [
      { letter: 'K', label: 'Khata (credit ledger)', href: '/pos/khata' },
      { letter: 'B', label: 'Cash Book', href: '/pos/reports/cash-book' },
      { letter: 'C', label: 'Cash Registers', href: '/pos/registers' },
      { letter: 'S', label: 'Shifts', href: '/pos/shifts' },
    ],
  },
  { letter: 'C', label: 'Customer Relationship', href: '/pos/khata' },
  { letter: 'R', label: 'Customer Service', href: '/pos/orders' },
  { letter: 'E', label: 'Payroll', todo: true },
  {
    letter: 'M', label: 'Master Data Management', href: '/pos/products',
    children: [
      { letter: 'P', label: 'Products', href: '/pos/products' },
      { letter: 'T', label: 'Team', href: '/pos/team' },
      { letter: 'S', label: 'Stores', href: '/pos/stores' },
    ],
  },
  {
    letter: 'T', label: 'Settings', href: '/pos/settings',
    children: [
      { letter: 'S', label: 'Store Settings', href: '/pos/settings' },
      // The desktop installer used to hang off the sidebar's OWNER-only rail. The office screens
      // and the counter stand that rail down, so the link was reachable from four obscure screens
      // and nowhere a shopkeeper would look. It belongs on the letter menu, which every screen has.
      { letter: 'D', label: 'Desktop App', href: '/downloads' },
    ],
  },
  { letter: 'X', label: 'Exit', href: '/pos' },
]

/** Letter keys are for navigating, so they must never fire while something is being typed. */
export function isTypingTarget(target) {
  const el = target
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/**
 * The screens wearing the back-office frame (OfficeShell).
 *
 * They are full-bleed the way the counter is: the frame states where you are and the letter
 * menu moves you, so a pointer rail beside them would be a second, competing way to navigate.
 * Listed here rather than sniffed from the component, because the SIDEBAR is what needs to
 * know and it renders above these pages in the layout.
 */
export const OFFICE_ROUTES = [
  '/pos/reports',
  '/pos/khata',
  '/pos/purchases',
  '/pos/inventory',
  '/pos/products',
  '/pos/registers',
  '/pos/shifts',
  '/pos/stores',
  '/pos/team',
  '/pos/settings',
  '/pos/inventory/ledger',
  '/pos/orders',
  '/pos/reports/day-book',
  '/pos/reports/cash-book',
  '/downloads',
]

/**
 * Office screens whose path carries a record id (…/products/<id>). Matched by prefix, since the
 * id cannot be listed ahead of time.
 */
const OFFICE_PREFIXES = ['/pos/products/']

/** True when `pathname` is an office-framed screen (its own route, not a child of it). */
export function isOfficeRoute(pathname) {
  return OFFICE_ROUTES.includes(pathname) || OFFICE_PREFIXES.some(prefix => pathname.startsWith(prefix))
}
