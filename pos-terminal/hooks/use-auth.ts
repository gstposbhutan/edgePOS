"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB, getCurrentUser, logout, type PBUser, type UserRole } from "@/lib/pb-client";

export function useAuth() {
  const pb = getPB();
  const [user, setUser] = useState<PBUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    setLoading(false);

    const unsubscribe = pb.authStore.onChange(() => {
      const current = getCurrentUser();
      setUser(current);
      // If auth was cleared on a sub-page, go home (home has inline login)
      if (!current && typeof window !== "undefined") {
        const p = window.location.pathname;
        if (!p.endsWith("/") && !p.endsWith("index.html") && p !== "/" && p !== "") return;
        if (p.includes("/orders") || p.includes("/inventory") ||
            p.includes("/customers") || p.includes("/settings") ||
            p.includes("/adjustments")) {
          window.location.href = "./";
        }
      }
    });

    return () => unsubscribe();
  }, [pb]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const auth = await pb.collection("users").authWithPassword(email, password);
      setUser(auth.record as unknown as PBUser);
      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, [pb]);

  const signOut = useCallback(() => {
    logout();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const isOwner = user?.role === "owner";
  const isManager = user?.role === "manager" || user?.role === "owner";
  const isCashier = user?.role === "cashier" || isManager;

  return {
    user,
    loading,
    login,
    signOut,
    hasRole,
    isOwner,
    isManager,
    isCashier,
    isAuthenticated: !!user,
  };
}
