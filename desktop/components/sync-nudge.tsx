"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CloudOff } from "lucide-react";

// The terminal is offline-first, NOT offline-only — it should normally be online and syncing.
// If a *provisioned* terminal drifts past this window (outage, or sync stopped), nudge the
// operator so it never quietly runs disconnected. Sync interval defaults to 5 min, so 30 min
// of silence means something's actually wrong, not a brief blip.
const STALE_MS = 30 * 60 * 1000;

function agoLabel(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/**
 * Desktop-only "last synced N ago — Sync now" banner. Renders nothing in a plain browser,
 * on an un-provisioned terminal, or while sync is fresh.
 */
export function SyncNudge() {
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [, setTick] = useState(0); // force re-eval of staleness on an interval
  const [syncing, setSyncing] = useState(false);
  // Why the last attempt failed. main.js has always broadcast this on "sync:status"; the banner
  // read only `lastSync` and dropped it, so a failing sync looked exactly like a button that
  // does nothing.
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: any }).electronAPI;
    if (!api?.sync?.getStatus) return;
    let alive = true;
    const refresh = async () => {
      const s = await api.sync.getStatus().catch(() => null);
      if (!alive || !s) return;
      setLastSyncAt(s.lastSyncAt ?? null);
      setConfigured(!!(s.config?.remoteUrl && s.config?.apiKey));
    };
    refresh();
    const off = api.onSyncStatus?.((d: any) => {
      if (d?.lastSync) { setLastSyncAt(d.lastSync); setSyncError(""); }
      if (d?.status === "error") setSyncError(d.message || "Sync failed.");
      if (d?.status === "syncing") setSyncError("");
    });
    const t = setInterval(() => { setTick((n) => n + 1); refresh(); }, 60000);
    return () => { alive = false; clearInterval(t); if (typeof off === "function") off(); };
  }, []);

  const api = typeof window !== "undefined" ? (window as unknown as { electronAPI?: any }).electronAPI : null;
  if (!api?.sync) return null;    // not the desktop app
  if (!configured) return null;   // terminal isn't pointed at the cloud yet — nothing to nudge
  const stale = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > STALE_MS;
  if (!stale) return null;

  const syncNow = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      await api.sync.forceSync?.();
      const s = await api.sync.getStatus?.().catch(() => null);
      if (s?.lastSyncAt) setLastSyncAt(s.lastSyncAt);
      // A push that neither threw nor moved the clock still failed — say so rather than
      // redrawing the same banner and leaving the cashier to guess.
      else setSyncError((e) => e || "The cloud could not be reached. Sales stay safe on this terminal.");
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="w-full bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center justify-between gap-3 text-sm shrink-0">
      <span className="text-foreground flex flex-col gap-0.5 min-w-0">
        <span className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-warning shrink-0" />
          Not synced to the cloud — last sync <strong>{agoLabel(lastSyncAt)}</strong>. Sales are saved
          locally and will upload once you&apos;re back online.
        </span>
        {syncError && (
          <span className="text-xs text-destructive break-words pl-6" data-testid="sync-error">
            {syncError}
          </span>
        )}
      </span>
      <button
        onClick={syncNow}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60 shrink-0"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
