import PocketBase from 'pocketbase';
import { PB_REQ } from './constants';

const DEFAULT_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const AUTH_KEY = 'pb_auth';

let pb: PocketBase | null = null;
let currentUrl: string | null = null;

export function getPB(): PocketBase {
  if (typeof window === 'undefined') {
    // Server-side: create a fresh instance (no auth persistence)
    return new PocketBase(DEFAULT_URL);
  }

  const url = localStorage.getItem('pb_url') || DEFAULT_URL;

  // Re-initialize if URL changed or first time
  if (!pb || currentUrl !== url) {
    pb = new PocketBase(url);
    currentUrl = url;

    // Restore auth from localStorage so navigation between pages doesn't lose it
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.token && data.record) {
          pb.authStore.save(data.token, data.record);
        }
      } catch {
        // ignore corrupt localStorage
      }
    }

    // Validate restored token against server. If the token was issued by a
    // different PocketBase instance (or is otherwise invalid), the authRefresh
    // will fail and the SDK auto-clears the auth store. This prevents 400
    // errors caused by stale/invalid tokens that pass client-side `isValid`.
    if (pb.authStore.isValid) {
      pb.collection('users').authRefresh().catch(() => {
        // Token invalid — SDK already cleared authStore via its internal
        // error handler. We also clean localStorage for good measure.
        localStorage.removeItem(AUTH_KEY);
      });
    }

    // Persist auth changes back to localStorage
    pb.authStore.onChange((token, record) => {
      if (token) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ token, record }));
      } else {
        localStorage.removeItem(AUTH_KEY);
        // Auth cleared — React will re-render and show login form inline.
        // No redirect needed (avoids file:// protocol issues).
      }
    });
  }

  return pb;
}

export function setPBUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('pb_url', url);
  // Force re-initialization on next getPB() call
  pb = null;
  currentUrl = null;
}

export function getPBUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_URL;
  return localStorage.getItem('pb_url') || DEFAULT_URL;
}

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface PBUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export function getCurrentUser(): PBUser | null {
  const pb = getPB();
  if (!pb.authStore.isValid) return null;
  return pb.authStore.record as unknown as PBUser;
}

export function isAuthenticated(): boolean {
  return getPB().authStore.isValid;
}

export function logout() {
  getPB().authStore.clear();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_KEY);
  }
}

const TERMINAL_KEY = 'pb_terminal_id';

/**
 * Stable per-terminal id (6 hex chars), generated once and persisted in
 * localStorage. Used to namespace offline order numbers so two terminals can
 * never mint the same order_no (P1-2).
 */
export function getTerminalId(): string {
  if (typeof window === 'undefined') return 'SRV';
  let id = localStorage.getItem(TERMINAL_KEY);
  if (!id) {
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    localStorage.setItem(TERMINAL_KEY, id);
  }
  return id;
}

export { PB_REQ };
