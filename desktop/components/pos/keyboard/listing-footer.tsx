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

/**
 * Bottom strip for the keyboard (listing) layout: running totals on the left when the
 * cart has items, and the F-key legend on the right. Matches the web footer region.
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
      <div className="px-4 py-1.5 flex items-center gap-3 overflow-x-auto">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
              {s.key}
            </span>
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
