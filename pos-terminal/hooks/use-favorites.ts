"use client";

import { useState, useCallback, useEffect } from "react";

const FAVORITES_KEY = "nexus_pos_favorites";

export function useFavorites(userId?: string) {
  const key = userId ? `${FAVORITES_KEY}_${userId}` : FAVORITES_KEY;
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch {
      // Silent fail
    }
  }, [key]);

  const persist = useCallback(
    (updated: string[]) => {
      setFavorites(updated);
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // Silent fail
      }
    },
    [key]
  );

  const toggleFavorite = useCallback(
    (productId: string) => {
      setFavorites((prev) => {
        const next = prev.includes(productId)
          ? prev.filter((id) => id !== productId)
          : [productId, ...prev];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isFavorite = useCallback(
    (productId: string) => favorites.includes(productId),
    [favorites]
  );

  const clearFavorites = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    clearFavorites,
  };
}
