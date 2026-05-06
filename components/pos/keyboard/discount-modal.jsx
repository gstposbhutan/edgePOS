"use client"

import { useState, useEffect, useRef } from "react"
import { X, Tag, Percent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DiscountModal({ item, onApply, onClose }) {
  const [type, setType] = useState(item?.discount_type || 'FLAT')
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Pre-fill with existing discount value if any
    if (item?.discount_value > 0) {
      setValue(String(item.discount_value))
    } else if (item?.discount > 0) {
      setValue(String(item.discount))
    }
    setTimeout(() => inputRef.current?.select(), 50)
  }, [item])

  if (!item) return null

  const unitPrice = parseFloat(item.unit_price)
  const numVal = parseFloat(value) || 0

  // Compute effective discount for preview
  let effectiveDiscount = 0
  if (type === 'PERCENTAGE') {
    effectiveDiscount = unitPrice * (Math.min(numVal, 100) / 100)
  } else {
    effectiveDiscount = Math.min(numVal, unitPrice)
  }

  function handleApply() {
    if (numVal <= 0) {
      // Clear discount
      onApply({ type: 'FLAT', value: 0 })
      return
    }
    onApply({ type, value: numVal })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleApply() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const discountedPrice = Math.max(0, unitPrice - effectiveDiscount)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-xs mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Apply Discount</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Product info */}
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground text-sm truncate">{item.name}</p>
            <p className="mt-0.5">Unit price: Nu. {unitPrice.toFixed(2)}</p>
          </div>

          {/* Type toggle */}
          <div className="flex gap-1">
            <button
              onClick={() => { setType('FLAT'); setValue('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                type === 'FLAT'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Tag className="h-3.5 w-3.5" /> Flat (Nu.)
            </button>
            <button
              onClick={() => { setType('PERCENTAGE'); setValue('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                type === 'PERCENTAGE'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Percent className="h-3.5 w-3.5" /> Percentage (%)
            </button>
          </div>

          {/* Value input */}
          <div>
            <label className="text-xs text-muted-foreground">
              {type === 'FLAT' ? 'Discount per unit (Nu.)' : 'Discount (%)'}
            </label>
            <Input
              ref={inputRef}
              type="number"
              min="0"
              max={type === 'PERCENTAGE' ? '100' : String(unitPrice)}
              step={type === 'PERCENTAGE' ? '1' : '1'}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="mt-1 text-lg font-semibold"
              autoFocus
            />
          </div>

          {/* Preview */}
          {numVal > 0 && (
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs space-y-1">
              <p>Effective discount: <span className="font-semibold text-emerald-600">Nu. {effectiveDiscount.toFixed(2)}</span> per unit</p>
              <p>Price after discount: <span className="font-semibold">Nu. {discountedPrice.toFixed(2)}</span></p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}
