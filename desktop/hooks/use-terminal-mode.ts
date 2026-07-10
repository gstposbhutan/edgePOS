"use client";

import { useEffect, useState } from "react";

export type TerminalMode = "POS" | "BACK_OFFICE";

interface TerminalApi {
  terminal?: {
    getMode?: () => Promise<string>;
    onMode?: (cb: (m: string) => void) => () => void;
  };
}

/**
 * The terminal's mode, pushed from the Electron main process (from the license .lic payload and
 * refreshed by the sync bootstrap): "POS" rings cash sales; "BACK_OFFICE" is a stock + online-orders
 * terminal that never rings a cash sale. Defaults to POS (older licenses / browser dev, where no
 * Electron bridge exists).
 */
export function useTerminalMode(): TerminalMode {
  const [mode, setMode] = useState<TerminalMode>("POS");

  useEffect(() => {
    let alive = true;
    const api = typeof window !== "undefined"
      ? (window as unknown as { electronAPI?: TerminalApi }).electronAPI
      : undefined;
    const ok = (m: string): m is TerminalMode => m === "POS" || m === "BACK_OFFICE";

    api?.terminal?.getMode?.()
      .then((m) => { if (alive && ok(m)) setMode(m); })
      .catch(() => {});

    const off = api?.terminal?.onMode?.((m) => { if (ok(m)) setMode(m); });
    return () => { alive = false; off?.(); };
  }, []);

  return mode;
}
