"use client"

import { ShortcutBar } from "@/components/pos/keyboard/shortcut-bar"

/**
 * Bottom strip for the keyboard (listing) layout: the running totals, then the paged F-key rail
 * (spec WF-01 / WF-02). The mirror of desktop/components/pos/keyboard/listing-footer.tsx — the
 * rail itself is ShortcutBar, which already renders the shared key map, so this only adds the
 * totals line above it rather than keeping a second copy of the legend.
 */
export function ListingFooter({ itemCount, subtotal, billDiscount = 0, gstTotal, grandTotal, gstIncluded = false }) {
  return (
    <div className="shrink-0">
      {itemCount > 0 && (
        <div className="border-t border-border bg-muted/20 px-4 py-2 flex items-center justify-end gap-6 text-sm tabular-nums">
          <span className="text-muted-foreground">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">
            Subtotal: <strong className="text-foreground">Nu. {subtotal.toFixed(2)}</strong>
          </span>
          {billDiscount > 0 && (
            <span className="text-emerald-600">
              Invoice disc: <strong>−Nu. {billDiscount.toFixed(2)}</strong>
            </span>
          )}
          <span className="text-muted-foreground">
            {/* Which way the tax ran matters to anyone checking the slip against the shelf
                price, so the label says it rather than leaving the figure to be guessed at. */}
            GST (5%{gstIncluded ? ' incl' : ''}): <strong className="text-foreground">Nu. {gstTotal.toFixed(2)}</strong>
          </span>
          <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
        </div>
      )}
      <ShortcutBar />
    </div>
  )
}
