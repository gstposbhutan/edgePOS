"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { OFFICE_MODULES, isTypingTarget } from "@/lib/pos/office-menu"

/**
 * Alt+O — the Office letter menu (spec WF-08/WF-09) on a full-screen till.
 *
 * The counter fills the screen because it is a till, not a console, so the back office needs a
 * way in that does not depend on a sidebar being visible. Navigation is by LETTER, the way a
 * ERP-trained shopkeeper already does it: press P for Purchase, then the module's own
 * second row of letters appears. A module with nowhere to go yet says so rather than looking
 * broken.
 *
 * The mirror of the terminal's letter strip (desktop/components/office/letter-strip.tsx), with
 * the same letters in the same order.
 */
export function OfficeMenu({ open, onClose }) {
  const router = useRouter()
  const [module, setModule] = useState(null)   // the module whose second row is showing
  const dialogRef = useRef(null)

  useEffect(() => { if (!open) setModule(null) }, [open])

  // The counter's barcode row holds the caret continuously, so without this the menu's LETTERS
  // would be typed into it instead of navigating — the field is a typing target and the handler
  // below stands down for those. Take focus when the menu opens; the barcode row does not fight
  // back for it while a sheet is up.
  useEffect(() => {
    if (!open) return
    document.activeElement?.blur?.()
    dialogRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
        if (module) setModule(null); else onClose()
        return
      }
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return
      const letter = e.key.toUpperCase()
      const list = module?.children ?? OFFICE_MODULES
      const hit = list.find(m => m.letter === letter)
      if (!hit) return
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
      choose(hit)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  function choose(entry) {
    if (entry.todo) return
    // A module with a second row opens it; one without goes straight there.
    if (!module && entry.children?.length) { setModule(entry); return }
    if (entry.href) { onClose(); router.push(entry.href) }
  }

  if (!open) return null

  const list = module?.children ?? OFFICE_MODULES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={dialogRef} tabIndex={-1} className="bg-background border border-border rounded-xl shadow-lg w-full max-w-lg mx-4 outline-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">
            Office{module ? ` — ${module.label}` : ''}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {list.map(entry => (
            <button
              key={`${entry.letter}-${entry.label}`}
              type="button"
              disabled={entry.todo}
              onClick={() => choose(entry)}
              title={entry.todo ? `${entry.label} — not on this console` : `${entry.letter} — ${entry.label}`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                entry.todo
                  ? 'border-transparent opacity-40 cursor-default'
                  : 'border-border bg-background hover:bg-accent hover:border-primary/50 active:scale-95 cursor-pointer'
              }`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-muted border border-border font-mono font-bold text-sm">
                {entry.letter}
              </span>
              <span className="text-sm truncate">{entry.label}{entry.todo ? ' ◌' : ''}</span>
            </button>
          ))}
        </div>
        <p className="px-4 pb-3 text-[11px] text-muted-foreground text-center">
          Press a letter · Esc {module ? 'back' : 'close'}
        </p>
      </div>
    </div>
  )
}
