"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { UserRole } from "@/lib/pb-client";

/**
 * Page-level role guard (P2-1). If the signed-in user's role isn't in `roles`,
 * redirect to the POS home. This is a UX / defense-in-depth layer ON TOP OF the
 * PocketBase access rules (the authoritative enforcement, set in setup-pb.js).
 *
 * Pass a stable (module-level or `as const`) array to avoid effect churn.
 */
export function useRequireRole(roles: readonly UserRole[]): void {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return; // unauthenticated is handled by the inline login flow
    if (!roles.includes(user.role)) {
      toast.error("You don't have access to that page");
      router.replace("/");
    }
  }, [loading, user, router, roles]);
}
