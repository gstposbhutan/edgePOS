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
      if (!current && typeof window !== "undefined") {
        const p = window.location.pathname;
        if (p !== "/" && !p.endsWith("/index.html") && p !== "") {
          window.location.href = "/";
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

  // Atomic cashier handover: authWithPassword either swaps the authStore wholesale
  // (new cashier active) or leaves it untouched on a wrong password — so a failed
  // handover keeps the current cashier logged in, exactly as required.
  const switchUser = useCallback(async (email: string, password: string) => {
    try {
      const auth = await pb.collection("users").authWithPassword(email, password);
      setUser(auth.record as unknown as PBUser);
      return { success: true, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      return { success: false, error: msg };
    }
  }, [pb]);

  const signOut = useCallback(() => {
    logout();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      if (!user) return false;
      if (user.role === "super_admin") return true; // internal staff: access everything
      return roles.includes(user.role);
    },
    [user]
  );

  // super_admin (internal support) sits above owner and satisfies every role check.
  const isSuperAdmin = user?.role === "super_admin";
  const isOwner = user?.role === "owner" || isSuperAdmin;
  const isManager = user?.role === "manager" || isOwner;
  const isCashier = user?.role === "cashier" || isManager;

  return {
    user,
    loading,
    login,
    switchUser,
    signOut,
    hasRole,
    isSuperAdmin,
    isOwner,
    isManager,
    isCashier,
    isAuthenticated: !!user,
  };
}
