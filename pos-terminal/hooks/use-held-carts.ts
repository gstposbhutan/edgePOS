"use client";

import { usePosStore } from "@/stores/pos-store";
export type { HeldCart } from "@/stores/pos-store";

export function useHeldCarts() {
  const heldCarts = usePosStore((s) => s.heldCarts);
  const holdCart = usePosStore((s) => s.holdCart);
  const recallCart = usePosStore((s) => s.recallCart);
  const discardHeld = usePosStore((s) => s.discardHeld);
  const loadHeld = usePosStore((s) => s.loadHeld);

  return { heldCarts, loadHeld, holdCart, recallCart, discardHeld };
}
