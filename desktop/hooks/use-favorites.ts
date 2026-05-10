"use client";

import { usePosStore } from "@/stores/pos-store";

export function useFavorites(userId?: string) {
  const favorites = usePosStore((s) => s.favorites[userId || "default"] || []);
  const toggleFavorite = usePosStore((s) => s.toggleFavorite);
  const isFavorite = usePosStore((s) => s.isFavorite);
  const clearFavorites = usePosStore((s) => s.clearFavorites);

  return {
    favorites,
    toggleFavorite: (productId: string) => toggleFavorite(userId, productId),
    isFavorite: (productId: string) => isFavorite(userId, productId),
    clearFavorites: () => clearFavorites(userId),
  };
}
