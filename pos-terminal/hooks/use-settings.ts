"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";

export interface Settings {
  id: string;
  store_name: string;
  store_address: string;
  tpn_gstin: string;
  phone: string;
  receipt_header: string;
  receipt_footer: string;
  gst_rate: number;
}

async function fetchSettings(): Promise<Settings> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  const records = await pb.collection("settings").getFullList<Settings>({ limit: 1, requestKey: null });
  if (records.length > 0) return records[0];
  const defaultSettings = await pb.collection("settings").create({
    store_name: "My Store",
    store_address: "",
    tpn_gstin: "",
    phone: "",
    receipt_header: "",
    receipt_footer: "Thank you for your business!",
    gst_rate: 5,
  }, PB_REQ);
  return defaultSettings as unknown as Settings;
}

export function useSettings() {
  const pb = getPB();
  const queryClient = useQueryClient();

  const { data: settings = null, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Settings>) => {
      if (!settings) throw new Error("No settings found");
      return pb.collection("settings").update(settings.id, data, PB_REQ) as unknown as Settings;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings"], updated);
    },
  });

  const updateSettings = useCallback(
    async (data: Partial<Settings>) => {
      try {
        const updated = await updateMutation.mutateAsync(data);
        return { success: true, error: null, settings: updated };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [updateMutation]
  );

  return { settings, loading: isLoading, updateSettings, refresh: () => queryClient.invalidateQueries({ queryKey: ["settings"] }) };
}
