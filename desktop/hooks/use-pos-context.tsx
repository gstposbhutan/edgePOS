"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useProducts } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useLayoutPreset } from "@/hooks/use-layout-preset";
import { useCustomers } from "@/hooks/use-customers";
import type { LayoutPreset } from "@/lib/constants";

interface PosContextValue {
  products: ReturnType<typeof useProducts>;
  cart: ReturnType<typeof useCart>;
  favorites: ReturnType<typeof useFavorites>;
  layoutPreset: LayoutPreset;
  setLayout: (value: LayoutPreset) => void;
  customers: ReturnType<typeof useCustomers>;
}

const PosContext = createContext<PosContextValue | null>(null);

export function usePos(): PosContextValue | null {
  return useContext(PosContext);
}

export function PosProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const products = useProducts();
  const cart = useCart();
  const favorites = useFavorites(userId);
  const { layoutPreset, setLayout } = useLayoutPreset();
  const customers = useCustomers();

  return (
    <PosContext.Provider value={{ products, cart, favorites, layoutPreset, setLayout, customers }}>
      {children}
    </PosContext.Provider>
  );
}
