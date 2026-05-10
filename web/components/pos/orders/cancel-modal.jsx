"use client"

import { useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

// Which statuses each sub-role can cancel
const CANCELLABLE_BY = {
  CASHIER:  ['PENDING_PAYMENT', 'DRAFT'],
  MANAGER:  ['PENDING_PAYMENT', 'DRAFT', 'PAYMENT_VERIFYING', 'CONFIRMED'],
  OWNER:    ['PENDING_PAYMENT', 'DRAFT', 'PAYMENT_VERIFYING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'CANCELLATION_REQUESTED'],
  ADMIN:    ['PENDING_PAYMENT', 'DRAFT', 'PAYMENT_VERIFYING', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'CANCELLATION_REQUESTED'],
  SUPER_ADMIN: ['*'],
}

/**
 * @param {{ open, order, subRole, userId, onCancel, onClose }} props
 */
export function CancelModal({ open, order, subRole, userId, onCancel, onClose }) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const allowed   = CANCELLABLE_BY[subRole] ?? []
  const canCancel = allowed.includes('*') || allowed.includes(order?.status)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) return setError('Reason is required')
    setLoading(true)
    const { error: err } = await onCancel(order.id, reason.trim(), userId, subRole)
    if (err) setError(err)
    else { setReason(''); onClose() }
    setLoading(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-tibetan shrink-0" />
            <DialogTitle className="font-serif">Cancel Order</DialogTitle>
          </div>
          <DialogDescription>
            Order <span className="font-mono font-medium">{order?.order_no}</span> · Nu. {parseFloat(order?.grand_total ?? 0).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {!canCancel ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              You cannot cancel an order at <strong>{order?.status?.replace(/_/g, ' ')}</strong> status.
            </p>
            <p className="text-xs text-muted-foreground">Contact your manager or owner.</p>
            <Button variant="outline" onClick={onClose} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="p-3 bg-tibetan/10 border border-tibetan/20 rounded-lg text-xs text-tibetan">
              ⚠ Stock will be restored automatically if payment was confirmed.
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason for cancellation <span className="text-tibetan">*</span></label>
              <Input
                placeholder="e.g. Customer changed mind, wrong item..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && <p className="text-xs text-tibetan">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Keep Order</Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-tibetan hover:bg-tibetan/90 text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Order'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
