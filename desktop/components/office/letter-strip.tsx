"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { OFFICE_MODULES, activeModule, isTypingTarget, type OfficeEntry } from "@/lib/office-menu";

/**
 * The Office letter strip (spec WF-08/WF-09) — the same navigation shops already have in
 * RanceLab: a row of single letters across the top, and a second row for the module you are in.
 *
 * The strip is also the key binding. Letters fire only when focus is not in a field, which is
 * the spec's own rule and what keeps them from stealing characters out of a search box.
 */
export function LetterStrip() {
  const router = useRouter();
  const pathname = usePathname();
  const current = activeModule(pathname);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;      // leave the counter's combos alone
      if (isTypingTarget(e.target)) return;                 // spec: not while typing
      if (e.key.length !== 1) return;
      const letter = e.key.toUpperCase();

      // The module's own second row wins: inside Warehouse, D is Discrepancy, not a top-level
      // module. That mirrors RanceLab, where the nested letters take precedence.
      const hit =
        current?.children?.find((c) => c.letter === letter) ??
        OFFICE_MODULES.find((m) => m.letter === letter);
      if (!hit) return;

      e.preventDefault();
      go(hit);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  function go(entry: OfficeEntry) {
    if (entry.todo || !entry.href) {
      toast(`${entry.letter} ${entry.label} — not on the terminal`);
      return;
    }
    router.push(entry.href);
  }

  return (
    <nav className="shrink-0 border-b border-border" aria-label="Office modules">
      <Row entries={OFFICE_MODULES} activeLetter={current?.letter} onGo={go} />
      {current?.children && (
        <Row entries={current.children} nested onGo={go} />
      )}
    </nav>
  );
}

function Row({
  entries, nested = false, activeLetter, onGo,
}: {
  entries: OfficeEntry[];
  nested?: boolean;
  activeLetter?: string;
  onGo: (entry: OfficeEntry) => void;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1 px-3 py-1.5 ${nested ? "bg-muted/40" : "bg-background"}`}>
      {!nested && (
        <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Keys</span>
      )}
      {entries.map((entry) => (
        <button
          key={entry.letter + entry.label}
          type="button"
          onClick={() => onGo(entry)}
          title={`${entry.letter} — ${entry.label}`}
          className={`inline-flex items-center gap-2 min-h-[32px] px-2 text-xs rounded transition
            ${entry.todo ? "opacity-40" : "hover:bg-accent"}
            ${!nested && entry.letter === activeLetter ? "text-primary font-medium" : ""}`}
        >
          <span className={`inline-flex h-6 w-6 items-center justify-center border border-border text-xs font-semibold
            ${nested ? "bg-background" : "bg-muted"}`}>
            {entry.letter}
          </span>
          <span className="whitespace-nowrap">{entry.label}</span>
        </button>
      ))}
    </div>
  );
}
