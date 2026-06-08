// Per-terminal label settings, persisted in localStorage. Label size / symbology depend on
// the physical label printer attached to THIS terminal, so this is per-terminal config (like
// the PB server URL / sync config) — not synced store settings.
import { DEFAULT_LABEL_CONFIG } from "./labels";
import type { LabelConfig } from "./labels";

const KEY = "nexus.labelConfig";

/** Merge a partial stored config over the defaults (tolerant of older/partial saves). */
export function mergeLabelConfig(partial: Partial<LabelConfig> | null | undefined): LabelConfig {
  return { ...DEFAULT_LABEL_CONFIG, ...(partial || {}) };
}

export function loadLabelConfig(): LabelConfig {
  if (typeof window === "undefined") return DEFAULT_LABEL_CONFIG;
  try {
    const raw = window.localStorage.getItem(KEY);
    return mergeLabelConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_LABEL_CONFIG;
  }
}

export function saveLabelConfig(cfg: LabelConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable — non-fatal */
  }
}
