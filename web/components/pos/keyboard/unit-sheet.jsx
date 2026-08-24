"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { unitsAvailable } from "@/lib/pos/units"

/**
 * Alt+U — the counter unit sheet ("Unit sheet — Pcs / Pack / Case. ↑↓ Enter Esc"), also the
 * middle step of the Enter cycle (spec WF-05). The mirror of
 * desktop/components/pos/keyboard/unit-sheet.tsx.
 *
 * The sheet only ever lists levels the shop actually configured on the item (lib/pos/units.js
 * builds the ladder). It never offers a Pack whose size nobody entered — that would invent a
 * quantity and mis-deduct stock, which is exactly why this key sat reserved.
 *
 * `pieceStock` is on-hand in PIECES (null when the item is not stock-tracked). Availability is
 * shown per level in THAT level's own unit, floored: 25 loose pieces is two cartons of 12, not
 * 2.08, and a level the stock cannot cover even once is struck out so the cashier sees why
 * Enter will refuse it.
 */
export function UnitSheet({ open, levels, currentFactor, productName, pieceStock, onSelect, onClose }) {
  const [cursor, setCursor] = useState(0)

  // Open on the level the line is already at, so Enter is a no-op rather than a surprise.
  useEffect(() => {
    if (!open) return
    const at = levels.findIndex(l => l.factor === currentFactor)
    setCursor(at >= 0 ? at : 0)
  }, [open, levels, currentFactor])

  // Own the arrows while the sheet is up. The page's key handler listens on the document, so a
  // bubble-phase React handler is not enough — capture the key and stop it dead.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter') {
        setCursor(c => {
          const level = levels[c]
          if (level) onSelect(level)
          return c
        })
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setCursor(c => Math.min(levels.length - 1, Math.max(0, c + delta)))
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, levels, onSelect, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="unit-sheet">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold truncate">Unit — {productName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3">
          <div className="rounded-lg border border-border overflow-hidden">
            {levels.map((level, i) => {
              const avail = unitsAvailable(pieceStock, level.factor)
              const short = avail != null && avail < 1
              const isCursor  = i === cursor
              const isCurrent = level.factor === currentFactor
              return (
                <button
                  key={`${level.id}-${level.factor}`}
                  type="button"
                  data-testid={`unit-level-${level.id}`}
                  onClick={() => onSelect(level)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left border-b border-border last:border-0 ${
                    isCursor ? 'bg-primary/15 font-medium' : 'hover:bg-accent/40'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-3 text-primary ${isCursor ? '' : 'opacity-0'}`}>►</span>
                    <span className={short ? 'line-through text-muted-foreground' : ''}>{level.label}</span>
                    {isCurrent && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">current</span>}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {level.factor > 1 ? `x ${level.factor}` : 'x 1'}
                    {avail != null && <span className="ml-2">{avail} avail</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-3">↑↓ move · Enter select · Esc cancel</p>
        </div>
      </div>
    </div>
  )
}
