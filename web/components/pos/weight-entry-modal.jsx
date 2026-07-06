'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

/**
 * Manual weight/measure entry for sold_by_weight products (web parity with the desktop terminal).
 * The cashier types the amount in the product's unit; total = weight × per-unit rate. onConfirm
 * receives the measured weight, which becomes the line's (fractional) quantity.
 *
 * Parent should remount via `key` for a fresh entry each weigh.
 */
export function WeightEntryModal({ open, product, onConfirm, onClose }) {
  const [value, setValue] = useState('')
  if (!product) return null

  const unit = product.unit || 'kg'
  const rate = parseFloat(product.selling_price ?? product.mrp ?? product.unitPrice ?? 0) || 0
  const weight = parseFloat(value) || 0
  const total = weight * rate
  const valid = weight > 0

  const submit = () => { if (valid) onConfirm(weight) }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Weigh — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Rate: <span className="font-semibold text-foreground">Nu. {rate.toFixed(2)}</span> / {unit}
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Weight ({unit})</label>
            <Input
              type="number" min="0" step="0.001" inputMode="decimal" autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="e.g. 1.5"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold">Nu. {total.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!valid} onClick={submit}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
