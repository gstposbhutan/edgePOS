"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB, getCurrentUser, logout, type PBUser, type UserRole } from "@/lib/pb-client";

export function useAuth() {
  const pb = getPB();
  const [user, setUser] = useState<PBUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser();
    console.log("[useAuth] init getCurrentUser:", u ? u.email : "null", "isValid:", pb.authStore.isValid);
    setUser(u);
    setLoading(false);

    const unsubscribe = pb.authStore.onChange(() => {
      const next = getCurrentUser();
      console.log("[useAuth] onChange:", next ? next.email : "null");
      setUser(next);
    });

    return () => unsubscribe();
  }, [pb]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log("[useAuth] login start", email);
      const auth = await pb.collection("users").authWithPassword(email, password);
      console.log("[useAuth] login success", auth.record?.email, "token valid:", pb.authStore.isValid);
      setUser(auth.record as unknown as PBUser);
      return { success: true, error: null };
    } catch (err: any) {
      console.error("[useAuth] login error:", err.message);
      return { success: false, error: err.message || "Login failed" };
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
