"use client"

import { useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * @param {{ open, order, items, userId, onRequest, onClose }} props
 */
export function RefundModal({ open, order, items, userId, onRequest, onClose }) {
  const [selected, setSelected] = useState({}) // { order_item_id: qty }
  const [reason,   setReason]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const activeItems = (items ?? []).filter(i => i.status === 'ACTIVE')

  function toggleItem(id, maxQty) {
    setSelected(prev => prev[id] ? { ...prev, [id]: undefined } : { ...prev, [id]: maxQty })
  }

  function setQty(id, qty, maxQty) {
    const clamped = Math.min(Math.max(1, parseInt(qty) || 1), maxQty)
    setSelected(prev => ({ ...prev, [id]: clamped }))
  }

  const refundItems = Object.entries(selected)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ order_item_id: id, quantity: qty }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!refundItems.length) return setError('Select at least one item to refund')
    if (!reason.trim())      return setError('Reason is required')
    setLoading(true)
    const { error: err } = await onRequest(order.id, refundItems, reason.trim(), userId)
    if (err) setError(err)
    else { setSelected({}); setReason(''); onClose() }
    setLoading(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="h-5 w-5 text-blue-500 shrink-0" />
            <DialogTitle className="font-serif">Request Refund</DialogTitle>
          </div>
          <DialogDescription>
            {order?.order_no} · Select items to refund
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Item selection */}
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {activeItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No refundable items</p>
            ) : activeItems.map(item => {
              const isSelected = !!selected[item.id]
              return (
                <div key={item.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
                    ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'}`}
                  onClick={() => toggleItem(item.id, item.quantity)}
                >
                  <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center
                    ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                    {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">Qty: {item.quantity} · Nu. {parseFloat(item.total).toFixed(2)}</p>
                  </div>
                  {isSelected && (
                    <div onClick={e => e.stopPropagation()}>
                      <Input
                        type="number" min="1" max={item.quantity}
                        value={selected[item.id] ?? item.quantity}
                        onChange={e => setQty(item.id, e.target.value, item.quantity)}
                        className="h-6 w-16 text-xs text-center px-1"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reason <span className="text-tibetan">*</span></label>
            <Input
              placeholder="e.g. Defective product, wrong item..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </div>

          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-600">
            Refund will be via <strong>{order?.payment_method}</strong>. Awaiting manager approval.
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading || !refundItems.length} className="flex-1 bg-primary hover:bg-primary/90">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Request Refund (${refundItems.length} item${refundItems.length !== 1 ? 's' : ''})`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
