"use client"

import { useState } from "react"
import { Loader2, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const MOVEMENT_TYPES = [
  { id: 'RESTOCK',  label: 'Restock',  sign: +1, color: 'border-emerald-500 text-emerald-600', desc: 'Stock received from supplier' },
  { id: 'LOSS',     label: 'Loss',     sign: -1, color: 'border-tibetan text-tibetan',          desc: 'Stock lost or missing' },
  { id: 'DAMAGED',  label: 'Damaged',  sign: -1, color: 'border-amber-500 text-amber-600',      desc: 'Damaged / unsellable stock' },
  { id: 'TRANSFER', label: 'Transfer', sign: -1, color: 'border-blue-500 text-blue-600',        desc: 'Transferred to another location' },
]

/**
 * @param {{
 *   open: boolean,
 *   product: object|null,
 *   onAdjust: (productId, type, qty, notes) => Promise<{error}>,
 *   onClose: () => void
 * }} props
 */
export function AdjustStockModal({ open, product, onAdjust, onClose }) {
  const [type,    setType]    = useState('RESTOCK')
  const [qty,     setQty]     = useState('')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const selectedType = MOVEMENT_TYPES.find(t => t.id === type)
  const newStock     = product
    ? product.current_stock + (selectedType.sign * (parseInt(qty) || 0))
    : 0

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const quantity = parseInt(qty)
    if (!quantity || quantity <= 0) {
      setError('Enter a valid quantity greater than 0')
      return
    }

    setLoading(true)
    const signedQty = selectedType.sign * quantity
    const { error: adjError } = await onAdjust(product.id, type, signedQty, notes || `${type} adjustment`)

    if (adjError) {
      setError(adjError)
    } else {
      setQty('')
      setNotes('')
      onClose()
    }
    setLoading(false)
  }

  function handleClose() {
    setQty('')
    setNotes('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Adjust Stock</DialogTitle>
          <DialogDescription>
            {product?.name} · Current stock: <strong>{product?.current_stock ?? 0} {product?.unit ?? 'pcs'}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Movement type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`
                    p-2.5 rounded-lg border text-left transition-all
                    ${type === t.id
                      ? `${t.color} bg-current/5`
                      : 'border-border text-muted-foreground hover:border-border/80'
                    }
                  `}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {t.sign === 1
                      ? <Plus className="h-3.5 w-3.5" />
                      : <Minus className="h-3.5 w-3.5" />
                    }
                    <span className="text-xs font-semibold">{t.label}</span>
                  </div>
                  <p className="text-[10px] opacity-70">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Quantity</label>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              autoFocus
            />
            {qty && parseInt(qty) > 0 && (
              <p className="text-xs text-muted-foreground">
                New stock level:{' '}
                <span className={newStock < 0 ? 'text-tibetan font-semibold' : 'text-foreground font-semibold'}>
                  {newStock} {product?.unit ?? 'pcs'}
                </span>
                {newStock < 0 && ' ⚠ Cannot go below 0'}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground">(optional)</span></label>
            <Input
              placeholder="e.g. Delivery from Wholesaler A"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (newStock < 0 && selectedType?.sign === -1)}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : 'Confirm Adjustment'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
