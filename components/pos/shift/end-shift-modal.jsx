"use client"

import { useState } from "react"
import { X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function EndShiftModal({ shift, onClose, onEndShift }) {
  const [step, setStep] = useState('confirm') // confirm → count → done
  const [closingCount, setClosingCount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleSubmitCount() {
    const count = parseFloat(closingCount)
    if (isNaN(count) || count < 0) { setError('Enter a valid amount'); return }

    setSubmitting(true)
    setError('')
    try {
      const res = await onEndShift(shift.id, count)
      setResult(res)
      setStep('done')
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">
            {step === 'confirm' ? 'End Shift' : step === 'count' ? 'Count Cash in Drawer' : 'Shift Closed'}
          </h3>
          {step !== 'done' && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-5">
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 text-gold shrink-0" />
                <p>Are you sure you want to end your shift?</p>
              </div>
              {shift?.register_name && (
                <p className="text-xs text-muted-foreground">Register: {shift.register_name}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => setStep('count')}>
                  End Shift
                </Button>
              </div>
            </div>
          )}

          {step === 'count' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Count the physical cash in the drawer and enter the total.</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Cash Count (Nu.)</label>
                <Input
                  type="number"
                  value={closingCount}
                  onChange={e => setClosingCount(e.target.value)}
                  min="0"
                  step="100"
                  className="text-lg font-semibold"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-tibetan">{error}</p>}
              <Button className="w-full" onClick={handleSubmitCount} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Count'}
              </Button>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <span className="text-emerald-600 text-xl">✓</span>
              </div>
              <p className="text-sm font-medium">{result?.message || 'Shift closed successfully.'}</p>
              <Button className="w-full" onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
