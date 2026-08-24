"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The back-office grid (spec WF-09) — a register, read the way a ledger is read.
 *
 * What makes a report recognisable to a shop arriving from the incumbent ERP is not colour, it
 * is DENSITY and the reading order: many rows visible at once, banded so the eye tracks across,
 * numerics right-aligned so magnitudes line up, and the totals sitting under the column they
 * total. A card list of the same data reads as a different product even when the numbers match.
 *
 * Keyboard first: ↑↓ move the selection, Home/End jump the ends, Enter opens the row. The
 * selection is a real cursor rather than a hover, because a cashier's hand is on the keys.
 *
 * @param {Array}  columns  { key, label, width?, align?, render?(value, row) }
 * @param {Array}  rows     Data. `id` is used for the React key when present.
 * @param {object} [totals] Keyed by column key — printed in the footer band.
 * @param {func}   [onOpen] (row, index) — Enter, or a double click.
 * @param {string} [empty]  What to say when there are no rows.
 * @param {func}   [rowAttrs] (row, index) => object — extra attributes on the <tr>. Screens use
 *                 it to keep the hooks their e2e specs already select on.
 * @param {boolean} [openOnClick=false] Open on a single click as well as Enter. A register
 *                  normally selects on click and opens on Enter, but a list whose whole purpose
 *                  is drill-down (accounts, vouchers, products) opened on one click before the
 *                  reskin and people rely on that — those screens set this.
 * @param {boolean} [stretch=false] Fill the page width. Off by default: a register sizes to its
 *                 columns and leaves the rest of the page empty, so a five-column report does
 *                 not stretch five columns across a wide screen and lose the ledger's shape.
 */
export function OfficeGrid({ columns = [], rows = [], totals, onOpen, empty = 'Nothing to show.', rowAttrs, openOnClick = false, stretch = false, className = '' }) {
  const [cursor, setCursor] = useState(-1)
  const bodyRef = useRef(null)

  // The cursor is only meaningful while there are rows under it; a refetch that empties the
  // grid must not leave a selection pointing past the end.
  useEffect(() => { setCursor(c => (c >= rows.length ? rows.length - 1 : c)) }, [rows.length])

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (!rows.length) return
      if (e.key === 'ArrowDown')      { e.preventDefault(); setCursor(c => Math.min(c + 1, rows.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      else if (e.key === 'Home')      { e.preventDefault(); setCursor(0) }
      else if (e.key === 'End')       { e.preventDefault(); setCursor(rows.length - 1) }
      else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); onOpen?.(rows[cursor], cursor) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rows, cursor, onOpen])

  // Keep the cursor on screen when it is driven by the keyboard rather than the pointer.
  useEffect(() => {
    if (cursor < 0) return
    bodyRef.current?.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <div
      className={`overflow-auto border ${className}`}
      style={{ background: 'var(--office-panel-bg)', borderColor: 'var(--office-line)' }}
      data-testid="office-grid"
    >
      <table className={`border-collapse text-[11px] ${stretch ? 'w-full' : 'w-auto'}`}>
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className="px-2 py-1 font-bold whitespace-nowrap border"
                style={{
                  width: col.width,
                  textAlign: col.align || 'left',
                  background: 'var(--office-grid-head-bg)',
                  color: 'var(--office-grid-head-fg)',
                  borderColor: 'var(--office-line)',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-2 py-6 text-center opacity-60">{empty}</td></tr>
          )}
          {rows.map((row, i) => {
            const on = i === cursor
            return (
              <tr
                key={row.id ?? i}
                {...(rowAttrs?.(row, i) ?? {})}
                data-row={i}
                onClick={() => { setCursor(i); if (openOnClick) onOpen?.(row, i) }}
                onDoubleClick={() => onOpen?.(row, i)}
                className="cursor-pointer"
                style={{
                  background: on ? 'var(--office-row-sel-bg)' : i % 2 ? 'var(--office-row-b)' : 'var(--office-row-a)',
                  color: on ? 'var(--office-row-sel-fg)' : undefined,
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className="px-2 py-1 border whitespace-nowrap"
                    style={{
                      textAlign: col.align || 'left',
                      borderColor: 'var(--office-line)',
                      fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                    }}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {totals && (
          <tfoot className="sticky bottom-0">
            <tr style={{ background: 'var(--office-total-bg)' }}>
              {columns.map(col => (
                <td
                  key={col.key}
                  className="px-2 py-1 font-bold border"
                  style={{
                    textAlign: col.align || 'left',
                    borderColor: 'var(--office-line)',
                    fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                  }}
                >
                  {totals[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
