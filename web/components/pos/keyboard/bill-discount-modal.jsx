"use client"

import { useState, useEffect, useRef } from "react"
import { X, Tag, Percent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Ctrl+D — whole-bill discount. Applies the same discount basis to every line
 * via the parent's per-item applyDiscount (looped). PERCENTAGE = X% off each
 * line; FLAT = X Nu. off each unit on every line. Mirrors discount-modal.jsx.
 *
 * @param {{ items: any[], onApply: (d: {type: string, value: number}) => void, onClose: () => void }} props
 */
export function BillDiscountModal({ items, onApply, onClose }) {
  const [type, setType] = useState('PERCENTAGE')
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50)
  }, [])

  if (!items || items.length === 0) return null

  const numVal = parseFloat(value) || 0
  const billSubtotal = items.reduce((s, it) => s + parseFloat(it.unit_price) * it.quantity, 0)

  let billDiscount = 0
  if (type === 'PERCENTAGE') {
    billDiscount = billSubtotal * (Math.min(numVal, 100) / 100)
  } else {
    const perUnit = items.reduce((s, it) => s + Math.min(numVal, parseFloat(it.unit_price)) * it.quantity, 0)
    billDiscount = perUnit
  }

  function handleApply() {
    if (numVal <= 0) {
      onApply({ type: 'FLAT', value: 0 })
      return
    }
    onApply({ type, value: numVal })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleApply() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const btn = (active) =>
    `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-xs mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Bill Discount (all lines)</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            <p>Applies to <span className="font-medium text-foreground">{items.length} item(s)</span></p>
            <p className="mt-0.5">Bill subtotal: Nu. {billSubtotal.toFixed(2)}</p>
          </div>

          <div className="flex gap-1">
            <button onClick={() => { setType('PERCENTAGE'); setValue('') }} className={btn(type === 'PERCENTAGE')}>
              <Percent className="h-3.5 w-3.5" /> Percentage (%)
            </button>
            <button onClick={() => { setType('FLAT'); setValue('') }} className={btn(type === 'FLAT')}>
              <Tag className="h-3.5 w-3.5" /> Flat / unit (Nu.)
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              {type === 'FLAT' ? 'Discount per unit, all lines (Nu.)' : 'Discount (%)'}
            </label>
            <Input
              ref={inputRef}
              type="number"
              min="0"
              max={type === 'PERCENTAGE' ? '100' : undefined}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="mt-1 text-lg font-semibold"
              autoFocus
            />
          </div>

          {numVal > 0 && (
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs space-y-1">
              <p>Total discount: <span className="font-semibold text-emerald-600">Nu. {billDiscount.toFixed(2)}</span></p>
              <p>Bill after discount: <span className="font-semibold">Nu. {Math.max(0, billSubtotal - billDiscount).toFixed(2)}</span></p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleApply}>Apply to all</Button>
        </div>
      </div>
    </div>
  )
}
