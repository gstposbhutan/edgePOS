"use client"

import { useState, useEffect } from "react"
import { X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const fmt = (n) => "Nu. " + Number(n || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Row helper for the reconciliation breakdown.
function Row({ label, value, tone = "default" }) {
  const color = tone === "pos" ? "text-emerald" : tone === "neg" ? "text-tibetan" : "text-foreground"
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${color}`}>{fmt(value)}</span>
    </div>
  )
}

export function EndShiftModal({ shift, onClose, onEndShift }) {
  const [step, setStep] = useState('confirm') // confirm → count → done
  const [closingCount, setClosingCount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [recon, setRecon] = useState(null) // null = blind (cashier) or still loading

  // Managers/owners get a live drawer preview; cashiers get 403 → stays null (blind).
  useEffect(() => {
    if (!shift?.id) return
    fetch(`/api/shifts/${shift.id}/reconciliation`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRecon(data || null))
      .catch(() => setRecon(null))
  }, [shift?.id])

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

  // Live variance as the manager types the counted cash.
  const expected = recon?.expected_total ?? 0
  const counted = parseFloat(closingCount) || 0
  const variance = recon ? counted - expected : 0
  const varianceTone = !recon ? null : variance === 0 ? "balanced" : variance > 0 ? "over" : "short"
  const varianceLabel = { balanced: "Balanced", over: "Over", short: "Short" }[varianceTone]
  const varianceColor = { balanced: "text-emerald", over: "text-gold", short: "text-tibetan" }[varianceTone]

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
              {/* Manager/owner: live reconciliation breakdown (desktop shift-modal parity). */}
              {recon ? (
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Row label="Opening Float" value={recon.opening_float} />
                  <Row label="Cash Sales" value={recon.cash_sales} tone="pos" />
                  {recon.cash_refunds > 0 && <Row label="Cash Refunds" value={recon.cash_refunds} tone="neg" />}
                  {recon.total_cash_in > 0 && <Row label="Cash In" value={recon.total_cash_in} tone="pos" />}
                  {recon.total_cash_out > 0 && <Row label="Cash Out" value={recon.total_cash_out} tone="neg" />}
                  <div className="border-t border-border my-1.5" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Expected Total</span>
                    <span className="text-base font-bold text-primary tabular-nums">{fmt(expected)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Count the physical cash in the drawer and enter the total.
                </p>
              )}

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

              {/* Live variance preview (managers only). */}
              {recon && closingCount !== '' && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Variance</span>
                  <span className={`font-semibold tabular-nums ${varianceColor}`}>
                    {varianceLabel} ({variance >= 0 ? '+' : ''}{fmt(variance).replace('Nu. ', '')})
                  </span>
                </div>
              )}

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
              {result?.expected_total != null && (
                <div className="text-xs text-muted-foreground space-y-0.5 text-left rounded-lg border border-border p-3">
                  <div className="flex justify-between"><span>Expected</span><span>{fmt(result.expected_total)}</span></div>
                  <div className="flex justify-between"><span>Counted</span><span>{fmt(result.closing_count)}</span></div>
                  <div className="flex justify-between"><span>Variance</span><span>{fmt(result.discrepancy)}</span></div>
                  <div className="flex justify-between font-medium"><span>Result</span><span>{result.classification}</span></div>
                </div>
              )}
              <Button className="w-full" onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
