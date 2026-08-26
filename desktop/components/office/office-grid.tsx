"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/office-menu";

export interface OfficeColumn<Row = Record<string, unknown>> {
  key: string;
  label: string;
  width?: number | string;
  align?: "left" | "right" | "center";
  render?: (value: unknown, row: Row) => ReactNode;
}

/**
 * The back-office register on the terminal (spec WF-09) — a ledger, read as a ledger.
 *
 * The mirror of web/components/pos/office/office-grid.jsx. What makes a report recognisable is
 * DENSITY and reading order: many rows at once, banded so the eye tracks across, numerics
 * right-aligned so magnitudes line up, totals under the column they total. ↑↓ move a real cursor,
 * because a cashier's hand is on the keys, not the mouse.
 */
export function OfficeGrid<Row extends { id?: string | number }>({
  columns = [],
  rows = [],
  totals,
  onOpen,
  openOnClick = false,
  empty = "Nothing to show.",
  stretch = true,
  className = "",
}: {
  columns: OfficeColumn<Row>[];
  rows: Row[];
  totals?: Record<string, ReactNode>;
  onOpen?: (row: Row, index: number) => void;
  openOnClick?: boolean;
  empty?: string;
  stretch?: boolean;
  className?: string;
}) {
  const [cursor, setCursor] = useState(-1);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    setCursor((c) => (c >= rows.length ? rows.length - 1 : c));
  }, [rows.length]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!rows.length) return;
      if (e.key === "ArrowDown")      { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Home")      { e.preventDefault(); setCursor(0); }
      else if (e.key === "End")       { e.preventDefault(); setCursor(rows.length - 1); }
      else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); onOpen?.(rows[cursor], cursor); }
    },
    [rows, cursor, onOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    if (cursor < 0) return;
    bodyRef.current?.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const cell = (col: OfficeColumn<Row>) => ({
    textAlign: col.align ?? "left",
    borderColor: "var(--office-line)",
    fontVariantNumeric: col.align === "right" ? ("tabular-nums" as const) : undefined,
  });

  return (
    <div
      className={`overflow-auto border ${className}`}
      style={{ background: "var(--office-panel-bg)", borderColor: "var(--office-line)" }}
      data-testid="office-grid"
    >
      <table className={`border-collapse text-[11px] ${stretch ? "w-full" : "w-auto"}`}>
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-2 py-1 font-bold whitespace-nowrap border"
                style={{
                  width: col.width,
                  textAlign: col.align ?? "left",
                  background: "var(--office-grid-head-bg)",
                  color: "var(--office-grid-head-fg)",
                  borderColor: "var(--office-line)",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center opacity-60">{empty}</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const on = i === cursor;
            return (
              <tr
                key={row.id ?? i}
                data-row={i}
                onClick={() => { setCursor(i); if (openOnClick) onOpen?.(row, i); }}
                onDoubleClick={() => onOpen?.(row, i)}
                className="cursor-pointer"
                style={{
                  background: on ? "var(--office-row-sel-bg)" : i % 2 ? "var(--office-row-b)" : "var(--office-row-a)",
                  color: on ? "var(--office-row-sel-fg)" : undefined,
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-2 py-1 border whitespace-nowrap" style={cell(col)}>
                    {col.render
                      ? col.render((row as Record<string, unknown>)[col.key], row)
                      : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {totals && (
          <tfoot className="sticky bottom-0">
            <tr style={{ background: "var(--office-total-bg)" }}>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-1 font-bold border" style={cell(col)}>
                  {totals[col.key] ?? ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
