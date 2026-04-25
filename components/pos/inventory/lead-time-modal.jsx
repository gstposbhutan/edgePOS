"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Set supplier lead time for a product.
 * @param {{ open: boolean, onClose: () => void, onSave: (productId: string, supplierId: string|null, days: number, notes: string) => Promise<{ error: string|null }>, prediction: object|null }} props
 */
export function LeadTimeModal({ open, onClose, onSave, prediction }) {
  const [days,    setDays]    = useState('7')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (open) {
      setDays('7')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const numDays = parseInt(days)
    if (!numDays || numDays < 1) {
      setError('Lead time must be at least 1 day')
      return
    }

    setLoading(true)
    const productId = prediction?.product_id
    const { error: saveError } = await onSave(productId, null, numDays, notes.trim())
    setLoading(false)

    if (saveError) {
      setError(saveError)
      return
    }

    onClose()
  }

  const productName = prediction?.products?.name ?? 'this product'

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif">Set Lead Time</DialogTitle>
          <DialogDescription>
            How many days does it take to restock {productName}?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Lead Time (days)</label>
            <Input
              type="number"
              min="1"
              max="90"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Default is 7 days. This affects reorder suggestions.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes (optional)</label>
            <Input
              placeholder="e.g. Sundays off, add 1 day"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : 'Save Lead Time'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
