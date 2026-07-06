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
  applyBillDiscount: (amount: number) => void;
  isManager: boolean;
  setShowSalesperson: (v: boolean) => void;
  setShowComplimentary: (v: boolean) => void;
  setShowExchange: (v: boolean) => void;
  setShowPostMarket: (v: boolean) => void;
  setShowQuotation: (v: boolean) => void;
  setShowDeliveryAddress: (v: boolean) => void;
  // Optional overrides — the listing (keyboard) layout routes F3 to its full-screen
  // search modal and F9 to the cart-table inline qty edit. When omitted, F3 focuses
  // the grid search box and F9 shows the change-qty hint (grid-mode default).
  onFocusSearch?: () => void;
  onChangeQty?: () => void;
}

/** Shortcut whose target feature ships in a later phase — shows a toast. */
const stub = (msg: string) => (e: KeyboardEvent) => {
  e.preventDefault();
  toast(msg);
};

export function usePosShortcuts(input: PosShortcutsInput) {
  const { registerShortcut } = useKeyboardRegistry();

  const setup = useCallback(() => {
    // Grid-mode default: focus the in-grid search box. Listing mode overrides this
    // (input.onFocusSearch) to open the full-screen product-search modal.
    const focusSearch = () => input.onFocusSearch ? input.onFocusSearch() : document.getElementById("pos-search")?.focus();
    // Ctrl+D — invoice/bill-level discount: a single pre-GST amount off the net bill (NOT
    // distributed across lines). Enter a % of the taxable base; it's stored on the cart and GST
    // is then computed on the discounted net.
    const billDiscount = () => {
      if (input.items.length === 0) {
        toast("Cart is empty — add items first");
        return;
      }
      const raw = window.prompt("Invoice discount (%) off the bill, before GST:");
      if (raw === null) return;
      const pct = Math.min(100, Math.max(0, parseFloat(raw) || 0));
      const taxable = input.items.reduce((s, it) => s + Math.max(0, it.unit_price - (it.discount || 0)) * it.quantity, 0);
      const amount = parseFloat(((taxable * pct) / 100).toFixed(2));
      input.applyBillDiscount(amount);
      toast.success(pct > 0 ? `Invoice discount ${pct}% (Nu. ${amount.toFixed(2)}) applied` : "Invoice discount cleared");
    };

    // --- Function keys (canonical Pelbu map) ---
    const unregs = [
      registerShortcut("global", { key: "F1" }, () => input.showHelpToggle()),
      registerShortcut("global", { key: "F2" }, () => input.handleNewTransaction()),
      registerShortcut("global", { key: "F3" }, focusSearch),                          // Search
      registerShortcut("global", { key: "F4" }, () => input.handleHoldCart()),         // New Cart (hold current)
      registerShortcut("global", { key: "F5" }, () => input.setShowHeldCarts(true)),   // Previous Cart (recall held)
      registerShortcut("global", { key: "F6" }, () => input.setShowCustomer(true)),    // Customer
      registerShortcut("global", { key: "F8" }, () => input.setShowSalesperson(true)),                 // Sales person
      registerShortcut("global", { key: "F9" }, (e) => {
        // Listing mode: edit qty on the selected cart row. Grid mode has no row
        // selection, so fall back to the change-qty hint.
        if (input.onChangeQty) { e.preventDefault(); input.onChangeQty(); }
        else stub("Change qty — tap +/- or # on any line")(e);
      }),
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
      registerShortcut("global", { key: "c", ctrl: true }, (e) => {
        e.preventDefault();
        if (!input.isManager) { toast("Complimentary is manager-only"); return; }
        input.setShowComplimentary(true);
      }),                                                                                              // Complimentary (manager)
      registerShortcut("global", { key: "e", ctrl: true }, (e) => { e.preventDefault(); input.setShowExchange(true); }),                  // Exchange / return

      // --- Alt modifiers (all stubs) ---
      registerShortcut("global", { key: "m", alt: true }, (e) => { e.preventDefault(); input.setShowPostMarket(true); }),                  // Post to market
      registerShortcut("global", { key: "q", alt: true }, (e) => { e.preventDefault(); input.setShowQuotation(true); }),                   // Save as quotation
      registerShortcut("global", { key: "d", alt: true }, (e) => { e.preventDefault(); input.setShowDeliveryAddress(true); }),             // Delivery address
    ];

    return () => unregs.forEach((un) => un());
  }, [registerShortcut, input]);

  return setup;
}
