"use client";

interface ListingFooterProps {
  itemCount: number;
  subtotal: number;
  gstTotal: number;
  grandTotal: number;
}

// Compact F-key legend for the listing layout. Mirrors the canonical Pelbu map
// (use-pos-shortcuts / help-overlay) so the operator sees the full intent at a glance.
const SHORTCUTS: { key: string; label: string }[] = [
  { key: "F1", label: "Help" },
  { key: "F2", label: "Clear" },
  { key: "F3", label: "Search" },
  { key: "F4", label: "Hold" },
  { key: "F5", label: "Recall" },
  { key: "F6", label: "Customer" },
  { key: "F7", label: "Price List" },
  { key: "F8", label: "Salesperson" },
  { key: "F9", label: "Change Qty" },
  { key: "F10", label: "Tender" },
  { key: "Ctrl+D", label: "Bill Disc" },
  { key: "Del", label: "Remove" },
];

const NAMED_KEYS: Record<string, string> = {
  del: "Delete", delete: "Delete", esc: "Escape", escape: "Escape", enter: "Enter", tab: "Tab", space: " ",
};

// Map a display label ("F10", "Ctrl+D", "Del", …) to a KeyboardEvent init, or null when it
// isn't a single dispatchable key. Tapping a button re-dispatches this keydown on document so
// the existing use-keyboard-registry handlers run unchanged (single source of truth).
function keyEventInit(label: string): KeyboardEventInit | null {
  const init: KeyboardEventInit = { bubbles: true, cancelable: true };
  let key: string | null = null;
  for (let part of label.split("+")) {
    part = part.trim();
    if (!part) continue;
    if (/^(ctrl|control)$/i.test(part)) { init.ctrlKey = true; continue; }
    if (/^alt$/i.test(part))            { init.altKey = true;  continue; }
    if (/^shift$/i.test(part))          { init.shiftKey = true; continue; }
    if (part.startsWith("⇧"))           { init.shiftKey = true; part = part.slice(1); }
    const low = part.toLowerCase();
    if (NAMED_KEYS[low])               key = NAMED_KEYS[low];
    else if (/^f\d{1,2}$/i.test(part)) key = part.toUpperCase();
    else if (part.length === 1)        key = part.toLowerCase();
  }
  if (!key) return null;
  init.key = key;
  return init;
}

function triggerShortcut(label: string) {
  const init = keyEventInit(label);
  if (!init) return;
  const el = document.activeElement as HTMLElement | null;
  if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) el.blur?.();
  document.dispatchEvent(new KeyboardEvent("keydown", init));
}

/**
 * Bottom strip for the keyboard (listing) layout: running totals on the left when the
 * cart has items, and the F-key legend as big tappable buttons. Matches the web footer.
 */
export function ListingFooter({ itemCount, subtotal, gstTotal, grandTotal }: ListingFooterProps) {
  return (
    <div className="border-t border-border bg-muted/20 shrink-0">
      {itemCount > 0 && (
        <div className="px-4 py-2 flex items-center justify-end gap-6 text-sm tabular-nums border-b border-border/50">
          <span className="text-muted-foreground">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">
            Subtotal: <strong className="text-foreground">Nu. {subtotal.toFixed(2)}</strong>
          </span>
          <span className="text-muted-foreground">
            GST (5%): <strong className="text-foreground">Nu. {gstTotal.toFixed(2)}</strong>
          </span>
          <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
        </div>
      )}
      <div className="px-3 py-2 flex flex-wrap items-center gap-2">
        {SHORTCUTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => triggerShortcut(s.key)}
            title={`${s.key} — ${s.label}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 min-h-[52px] select-none transition hover:bg-accent hover:border-primary/50 active:scale-95 cursor-pointer"
          >
            <span className="text-sm font-mono font-bold px-2 py-1 rounded bg-muted text-foreground border border-border whitespace-nowrap">
              {s.key}
            </span>
            <span className="text-sm font-medium text-foreground whitespace-nowrap">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
