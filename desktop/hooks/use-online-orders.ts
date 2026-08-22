"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPB } from "@/lib/pb-client";

export interface OnlineOrder {
  id: string;               // local PB record id
  cloud_id: string;         // cloud order id (used for actions)
  order_no: string;
  status: string;
  dispatch_state: string;   // ASSIGNED | SEARCHING | UNDELIVERABLE | ""
  fulfilment_mode: string;  // DELIVERY | PICKUP
  grand_total: number;
  gst_total: number;
  subtotal: number;
  items: { name?: string; quantity?: number; total?: number }[];
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  delivery_address: string;
  delivery_lat?: number;
  delivery_lng?: number;
  pickup_otp: string;       // shared with the rider at collection
  rider_name: string;
  created_at_cloud: string;
}

async function fetchOnlineOrders(): Promise<OnlineOrder[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) return [];
  return pb.collection("online_orders").getFullList<OnlineOrder>({
    sort: "-created_at_cloud",
    requestKey: null,
  });
}

function api() {
  return (typeof window !== "undefined" && (window as unknown as { electronAPI?: any }).electronAPI) || null;
}

export function useOnlineOrders() {
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["online_orders"],
    queryFn: fetchOnlineOrders,
    staleTime: 15 * 1000,
  });

  // Refetch when the main process reports a poll change, or on local PB realtime.
  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: ["online_orders"] });
    const offChanged = api()?.onlineOrders?.onChanged?.(invalidate);
    let unsub: (() => void) | undefined;
    getPB()
      .collection("online_orders")
      .subscribe("*", invalidate)
      .then((u) => { unsub = u as unknown as () => void; })
      .catch(() => {});
    return () => { offChanged?.(); if (unsub) unsub(); };
  }, [qc]);

  const refresh = useCallback(async () => {
    await api()?.onlineOrders?.refresh?.();
    qc.invalidateQueries({ queryKey: ["online_orders"] });
  }, [qc]);

  // action on the CLOUD order (confirm / cancel) via the main process; cloudId is order.cloud_id.
  const act = useCallback(
    async (cloudId: string, action: "confirm" | "cancel", reason?: string) => {
      const a = api();
      if (!a?.onlineOrders?.action) return { ok: false, error: "Available on the terminal only" };
      const res = await a.onlineOrders.action(cloudId, action, reason);
      qc.invalidateQueries({ queryKey: ["online_orders"] });
      return res as { ok: boolean; error?: string; status?: string };
    },
    [qc]
  );

  return { orders, loading: isLoading, refresh, act };
}
