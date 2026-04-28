const LOCALE = "en-IN";

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function todayCompact(): string {
  return todayISO().replace(/-/g, "");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * PocketBase date format: "YYYY-MM-DD HH:mm:ss.SSSZ"
 * Space-separated, not ISO 8601 T-separated.
 * @see https://pocketbase.io/docs/api-records
 */
export function pbNow(): string {
  return new Date().toISOString().replace("T", " ");
}

export function pbDate(d: Date | string | number): string {
  return new Date(d).toISOString().replace("T", " ");
}
