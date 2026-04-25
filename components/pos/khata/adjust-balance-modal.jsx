"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * OWNER-only: adjust a khata account balance (write off or correction).
 * @param {{ open: boolean, onClose: () => void, onAdjust: (type: string, amount: number, reason: string) => Promise<{ error: string|null }>, outstandingBalance: number, accountName: string }} props
 */
export function AdjustBalanceModal({ open, onClose, onAdjust, outstandingBalance, accountName }) {
  const [adjType,  setAdjType]  = useState('WRITE_OFF')
  const [amount,   setAmount]   = useState('')
  const [reason,   setReason]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Enter a valid amount')
      return
    }

    if (!reason.trim()) {
      setError('Reason is required for all adjustments')
      return
    }

    if (adjType === 'WRITE_OFF' && numAmount > parseFloat(outstandingBalance)) {
      setError('Write-off cannot exceed outstanding balance')
      return
    }

    setLoading(true)
    const { error: adjError } = await onAdjust(adjType, numAmount, reason.trim())
    setLoading(false)

    if (adjError) {
      setError(adjError)
      return
    }

    setAmount('')
    setReason('')
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif">Adjust Balance</DialogTitle>
          <DialogDescription>
            {accountName} — Outstanding: Nu. {parseFloat(outstandingBalance).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjType('WRITE_OFF')}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all
                  ${adjType === 'WRITE_OFF'
                    ? 'bg-tibetan text-white border-transparent'
                    : 'border-border text-muted-foreground hover:border-primary/40 bg-card'
                  }`}
              >
                Write Off
              </button>
              <button
                type="button"
                onClick={() => setAdjType('CORRECTION')}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all
                  ${adjType === 'CORRECTION'
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'border-border text-muted-foreground hover:border-primary/40 bg-card'
                  }`}
              >
                Correction
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {adjType === 'WRITE_OFF'
                ? 'Reduces outstanding balance (e.g., bad debt).'
                : 'Positive or negative amount applied to balance.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount (Nu.)</label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reason (required)</label>
            <Input
              placeholder={adjType === 'WRITE_OFF' ? 'e.g. Bad debt — customer unreachable' : 'e.g. Duplicate entry correction'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-tibetan hover:bg-tibetan/90">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adjusting...</>
                : `Apply ${adjType === 'WRITE_OFF' ? 'Write-Off' : 'Correction'}`
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
