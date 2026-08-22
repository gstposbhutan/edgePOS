"use client";

import { useEffect, useRef } from "react";

interface BarcodeRowProps {
  /** A sheet is open — stop stealing focus until it closes. */
  disabled: boolean;
  /** Enter with text in the field: a scanned code or a typed product query. */
  onSubmit: (value: string) => void;
}

export const BARCODE_INPUT_ID = "pos-barcode";

/**
 * The always-focused barcode row (spec WF-01: "Barcode stays focused unless a sheet is open").
 *
 * This is what a wedge scanner types into. Before it existed the scanner's first character
 * opened the search sheet and the rest raced that sheet's focus timer, so fast scans lost
 * their leading characters.
 *
 * Navigation keys are deliberately NOT handled here — the screen's listing listener treats
 * this field as an exception so ↑ ↓ still move the highlighted line while the caret stays put.
 */
export function BarcodeRow({ disabled, onSubmit }: BarcodeRowProps) {
  const ref = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  // Take focus on mount and whenever the last sheet closes.
  useEffect(() => {
    alive.current = true;
    if (!disabled) ref.current?.focus();
    return () => { alive.current = false; };
  }, [disabled]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background shrink-0">
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Barcode</span>
      <input
        id={BARCODE_INPUT_ID}
        ref={ref}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Scan or type"
        // Keep the caret here between sales: anything the cashier types is a product, and a
        // scanner has no way to click into a field. A sheet takes focus while it is open.
        // Reclaim the caret only when focus was dropped, never when another control took it:
        // relatedTarget is the element receiving focus, so a non-null value means the cashier
        // opened the qty or rate editor and stealing it back would close that editor instantly.
        // The deferred call also has to survive navigation, which blurs this row before it goes.
        onBlur={(e) => {
          if (disabled || e.relatedTarget) return;
          setTimeout(() => {
            if (alive.current && ref.current?.isConnected) ref.current.focus();
          }, 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const value = e.currentTarget.value.trim();
            if (!value) return;          // empty Enter belongs to the qty cycle, handled upstream
            e.currentTarget.value = "";
            onSubmit(value);
          } else if (e.key === "Escape") {
            e.currentTarget.value = "";
          }
        }}
        className="flex-1 h-8 px-2 bg-transparent border-0 border-b-2 border-primary/60 focus:border-primary outline-none text-sm"
      />
    </div>
  );
}
