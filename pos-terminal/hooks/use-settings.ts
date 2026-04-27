"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

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

export function useSettings() {
  const pb = getPB();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    try {
      const records = await pb.collection("settings").getFullList<Settings>({ limit: 1, requestKey: null });
      if (records.length > 0) {
        setSettings(records[0]);
      } else {
        // Create default settings
        const defaultSettings = await pb.collection("settings").create({
          store_name: "My Store",
          store_address: "",
          tpn_gstin: "",
          phone: "",
          receipt_header: "",
          receipt_footer: "Thank you for your business!",
          gst_rate: 5,
        });
        setSettings(defaultSettings as unknown as Settings);
      }
    } catch (err) {
      console.error("Settings fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    fetchSettings();

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchSettings();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchSettings, pb]);

  const updateSettings = useCallback(
    async (data: Partial<Settings>) => {
      if (!settings) return { success: false, error: "No settings found" };
      try {
        const updated = await pb.collection("settings").update(settings.id, data);
        setSettings(updated as unknown as Settings);
        return { success: true, error: null };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, settings]
  );

  return { settings, loading, updateSettings, refresh: fetchSettings };
}
