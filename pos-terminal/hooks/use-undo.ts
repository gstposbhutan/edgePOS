"use client";

import { useState, useCallback, useRef } from "react";
import { MAX_UNDO_STACK } from "@/lib/constants";

export function useUndo() {
  const stackRef = useRef<Array<() => void | Promise<void>>>([]);
  const [, forceRender] = useState(0);

  const push = useCallback((undo: () => void | Promise<void>) => {
    stackRef.current.push(undo);
    if (stackRef.current.length > MAX_UNDO_STACK) {
      stackRef.current.shift();
    }
  }, []);

  const undo = useCallback(async (): Promise<{ ok: boolean }> => {
    const action = stackRef.current.pop();
    if (!action) return { ok: false };
    try {
      await action();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }, []);

  const clear = useCallback(() => {
    stackRef.current = [];
    forceRender((n) => n + 1);
  }, []);

  return { push, undo, clear };
}
