"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardRegistry } from "@/hooks/use-keyboard-registry";
import { triggerShortcut } from "@/lib/key-events";
import { OFFICE_KEY_BAR, OfficeKey } from "@/lib/office-keys";

/**
 * The back-office frame on the terminal (spec WF-08/WF-09).
 *
 * The mirror of web/components/pos/office/office-shell.jsx, with one structural difference: the
 * Office LETTER strip is already mounted globally here by OfficeChrome, so this supplies only the
 * band and the key rail and lets the strip stay where it is.
 *
 * Keys go through use-keyboard-registry rather than a listener of their own — that hook already
 * owns layering (a modal outranks a screen), the macOS Option-glyph problem and the
 * prevent-default list. Tapping a rail button re-dispatches the keystroke it names, so the tap
 * and the key run the exact same handler and can never drift apart.
 */
export function OfficeShell({
  title,
  crumb,
  keys = [],
  date,
  escToCounter = true,
  children,
}: {
  title: string;
  crumb?: string;
  keys?: OfficeKey[];
  date?: string;
  escToCounter?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { registerShortcut } = useKeyboardRegistry();

  const rail: OfficeKey[] = keys.length ? keys : OFFICE_KEY_BAR;

  // Esc is the one key every office screen owes. Registered on the `global` layer so a modal on
  // top of the screen keeps it for itself.
  useEffect(() => {
    if (!escToCounter) return;
    return registerShortcut("global", { key: "Escape" }, () => router.push("/"));
  }, [escToCounter, registerShortcut, router]);

  // Every rail entry that has a handler answers its key.
  useEffect(() => {
    const offs = rail
      .filter((entry) => entry.onClick && !entry.todo && entry.key !== "Esc")
      .map((entry) => {
        const combo = comboFor(entry.key);
        return combo ? registerShortcut("global", combo, () => entry.onClick?.()) : undefined;
      })
      .filter(Boolean) as Array<() => void>;
    return () => offs.forEach((off) => off());
  });

  const stamp =
    date ??
    new Date()
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .replace(/ /g, "-");

  return (
    // flex-1, NOT min-h-screen: OfficeChrome renders the letter strip above this in the root
    // layout, so a full-viewport shell adds up to more than the viewport and pushes the key rail
    // below the fold — where a rail may as well not exist.
    <div className="office-ui flex flex-col flex-1 min-h-0" style={{ background: "var(--office-page-bg)" }}>
      <div
        className="flex items-center justify-between px-4 py-1.5 text-[13px] shrink-0"
        style={{ background: "var(--office-title-bg)", color: "var(--office-title-fg)" }}
        data-testid="office-band"
      >
        <h1 className="font-bold truncate text-[13px] m-0">
          {crumb ? <span className="font-normal opacity-80">{crumb} &rsaquo; </span> : null}
          {title}
        </h1>
        <span className="tabular-nums whitespace-nowrap pl-3">{stamp}</span>
      </div>

      <main className="flex-1 min-h-0 overflow-auto p-3">{children}</main>

      <OfficeKeyRail keys={rail} />
    </div>
  );
}

/** A printed key label as a combo the registry understands. */
function comboFor(label: string): { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean } | null {
  const parts = label.split("+");
  let base = parts.pop() ?? "";
  const glued = /^[⇧]/.test(base);
  if (glued) base = base.slice(1);
  const combo = {
    ctrl: parts.some((p) => /^(ctrl|control)$/i.test(p)),
    alt: parts.some((p) => /^alt$/i.test(p)),
    shift: glued || parts.some((p) => /^shift$/i.test(p)),
  };
  if (base === "Esc") return { key: "Escape", ...combo };
  if (/^F\d{1,2}$/i.test(base)) return { key: base.toUpperCase(), ...combo };
  if (base.length === 1) return { key: base.toLowerCase(), ...combo };
  return null;
}

/**
 * The rail: one fixed row of equal cells along the bottom edge, never wrapping or scrolling.
 * That fixedness is the point — a cashier learns where a key SITS and reaches for the position.
 */
export function OfficeKeyRail({ keys = [] }: { keys?: OfficeKey[] }) {
  return (
    <div
      className="flex items-stretch gap-px p-1 shrink-0 overflow-hidden border-t"
      style={{ borderColor: "var(--office-line)" }}
      data-testid="office-rail"
    >
      {keys.map(({ key, label, onClick, todo }) => (
        <button
          key={`${key}-${label}`}
          type="button"
          // Fire the KEY, not the handler: the registry answers both the same way.
          onClick={todo ? undefined : () => triggerShortcut(key)}
          aria-disabled={todo || !onClick ? "true" : undefined}
          title={todo ? `${label} — not built yet` : `${key} — ${label}`}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] leading-none whitespace-nowrap ${
            todo ? "opacity-45 cursor-default" : onClick ? "cursor-pointer hover:brightness-125" : "cursor-default"
          }`}
          style={{ background: "var(--office-key-bg)", color: "var(--office-key-fg)" }}
        >
          <span className="font-bold shrink-0">{key}</span>
          <span className="opacity-90 truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
