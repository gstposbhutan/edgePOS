"use client";

import { useState, useCallback, useEffect } from "react";
import { LAYOUT_PRESETS, LS_KEYS, type LayoutPreset } from "@/lib/constants";

export function useLayoutPreset() {
  const [preset, setPreset] = useState<LayoutPreset>(LAYOUT_PRESETS.STANDARD);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEYS.LAYOUT);
      if (stored && Object.values(LAYOUT_PRESETS).includes(stored as LayoutPreset)) {
        setPreset(stored as LayoutPreset);
      }
    } catch { /* ignore */ }
  }, []);

  const setLayout = useCallback((value: LayoutPreset) => {
    setPreset(value);
    try { localStorage.setItem(LS_KEYS.LAYOUT, value); } catch { /* ignore */ }
  }, []);

  return { layoutPreset: preset, setLayout };
}
