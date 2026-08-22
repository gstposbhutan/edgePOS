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
  // Letter combos can't be compared literally: Shift makes event.key uppercase ("B" for
  // Ctrl+Shift+B) and Option rewrites it entirely on macOS (Alt+L arrives as "¬"). Match the
  // letter case-insensitively and accept the physical key, which survives both.
  if (combo.key.length === 1) {
    const letter = combo.key.toLowerCase();
    if (event.key.toLowerCase() !== letter && event.code !== `Key${letter.toUpperCase()}`) return false;
  } else if (event.key !== combo.key && event.code !== combo.key) {
    return false;
  }
  if ((combo.ctrl ?? false) !== event.ctrlKey) return false;
  if ((combo.shift ?? false) !== event.shiftKey) return false;
  if ((combo.alt ?? false) !== event.altKey) return false;
  if ((combo.meta ?? false) !== event.metaKey) return false;
  return true;
}

// Keys whose browser default would fight the till when running outside Electron. Consulted
// only after a shortcut has already matched. (Tab is no longer registered, so it navigates
// normally again; fullscreen moved off F11 to Alt+Enter in the Electron main process.)
const PREVENTED_DEFAULTS: Record<string, string> = {
  F1: "Help",
  F5: "Rate change",
  F11: "Day",
  F12: "Location",
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

      // Keys that fire regardless of where focus is. This matters more than it looks: the
      // counter's barcode row holds the caret continuously, so anything gated on "not in an
      // input" would simply never run there — which silently killed every Ctrl/Alt shortcut.
      // A modifier combo is a command, never typing. Ctrl+Alt together is excluded because
      // that is AltGr, which types real characters on several layouts.
      const isModifierCombo =
        (event.ctrlKey || event.metaKey || event.altKey) && !(event.ctrlKey && event.altKey);
      const isGlobalKey =
        event.key.startsWith("F") ||
        event.key === "Escape" ||
        event.key === "Tab" ||
        isModifierCombo;

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
