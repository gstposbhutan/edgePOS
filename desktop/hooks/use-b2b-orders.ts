"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPB } from "@/lib/pb-client";

export interface B2bOrder {
  id: string;           // local PB record id
  cloud_id: string;     // cloud order id (used for actions)
  order_no: string;
  status: string;
  payment_method: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_tpn: string;
  subtotal: number;
  gst_total: number;
  grand_total: number;
  items: { name?: string; sku?: string; quantity?: number; unit_price?: number; total?: number }[];
  created_at_cloud: string;
}

async function fetchB2bOrders(): Promise<B2bOrder[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) return [];
  return pb.collection("b2b_orders").getFullList<B2bOrder>({ sort: "-created_at_cloud", requestKey: null });
}

function api() {
  return (typeof window !== "undefined" && (window as unknown as { electronAPI?: any }).electronAPI) || null;
}

export function useB2bOrders() {
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["b2b_orders"],
    queryFn: fetchB2bOrders,
    staleTime: 15 * 1000,
  });

  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: ["b2b_orders"] });
    const offChanged = api()?.b2bOrders?.onChanged?.(invalidate);
    let unsub: (() => void) | undefined;
    getPB()
      .collection("b2b_orders")
      .subscribe("*", invalidate)
      .then((u) => { unsub = u as unknown as () => void; })
      .catch(() => {});
    return () => { offChanged?.(); if (unsub) unsub(); };
  }, [qc]);

  const refresh = useCallback(async () => {
    await api()?.b2bOrders?.refresh?.();
    qc.invalidateQueries({ queryKey: ["b2b_orders"] });
  }, [qc]);

  // Advance/cancel the CLOUD order via the main process; `status` is the target state.
  const act = useCallback(
    async (cloudId: string, status: string, reason?: string) => {
      const a = api();
      if (!a?.b2bOrders?.action) return { ok: false, error: "Available on the terminal only" };
      const res = await a.b2bOrders.action(cloudId, status, reason);
      qc.invalidateQueries({ queryKey: ["b2b_orders"] });
      return res as { ok: boolean; error?: string; status?: string };
    },
    [qc]
  );

  return { orders, loading: isLoading, refresh, act };
}
