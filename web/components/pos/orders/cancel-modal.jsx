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
 * @param {{ open, order, items?, subRole, userId, onCancel, onClose }} props
 * `items` — the order's line items; enables partial (per-quantity) cancellation.
 */
export function CancelModal({ open, order, items = [], subRole, userId, onCancel, onClose }) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [scope,   setScope]   = useState('FULL')          // FULL | PARTIAL
  const [qtys,    setQtys]    = useState({})              // order_item id → qty to cancel

  const allowed   = CANCELLABLE_BY[subRole] ?? []
  const canCancel = allowed.includes('*') || allowed.includes(order?.status)
  const activeItems = (items || []).filter(i => i.status === 'ACTIVE' && i.product_id)

  function setQty(id, v, max) {
    const n = Math.max(0, Math.min(parseInt(v, 10) || 0, max))
    setQtys(q => ({ ...q, [id]: n }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) return setError('Reason is required')

    let partialItems
    if (scope === 'PARTIAL') {
      partialItems = activeItems
        .map(i => ({ id: i.id, quantity: qtys[i.id] || 0 }))
        .filter(x => x.quantity > 0)
      if (!partialItems.length) return setError('Select at least one item quantity to cancel')
    }

    setLoading(true)
    const { error: err } = await onCancel(order.id, reason.trim(), userId, subRole, partialItems)
    if (err) setError(err)
    else { setReason(''); setQtys({}); setScope('FULL'); onClose() }
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
              ⚠ Cancelled quantities are returned to available stock automatically.
            </div>

            {activeItems.length > 0 && (
              <div className="space-y-2">
                <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                  <button type="button" onClick={() => setScope('FULL')}
                    className={`px-3 py-1 rounded-md font-medium ${scope === 'FULL' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    Whole order
                  </button>
                  <button type="button" onClick={() => setScope('PARTIAL')}
                    className={`px-3 py-1 rounded-md font-medium ${scope === 'PARTIAL' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    Selected items
                  </button>
                </div>

                {scope === 'PARTIAL' && (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-lg border border-border p-2">
                    {activeItems.map(i => (
                      <div key={i.id} className="flex items-center gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{i.name}</p>
                          <p className="text-[11px] text-muted-foreground">Ordered {i.quantity} · Nu. {parseFloat(i.unit_price).toFixed(2)}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Cancel</span>
                        <Input
                          type="number" min={0} max={i.quantity}
                          value={qtys[i.id] ?? 0}
                          onChange={e => setQty(i.id, e.target.value, i.quantity)}
                          className="w-16 h-8 text-center"
                        />
                        <span className="text-[11px] text-muted-foreground">/ {i.quantity}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground pt-1">Cancelling every item cancels the whole order.</p>
                  </div>
                )}
              </div>
            )}

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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (scope === 'PARTIAL' ? 'Cancel Items' : 'Cancel Order')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
