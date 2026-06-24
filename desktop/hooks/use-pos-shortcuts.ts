"use client";

import { useCallback } from "react";
import { useKeyboardRegistry } from "./use-keyboard-registry";
import { toast } from "sonner";
import type { CartItem } from "./use-cart";

interface PosShortcutsInput {
  items: CartItem[];
  showPayment: boolean;
  showHeldCarts: boolean;
  showCustomer: boolean;
  setShowPayment: (v: boolean) => void;
  setShowHeldCarts: (v: boolean) => void;
  showHelpToggle: () => void;
  setShowCustomer: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  handleNewTransaction: () => void;
  handleHoldCart: () => void;
  handleCheckout: () => void;
  handleVoidLast: () => void;
  handleUndo: () => void;
  applyDiscount: (itemId: string, discount: number) => void;
}

/** Shortcut whose target feature ships in a later phase — shows a toast. */
const stub = (msg: string) => (e: KeyboardEvent) => {
  e.preventDefault();
  toast(msg);
};

export function usePosShortcuts(input: PosShortcutsInput) {
  const { registerShortcut } = useKeyboardRegistry();

  const setup = useCallback(() => {
    const focusSearch = () => document.getElementById("pos-search")?.focus();
    // Ctrl+D — percentage bill discount applied to every line via the existing
    // per-item applyDiscount (PERCENT converted to a per-unit flat amount).
    const billDiscount = () => {
      if (input.items.length === 0) {
        toast("Cart is empty — add items first");
        return;
      }
      const raw = window.prompt("Bill discount (%) — applies to all lines:");
      if (raw === null) return;
      const pct = Math.min(100, Math.max(0, parseFloat(raw) || 0));
      if (pct <= 0) return;
      input.items.forEach((it) => {
        const perUnit = parseFloat(((it.unit_price * pct) / 100).toFixed(2));
        input.applyDiscount(it.id, perUnit);
      });
      toast.success(`Bill discount ${pct}% applied to ${input.items.length} item(s)`);
    };

    // --- Function keys (canonical Pelbu map) ---
    const unregs = [
      registerShortcut("global", { key: "F1" }, () => input.showHelpToggle()),
      registerShortcut("global", { key: "F2" }, () => input.handleNewTransaction()),
      registerShortcut("global", { key: "F3" }, focusSearch),                          // Search
      registerShortcut("global", { key: "F4" }, () => input.handleHoldCart()),         // New Cart (hold current)
      registerShortcut("global", { key: "F5" }, () => input.setShowHeldCarts(true)),   // Previous Cart (recall held)
      registerShortcut("global", { key: "F6" }, () => input.setShowCustomer(true)),    // Customer
      registerShortcut("global", { key: "F7" }, stub("Price List — coming in phase 3")),
      registerShortcut("global", { key: "F8" }, stub("Sales Person — coming in phase 4")),
      registerShortcut("global", { key: "F9" }, stub("Change qty — tap +/- or # on any line")),
      registerShortcut("global", { key: "F10" }, () => input.handleCheckout()),        // Tender
      registerShortcut("global", { key: "F11" }, () => {                               // fullscreen (utility, kept)
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }),
      registerShortcut("global", { key: "Escape" }, () => {
        if (input.showPayment) input.setShowPayment(false);
        else if (input.showHeldCarts) input.setShowHeldCarts(false);
        else if (input.showCustomer) input.setShowCustomer(false);
        else input.setSearchQuery("");
      }),
      registerShortcut("global", { key: "Tab" }, () => { /* panel toggle handled externally */ }),
      registerShortcut("global", { key: "z", ctrl: true }, () => input.handleUndo()),
      registerShortcut("global", { key: "Delete" }, () => input.handleVoidLast()),  // Remove last (toast + undo)

      // --- Ctrl modifiers ---
      registerShortcut("global", { key: "a", ctrl: true }, (e) => { e.preventDefault(); focusSearch(); }),    // Add
      registerShortcut("global", { key: "r", ctrl: true }, (e) => { e.preventDefault(); input.handleVoidLast(); }),     // Remove last (toast + undo)
      registerShortcut("global", { key: "d", ctrl: true }, (e) => { e.preventDefault(); billDiscount(); }),   // Bill discount (all lines)
      registerShortcut("global", { key: "c", ctrl: true }, stub("Complimentary — coming in phase 4")),
      registerShortcut("global", { key: "e", ctrl: true }, stub("Exchange — coming in phase 4")),

      // --- Alt modifiers (all stubs) ---
      registerShortcut("global", { key: "a", alt: true }, stub("Price List — coming in phase 3")),
      registerShortcut("global", { key: "m", alt: true }, stub("Post to Market — coming in phase 4")),
      registerShortcut("global", { key: "q", alt: true }, stub("Convert to Quotation — coming in phase 4")),
      registerShortcut("global", { key: "d", alt: true }, stub("Delivery Address — coming in phase 4")),
    ];

    return () => unregs.forEach((un) => un());
  }, [registerShortcut, input]);

  return setup;
}
