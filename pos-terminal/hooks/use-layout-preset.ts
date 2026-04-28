"use client";

import { usePosStore } from "@/stores/pos-store";

export function useLayoutPreset() {
  const layoutPreset = usePosStore((s) => s.layoutPreset);
  const setLayout = usePosStore((s) => s.setLayout);

  return { layoutPreset, setLayout };
}
