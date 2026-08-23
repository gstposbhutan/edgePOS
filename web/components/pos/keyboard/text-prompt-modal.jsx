"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * A one-field text prompt — Ctrl+T's item remark today, and anything else the counter needs to
 * ask in a sentence. The mirror of desktop/components/pos/text-prompt-modal.tsx, which exists
 * there because `window.prompt` throws in Electron; here it exists so the two tills ask the
 * same question the same way.
 *
 * Submitting an empty field is a deliberate CLEAR, not a cancel — that is how a cashier removes
 * a remark they no longer want. Esc cancels and changes nothing.
 */
export function TextPromptModal({ open, title, label, initial = '', maxLength = 200, placeholder, onSubmit, onClose }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // Own Escape at capture so the page's Esc binding doesn't also fire behind the sheet.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    const t = setTimeout(() => inputRef.current?.select(), 20)
    return () => { document.removeEventListener('keydown', onKey, true); clearTimeout(t) }
  }, [open, onClose])

  if (!open) return null

  function submit() {
    onSubmit(inputRef.current?.value ?? '')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {label && <p className="text-xs text-muted-foreground">{label}</p>}
          <input
            ref={inputRef}
            type="text"
            defaultValue={initial}
            maxLength={maxLength}
            placeholder={placeholder}
            onKeyDown={(e) => {
              // The page listens on the document; keep the ticket's bindings out of this field.
              e.stopPropagation()
              e.nativeEvent.stopImmediatePropagation()
              if (e.key === 'Enter') { e.preventDefault(); submit() }
            }}
            className="w-full h-9 px-2 text-sm bg-background border border-border rounded outline-none focus:border-primary"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={submit}>Save</Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Leave it blank to clear.</p>
        </div>
      </div>
    </div>
  )
}
