import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LAYOUT_PRESETS, LS_KEYS, MAX_HELD_CARTS, MAX_UNDO_STACK } from "@/lib/constants";
import type { LayoutPreset } from "@/lib/constants";
import type { CartItem } from "@/hooks/use-cart";
import type { StockFilter, SortField, SortOrder } from "@/hooks/use-products";

export interface HeldCart {
  id: string;
  label: string;
  heldAt: string;
  items: CartItem[];
  itemCount: number;
  total: number;
}

type UndoAction = () => void | Promise<void>;

export interface PosStore {
  // Product Filters (in-memory)
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (c: string | null) => void;
  selectedLetter: string | null;
  setSelectedLetter: (l: string | null) => void;
  stockFilter: StockFilter;
  setStockFilter: (f: StockFilter) => void;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
  sortField: SortField;
  setSortField: (f: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (o: SortOrder) => void;

  // Preferences (persisted)
  layoutPreset: LayoutPreset;
  setLayout: (value: LayoutPreset) => void;
  favorites: Record<string, string[]>; // userId -> productId[]
  toggleFavorite: (userId: string | undefined, productId: string) => void;
  isFavorite: (userId: string | undefined, productId: string) => boolean;
  clearFavorites: (userId: string | undefined) => void;
  taxExempt: boolean;
  setTaxExempt: (v: boolean) => void;

  // UI State (in-memory)
  activeModal: string | null;
  setActiveModal: (m: string | null) => void;

  // Undo Stack (in-memory)
  undoStack: UndoAction[];
  pushUndo: (action: UndoAction) => void;
  undoAction: () => Promise<{ ok: boolean }>;
  clearUndoStack: () => void;

  // Held Carts (persisted)
  heldCarts: HeldCart[];
  holdCart: (items: CartItem[], label?: string) => { success: boolean; error?: string; cart?: HeldCart };
  recallCart: (cartId: string) => HeldCart | null;
  discardHeld: (cartId: string) => void;
  loadHeld: () => void;
}

export const usePosStore = create<PosStore>()(
  persist(
    (set, get) => ({
      // Product Filters
      searchQuery: "",
      setSearchQuery: (q) => set({ searchQuery: q }),
      selectedCategory: null,
      setSelectedCategory: (c) => set({ selectedCategory: c, selectedLetter: null }),
      selectedLetter: null,
      setSelectedLetter: (l) => set({ selectedLetter: l }),
      stockFilter: "all",
      setStockFilter: (f) => set({ stockFilter: f }),
      priceMin: "",
      setPriceMin: (v) => set({ priceMin: v }),
      priceMax: "",
      setPriceMax: (v) => set({ priceMax: v }),
      sortField: "name",
      setSortField: (f) => set({ sortField: f }),
      sortOrder: "asc",
      setSortOrder: (o) => set({ sortOrder: o }),

      // Preferences
      layoutPreset: LAYOUT_PRESETS.STANDARD,
      setLayout: (value) => set({ layoutPreset: value }),
      favorites: {},
      toggleFavorite: (userId, productId) => {
        const key = userId || "default";
        const current = get().favorites[key] || [];
        const next = current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [productId, ...current];
        set({ favorites: { ...get().favorites, [key]: next } });
      },
      isFavorite: (userId, productId) => {
        const key = userId || "default";
        return (get().favorites[key] || []).includes(productId);
      },
      clearFavorites: (userId) => {
        const key = userId || "default";
        set({ favorites: { ...get().favorites, [key]: [] } });
      },
      taxExempt: false,
      setTaxExempt: (v) => set({ taxExempt: v }),

      // UI State
      activeModal: null,
      setActiveModal: (m) => set({ activeModal: m }),

      // Undo Stack
      undoStack: [],
      pushUndo: (action) =>
        set((s) => {
          const next = [...s.undoStack, action];
          if (next.length > MAX_UNDO_STACK) next.shift();
          return { undoStack: next };
        }),
      undoAction: async () => {
        const stack = get().undoStack;
        if (stack.length === 0) return { ok: false };
        const action = stack[stack.length - 1];
        set({ undoStack: stack.slice(0, -1) });
        try {
          await action();
          return { ok: true };
        } catch {
          return { ok: false };
        }
      },
      clearUndoStack: () => set({ undoStack: [] }),

      // Held Carts
      heldCarts: [],
      holdCart: (items, label) => {
        const current = get().heldCarts;
        if (current.length >= MAX_HELD_CARTS) {
          return { success: false, error: `Maximum ${MAX_HELD_CARTS} held carts reached` };
        }
        const total = items.reduce((sum, i) => sum + i.total, 0);
        const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
        const heldCart: HeldCart = {
          id: `held_${Date.now()}`,
          label: label || `Cart ${current.length + 1}`,
          heldAt: new Date().toISOString(),
          items,
          itemCount,
          total,
        };
        set({ heldCarts: [...current, heldCart] });
        return { success: true, cart: heldCart };
      },
      recallCart: (cartId) => {
        const current = get().heldCarts;
        const cart = current.find((c) => c.id === cartId);
        if (!cart) return null;
        set({ heldCarts: current.filter((c) => c.id !== cartId) });
        return cart;
      },
      discardHeld: (cartId) => {
        set((s) => ({ heldCarts: s.heldCarts.filter((c) => c.id !== cartId) }));
      },
      loadHeld: () => {
        // No-op — persist middleware handles hydration
      },
    }),
    {
      name: LS_KEYS.LAYOUT,
      partialize: (state) => ({
        layoutPreset: state.layoutPreset,
        favorites: state.favorites,
        heldCarts: state.heldCarts,
        taxExempt: state.taxExempt,
      }),
    }
  )
);
