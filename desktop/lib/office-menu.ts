// The Office letter menu (spec WF-08/WF-09).
//
// RanceLab's back office is driven by single letters rather than a pointer: P for Purchase, W for
// Warehouse and so on, with a second row of letters once you are inside a module. Shops arriving
// from it navigate that way by reflex, so the terminal offers the same strip.
//
// The letters are RanceLab's, but the destinations are ours and only some exist on a terminal —
// this is a register, with the full back office on the cloud app. A module with nowhere to go is
// marked `todo`: it is shown dimmed and says so, rather than looking broken or, worse, silently
// doing nothing under a trained reflex.

export interface OfficeEntry {
  letter: string;
  label: string;
  href?: string;
  todo?: boolean;
  /** Second-level letters, shown once this module is the active one. */
  children?: OfficeEntry[];
}

export const OFFICE_MODULES: OfficeEntry[] = [
  {
    letter: "P", label: "Purchase Management", href: "/b2b-orders",
    children: [
      { letter: "O", label: "Purchase Order Register", href: "/b2b-orders" },
      { letter: "V", label: "Purchase Voucher", todo: true },
      { letter: "R", label: "Purchase Return Register", todo: true },
    ],
  },
  {
    letter: "S", label: "Sale Management", href: "/",
    children: [
      { letter: "T", label: "Transaction (Counter)", href: "/" },
      { letter: "R", label: "Reports", todo: true },
    ],
  },
  {
    letter: "W", label: "Warehouse Management", href: "/stock",
    children: [
      { letter: "O", label: "Stock Register", href: "/stock" },
      { letter: "D", label: "Discrepancy", href: "/adjustments" },
      { letter: "N", label: "Opening Stock", todo: true },
      { letter: "J", label: "Stock Journal", todo: true },
    ],
  },
  // Cash in/out and the Z-report live on the counter as sheets (Ctrl+Shift+X / Ctrl+Shift+Z),
  // not as their own screens, so there is nothing to navigate to here yet.
  { letter: "F", label: "Financial Management", todo: true },
  { letter: "C", label: "Customer Relationship", href: "/customers" },
  { letter: "R", label: "Customer Service", href: "/online-orders" },
  { letter: "E", label: "Payroll", todo: true },
  // Products, prices and tax data are owned by the cloud catalog and sync down; a terminal does
  // not author them.
  { letter: "M", label: "Master Data Management", todo: true },
  { letter: "T", label: "Settings", href: "/settings" },
  { letter: "X", label: "Exit", href: "/" },
];

/**
 * Route paths as the app actually serves them. The terminal ships as a static export, so screens
 * are reached as `/stock.html` rather than `/stock` — normalise before matching, or nothing ever
 * looks like the module it is.
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const stripped = pathname.replace(/\.html$/, "");
  return stripped === "" || stripped === "/index" ? "/" : stripped;
}

/** The module whose screen we are currently on, so its second row can be shown. */
export function activeModule(pathname: string): OfficeEntry | null {
  const path = normalizePath(pathname);
  if (path === "/") return null;   // the counter is not an Office screen
  return (
    OFFICE_MODULES.find(
      (m) => m.href === path || m.children?.some((c) => c.href === path),
    ) ?? null
  );
}

/** Letter keys are for navigating, so they must never fire while something is being typed. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
