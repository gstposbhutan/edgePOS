"use client";

import { useCallback } from "react";
import { useKeyboardRegistry } from "./use-keyboard-registry";
import { toast } from "sonner";
import { LAYOUT_PRESETS } from "@/lib/constants";
import type { CartItem } from "./use-cart";
import type { LayoutPreset } from "@/lib/constants";

interface PosShortcutsInput {
  items: CartItem[];
  lastOrder: any;
  showPayment: boolean;
  showHeldCarts: boolean;
  showCustomer: boolean;
  setShowPayment: (v: boolean) => void;
  setShowHeldCarts: (v: boolean) => void;
  showHelpToggle: () => void;
  setShowCustomer: (v: boolean) => void;
  setShowReceipt: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  handleNewTransaction: () => void;
  handleHoldCart: () => void;
  handleCheckout: () => void;
  handleVoidLast: () => void;
  handleUndo: () => void;
  applyDiscount: (itemId: string, discount: number) => void;
  removeItem: (itemId: string) => void;
  setLayout: (preset: LayoutPreset) => void;
}

export function usePosShortcuts(input: PosShortcutsInput) {
  const { registerShortcut } = useKeyboardRegistry();

  const setup = useCallback(() => {
    const unreg1 = registerShortcut("global", { key: "F1" }, () => { input.showHelpToggle(); });
    const unreg2 = registerShortcut("global", { key: "F2" }, () => { input.handleNewTransaction(); });
    const unreg3 = registerShortcut("global", { key: "F3" }, () => { input.handleHoldCart(); });
    const unreg4 = registerShortcut("global", { key: "F4" }, () => { input.setShowHeldCarts(true); });
    const unreg5 = registerShortcut("global", { key: "F5" }, () => { input.handleCheckout(); });
    const unreg6 = registerShortcut("global", { key: "F6" }, () => {
      if (input.lastOrder) input.setShowReceipt(true);
      else toast("No receipt to print");
    });
    const unreg7 = registerShortcut("global", { key: "F7" }, () => { input.handleVoidLast(); });
    const unreg8 = registerShortcut("global", { key: "F9" }, () => {
      document.getElementById("pos-search")?.focus();
    });
    const unreg9 = registerShortcut("global", { key: "F10" }, () => {
      if (input.items.length === 0) {
        toast("Cart is empty — add items first");
        return;
      }
      const amt = prompt("Enter discount per unit (Nu.):");
      if (amt !== null && input.items.length > 0) {
        const discount = parseFloat(amt) || 0;
        input.applyDiscount(input.items[input.items.length - 1].id, discount);
        toast.success(`Discount set: Nu. ${discount.toFixed(2)}`);
      }
    });
    const unreg10 = registerShortcut("global", { key: "F11" }, () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    });
    const unreg11 = registerShortcut("global", { key: "Escape" }, () => {
      if (input.showPayment) input.setShowPayment(false);
      else if (input.showHeldCarts) input.setShowHeldCarts(false);
      else if (input.showCustomer) input.setShowCustomer(false);
      else input.setSearchQuery("");
    });
    const unreg12 = registerShortcut("global", { key: "Tab" }, () => {
      // Toggle handled externally
    });
    const unreg13 = registerShortcut("global", { key: "z", ctrl: true }, () => { input.handleUndo(); });
    const unreg14 = registerShortcut("global", { key: "Delete" }, () => {
      if (input.items.length > 0) input.removeItem(input.items[input.items.length - 1].id);
    });
    const unreg15 = registerShortcut("global", { key: "c", ctrl: true, shift: false }, () => { input.setLayout(LAYOUT_PRESETS.COMPACT); });
    const unreg16 = registerShortcut("global", { key: "s", ctrl: true }, () => { input.setLayout(LAYOUT_PRESETS.STANDARD); });

    return () => {
      unreg1(); unreg2(); unreg3(); unreg4(); unreg5(); unreg6(); unreg7(); unreg8();
      unreg9(); unreg10(); unreg11(); unreg12(); unreg13(); unreg14(); unreg15(); unreg16();
    };
  }, [registerShortcut, input]);

  return setup;
}
