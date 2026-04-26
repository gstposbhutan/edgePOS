import PocketBase from 'pocketbase';

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';

let pb: PocketBase;

export function getPB(): PocketBase {
  if (typeof window === 'undefined') {
    // Server-side: create a fresh instance (no auth persistence)
    return new PocketBase(PB_URL);
  }
  if (!pb) {
    pb = new PocketBase(PB_URL);
    // Load auth from localStorage on init
    pb.authStore.loadFromCookie(document.cookie);
    // Keep cookie in sync
    pb.authStore.onChange(() => {
      document.cookie = pb.authStore.exportToCookie({ httpOnly: false });
    });
  }
  return pb;
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
}
