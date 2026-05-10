"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const PAYMENT_METHODS = [
  { id: 'CASH',           label: 'Cash' },
  { id: 'MBOB',           label: 'mBoB' },
  { id: 'MPAY',           label: 'mPay' },
  { id: 'RTGS',           label: 'RTGS' },
  { id: 'BANK_TRANSFER',  label: 'Bank' },
]

/**
 * Record a repayment against a khata account.
 * @param {{ open: boolean, onClose: () => void, onRecord: (amount: number, method: string, opts: object) => Promise<{ error: string|null }>, outstandingBalance: number, accountName: string }} props
 */
export function RecordPaymentModal({ open, onClose, onRecord, outstandingBalance, accountName }) {
  const [amount,        setAmount]        = useState('')
  const [method,        setMethod]        = useState('CASH')
  const [referenceNo,   setReferenceNo]   = useState('')
  const [notes,         setNotes]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)

  const maxAmount = parseFloat(outstandingBalance) || 0

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (numAmount > maxAmount) {
      setError(`Amount cannot exceed outstanding balance of Nu. ${maxAmount.toFixed(2)}`)
      return
    }

    setLoading(true)
    const { error: recordError } = await onRecord(numAmount, method, {
      referenceNo: referenceNo.trim() || null,
      notes: notes.trim() || null,
    })
    setLoading(false)

    if (recordError) {
      setError(recordError)
      return
    }

    setAmount('')
    setReferenceNo('')
    setNotes('')
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-serif">Record Payment</DialogTitle>
          <DialogDescription>
            {accountName} — Outstanding: Nu. {maxAmount.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount (Nu.)</label>
            <Input
              type="number"
              min="0.01"
              max={maxAmount}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Method</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setMethod(pm.id)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all
                    ${method === pm.id
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'border-border text-muted-foreground hover:border-primary/40 bg-card'
                    }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference No (optional)</label>
            <Input
              placeholder="e.g. RTGS ref number"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes (optional)</label>
            <Input
              placeholder="e.g. Partial payment for March"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording...</>
                : `Record Nu. ${parseFloat(amount || 0).toFixed(2)}`
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
