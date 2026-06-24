"use client"

import { useState, useEffect } from "react"
import { X, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Ctrl+C (manager-only) — confirm marking the bill complimentary. Applies a
 * 100% discount to every line (GST then computes on 0). Optional reason.
 *
 * @param {{ onConfirm: (reason: string) => void, onClose: () => void }} props
 */
export function ComplimentaryConfirmModal({ onConfirm, onClose }) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Gift className="h-4 w-4" /> Complimentary</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-muted-foreground">This applies a <strong>100% discount</strong> to every line — the bill total and GST become zero. The sale still records normally.</p>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Reason (optional)</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. sample, staff, goodwill" className="h-9" />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-border flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(reason.trim())}>Mark complimentary</Button>
        </div>
      </div>
    </div>
  )
}
