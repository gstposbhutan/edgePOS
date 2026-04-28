"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";

export interface CashAdjustment {
  id: string;
  amount: number;
  type: "CASH_IN" | "CASH_OUT";
  reason: string;
  notes?: string;
  shift: string;
  created_by: string;
  created_at: string;
}

async function fetchAdjustments(shiftId?: string): Promise<CashAdjustment[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  let filter = "";
  if (shiftId) {
    filter = `shift = "${shiftId}"`;
  }
  return pb.collection("cash_adjustments").getFullList<CashAdjustment>({
    sort: "-created_at",
    filter: filter || undefined,
    requestKey: null,
  });
}

export function useCashAdjustments(shiftId?: string) {
  const pb = getPB();
  const queryClient = useQueryClient();

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ["cash-adjustments", shiftId],
    queryFn: () => fetchAdjustments(shiftId),
    enabled: !!shiftId || shiftId === undefined,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      amount: number;
      type: "CASH_IN" | "CASH_OUT";
      reason: string;
      notes?: string;
      shift: string;
      created_by: string;
    }) => {
      return pb.collection("cash_adjustments").create({
        amount: Math.abs(data.amount),
        type: data.type,
        reason: data.reason,
        notes: data.notes || "",
        shift: data.shift,
        created_by: data.created_by,
      }, PB_REQ) as unknown as CashAdjustment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-adjustments"] });
    },
  });

  const addAdjustment = useCallback(
    async (data: {
      amount: number;
      type: "CASH_IN" | "CASH_OUT";
      reason: string;
      notes?: string;
      shift: string;
      created_by: string;
    }) => {
      try {
        const record = await createMutation.mutateAsync(data);
        return { success: true, record };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to record adjustment";
        return { success: false, error: msg };
      }
    },
    [createMutation]
  );

  const cashIns = adjustments.filter((a) => a.type === "CASH_IN");
  const cashOuts = adjustments.filter((a) => a.type === "CASH_OUT");
  const totalCashIn = cashIns.reduce((sum, a) => sum + a.amount, 0);
  const totalCashOut = cashOuts.reduce((sum, a) => sum + a.amount, 0);
  const netAdjustment = totalCashIn - totalCashOut;

  return {
    adjustments,
    loading: isLoading,
    addAdjustment,
    cashIns,
    cashOuts,
    totalCashIn,
    totalCashOut,
    netAdjustment,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["cash-adjustments"] }),
  };
}
