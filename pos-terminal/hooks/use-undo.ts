"use client";

import { usePosStore } from "@/stores/pos-store";

export function useUndo() {
  const push = usePosStore((s) => s.pushUndo);
  const undo = usePosStore((s) => s.undoAction);
  const clear = usePosStore((s) => s.clearUndoStack);

  return { push, undo, clear };
}
