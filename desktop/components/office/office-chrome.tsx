"use client";

import { usePathname } from "next/navigation";
import { normalizePath } from "@/lib/office-menu";
import { LetterStrip } from "./letter-strip";

// Screens that are not Office: the counter is the ticket itself, and login has no navigation.
const NOT_OFFICE = ["/", "/login"];

/**
 * Puts the Office letter strip on every back-office screen and nowhere else (spec WF-08: "letter
 * strip stays on every Office screen"). Mounted from the root layout so a new back-office route
 * gets it without being wired up individually — and so its key bindings are never live on the
 * counter, where single letters belong to the barcode row.
 */
export function OfficeChrome() {
  const pathname = usePathname();
  if (NOT_OFFICE.includes(normalizePath(pathname))) return null;
  return <LetterStrip />;
}
