"use client";

import { useState, useCallback } from "react";
import { getPB } from "@/lib/pb-client";
import type { CartItem } from "./use-cart";

export interface HeldCart {
  id: string;
  label: string;
  heldAt: string;
  items: CartItem[];
  itemCount: number;
  total: number;
}

const HELD_KEY = "nexus_pos_held_carts";
const MAX_HELD = 10;

export function useHeldCarts() {
  const pb = getPB();
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);

  const loadHeld = useCallback(() => {
    try {
      const stored = localStorage.getItem(HELD_KEY);
      if (stored) setHeldCarts(JSON.parse(stored));
    } catch {
      // Silent fail
    }
  }, []);

  const persist = useCallback((carts: HeldCart[]) => {
    setHeldCarts(carts);
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(carts));
    } catch {
      // Silent fail
    }
  }, []);

  const holdCart = useCallback(
    async (items: CartItem[], label?: string) => {
      if (heldCarts.length >= MAX_HELD) {
        return { success: false, error: `Maximum ${MAX_HELD} held carts reached` };
      }

      const total = items.reduce((sum, i) => sum + i.total, 0);
      const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

      const heldCart: HeldCart = {
        id: `held_${Date.now()}`,
        label: label || `Cart ${heldCarts.length + 1}`,
        heldAt: new Date().toISOString(),
        items,
        itemCount,
        total,
      };

      persist([...heldCarts, heldCart]);
      return { success: true, cart: heldCart };
    },
    [heldCarts, persist]
  );

  const recallCart = useCallback(
    (cartId: string): HeldCart | null => {
      const cart = heldCarts.find((c) => c.id === cartId);
      if (!cart) return null;
      persist(heldCarts.filter((c) => c.id !== cartId));
      return cart;
    },
    [heldCarts, persist]
  );

  const discardHeld = useCallback(
    (cartId: string) => {
      persist(heldCarts.filter((c) => c.id !== cartId));
    },
    [heldCarts, persist]
  );

  return {
    heldCarts,
    loadHeld,
    holdCart,
    recallCart,
    discardHeld,
  };
}
