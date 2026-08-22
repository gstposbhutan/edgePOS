"use client";

import { useCallback } from "react";
import { useKeyboardRegistry } from "./use-keyboard-registry";
import { toast } from "sonner";
import { COUNTER_KEYS } from "@/lib/pos-shortcuts";
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
  // F11 Day — the day-end (close shift) flow. F12 Location reports the bound shop.
  setShowShiftModal: (v: "open" | "close" | null) => void;
  storeName?: string;
  // Optional overrides — the listing (keyboard) layout owns row selection, so the
  // line-scoped keys are routed back to it. Grid mode has no selected row and gets a hint.
  onFocusSearch?: () => void;
  onChangeQty?: () => void;
  onQtyDelta?: (delta: number) => void;
  onItemDiscount?: () => void;
  onRateChange?: () => void;
}

export function usePosShortcuts(input: PosShortcutsInput) {
  const { registerShortcut } = useKeyboardRegistry();

  const setup = useCallback(() => {
    // Grid-mode default: focus the in-grid search box. Listing mode overrides this
    // (input.onFocusSearch) to open the full-screen product-search modal.
    const focusSearch = () =>
      input.onFocusSearch ? input.onFocusSearch() : document.getElementById("pos-search")?.focus();

    // Ctrl+Shift+B — invoice/bill-level discount: a single pre-GST amount off the net bill (NOT
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

    // A line-scoped key pressed in grid mode, which has no selected row.
    const needsListing = (what: string) => () => toast(`${what} — switch to List layout`);

    const actions: Record<string, () => void> = {
      help:          () => input.showHelpToggle(),
      exit:          () => {
        if (input.showPayment) input.setShowPayment(false);
        else if (input.showHeldCarts) input.setShowHeldCarts(false);
        else if (input.showCustomer) input.setShowCustomer(false);
        else input.setSearchQuery("");
      },

      qtyUp:         input.onQtyDelta ? () => input.onQtyDelta!(1)  : needsListing("Add quantity"),
      qtyDown:       input.onQtyDelta ? () => input.onQtyDelta!(-1) : needsListing("Less quantity"),
      qtyFocus:      input.onChangeQty ?? needsListing("Change qty"),
      rate:          input.onRateChange ?? needsListing("Rate change"),
      itemDiscount:  input.onItemDiscount ?? needsListing("Item discount"),
      complimentary: () => {
        if (!input.isManager) { toast("Complimentary is manager-only"); return; }
        input.setShowComplimentary(true);
      },
      removeLine:    () => input.handleVoidLast(),
      undo:          () => input.handleUndo(),

      productInfo:   focusSearch,
      products:      focusSearch,
      customerInfo:  () => input.setShowCustomer(true),
      party:         () => input.setShowCustomer(true),
      salesperson:   () => input.setShowSalesperson(true),
      deliveryDetail:() => input.setShowDeliveryAddress(true),
      tender:        () => input.handleCheckout(),
      tenderAlt:     () => input.handleCheckout(),

      hold:          () => input.handleHoldCart(),
      retrieve:      () => input.setShowHeldCarts(true),
      clearTicket:   () => input.handleNewTransaction(),
      // Day-end. The close-shift flow itself refuses to run on an open ticket, so a cashier
      // mid-sale is told rather than losing the ticket.
      day:           () => {
        if (input.items.length > 0) { toast("Finish or hold the ticket before day-end"); return; }
        input.setShowShiftModal("close");
      },
      location:      () => toast(input.storeName ? `Shop: ${input.storeName}` : "Shop not set"),

      billDiscount,
      quotation:     () => input.setShowQuotation(true),
      exchange:      () => input.setShowExchange(true),
      postMarket:    () => input.setShowPostMarket(true),
    };

    // Every binding comes from the shared map, so the keys, the footer rail and the F1 sheet
    // cannot disagree. A key the spec reserves but whose action is not built says so, rather
    // than silently doing nothing under a reflex the cashier trusts.
    const unregs = COUNTER_KEYS.map((entry) => {
      const run = entry.todo
        ? () => toast(`${entry.combo} ${entry.label} — not built yet`)
        : actions[entry.id];
      return registerShortcut("global", entry.match, (e: KeyboardEvent) => {
        e.preventDefault();
        if (run) run();
      });
    });

    return () => unregs.forEach((un) => un());
  }, [registerShortcut, input]);

  return setup;
}
