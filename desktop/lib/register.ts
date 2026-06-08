"use client";

import { getPB, getTerminalId, PB_REQ } from "./pb-client";

const REGISTER_KEY = "pb_register_id";
let cachedRegisterId: string | null = null;
let inflight: Promise<string | null> | null = null;

interface ElectronSystemApi {
  system?: { getMachineId?: () => Promise<string> };
}

/**
 * Stable hardware identifier for this terminal. Prefers the MAC-derived id from
 * the Electron main process (window.electronAPI.system.getMachineId); falls back
 * to the persisted device code in the browser/dev (where no Electron bridge exists).
 */
async function getMachineId(): Promise<string> {
  if (typeof window !== "undefined") {
    const api = (window as unknown as { electronAPI?: ElectronSystemApi }).electronAPI;
    if (api?.system?.getMachineId) {
      try {
        const id = await api.system.getMachineId();
        if (id) return String(id);
      } catch {
        // fall through to dev fallback
      }
    }
  }
  return `dev-${getTerminalId()}`;
}

/**
 * Resolve this terminal's register (cash_registers row), creating it on first run.
 * The register is keyed by machine_id (MAC) and looked up by it thereafter, so it
 * survives localStorage clears / reinstalls. Returns the register record id (or
 * null if unauthenticated / creation failed). Result is cached for the session.
 */
export async function getRegisterId(): Promise<string | null> {
  if (cachedRegisterId) return cachedRegisterId;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(REGISTER_KEY);
    if (stored) {
      cachedRegisterId = stored;
      return stored;
    }
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const pb = getPB();
    if (!pb.authStore.isValid) return null; // need auth to query/create
    const machineId = await getMachineId();

    let registerId: string | null = null;
    try {
      const existing = await pb
        .collection("cash_registers")
        .getFirstListItem<{ id: string }>(`machine_id = "${machineId}"`, { requestKey: null });
      registerId = existing.id;
    } catch {
      // none yet — create this terminal's register
      try {
        const created = await pb.collection("cash_registers").create(
          {
            machine_id: machineId,
            name: `Register ${getTerminalId()}`,
            default_opening_float: 0,
            is_active: true,
            created_by: pb.authStore.record?.id ?? null,
          },
          PB_REQ
        );
        registerId = (created as unknown as { id: string }).id;
      } catch {
        registerId = null;
      }
    }

    if (registerId && typeof window !== "undefined") {
      localStorage.setItem(REGISTER_KEY, registerId);
    }
    cachedRegisterId = registerId;
    inflight = null;
    return registerId;
  })();

  return inflight;
}

/** Best-effort synchronous accessor — returns the cached register id, or null if
 * it hasn't been resolved yet (call getRegisterId() to resolve/create). */
export function getRegisterIdSync(): string | null {
  if (cachedRegisterId) return cachedRegisterId;
  if (typeof window !== "undefined") return localStorage.getItem(REGISTER_KEY);
  return null;
}
