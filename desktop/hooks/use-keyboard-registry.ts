"use client";

import { useEffect, useCallback, useRef } from "react";
import { usePlatform } from "./use-platform";

export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export type ShortcutLayer = "modal" | "cart" | "global";

interface RegisteredShortcut {
  layer: ShortcutLayer;
  combo: KeyCombo;
  handler: (event: KeyboardEvent) => void;
}

function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  if (event.key !== combo.key && event.code !== combo.key) return false;
  if ((combo.ctrl ?? false) !== event.ctrlKey) return false;
  if ((combo.shift ?? false) !== event.shiftKey) return false;
  if ((combo.alt ?? false) !== event.altKey) return false;
  if ((combo.meta ?? false) !== event.metaKey) return false;
  return true;
}

const PREVENTED_DEFAULTS: Record<string, string> = {
  F1: "Help overlay",
  F5: "Payment trigger",
  F11: "Fullscreen toggle",
  F12: "Lock terminal",
  Tab: "Panel switch",
};

export function useKeyboardRegistry() {
  const { isElectron } = usePlatform();
  const shortcutsRef = useRef<RegisteredShortcut[]>([]);

  const registerShortcut = useCallback(
    (layer: ShortcutLayer, combo: KeyCombo, handler: (event: KeyboardEvent) => void) => {
      const entry: RegisteredShortcut = { layer, combo, handler };
      shortcutsRef.current.push(entry);
      return () => {
        shortcutsRef.current = shortcutsRef.current.filter((s) => s !== entry);
      };
    },
    []
  );

  useEffect(() => {
    if (!isElectron && typeof window !== "undefined" && window.navigator.maxTouchPoints > 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Global F-keys and Escape always fire regardless of focus
      const isGlobalKey =
        event.key.startsWith("F") ||
        event.key === "Escape" ||
        event.key === "Tab" ||
        (event.key === "z" && event.ctrlKey);

      if (isInput && !isGlobalKey) return;

      const layers: ShortcutLayer[] = ["modal", "cart", "global"];
      const shortcuts = shortcutsRef.current;

      for (const layer of layers) {
        for (const s of shortcuts) {
          if (s.layer === layer && matchesCombo(event, s.combo)) {
            if (PREVENTED_DEFAULTS[event.key] || (event.key === "z" && event.ctrlKey)) {
              event.preventDefault();
              event.stopPropagation();
            }
            s.handler(event);
            return;
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isElectron]);

  return { registerShortcut };
}
