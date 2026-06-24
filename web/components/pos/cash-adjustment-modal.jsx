"use client"

import { useState } from "react"
import { X, ArrowDownCircle, ArrowUpCircle, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCashAdjustments } from "@/hooks/use-cash-adjustments"

// Cash drawer reasons — matches desktop CASH_ADJUSTMENT_REASON (lib/constants.ts).
const REASONS = [
  "Petty Cash",
  "Office Expense",
  "Deposit",
  "Withdrawal",
  "Drawer Correction",
  "Other",
]

const fmt = (n) => "Nu. " + Number(n || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function CashAdjustmentModal({ shift, onClose }) {
  const { adjustments, add, totalCashIn, totalCashOut } = useCashAdjustments(shift?.id)

  const [type, setType] = useState("CASH_OUT") // cash out is the common case (pickup)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [customReason, setCustomReason] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const finalReason = reason === "Other" ? customReason.trim() : reason

  async function handleSubmit() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError("Enter an amount greater than 0"); return }
    if (!finalReason) { setError("Select a reason"); return }

    setSubmitting(true)
    setError("")
    try {
      await add({ type, amount: amt, reason: finalReason, notes })
      // reset, keep modal open so several entries can be logged in one sitting
      setAmount("")
      setReason("")
      setCustomReason("")
      setNotes("")
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Cash Drawer — In / Out</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!shift ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Open a shift first to record cash movements.
            </p>
          ) : (
            <>
              {/* Running totals */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-emerald/10 border border-emerald/20 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Cash In</div>
                  <div className="text-sm font-semibold text-emerald">{fmt(totalCashIn)}</div>
                </div>
                <div className="rounded-lg bg-tibetan/10 border border-tibetan/20 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Cash Out</div>
                  <div className="text-sm font-semibold text-tibetan">{fmt(totalCashOut)}</div>
                </div>
              </div>

              {/* In / Out toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setType("CASH_IN")}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    type === "CASH_IN"
                      ? "border-emerald bg-emerald/10 text-emerald"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <ArrowDownCircle className="h-4 w-4" /> Cash In
                </button>
                <button
                  onClick={() => setType("CASH_OUT")}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    type === "CASH_OUT"
                      ? "border-tibetan bg-tibetan/10 text-tibetan"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <ArrowUpCircle className="h-4 w-4" /> Cash Out
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Amount (Nu.)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="10"
                  className="text-lg font-semibold"
                  autoFocus
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Reason</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={`px-2.5 py-2 rounded-lg border text-xs text-left transition-colors ${
                        reason === r
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {reason === "Other" && (
                  <Input
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describe the reason"
                    className="mt-2"
                  />
                )}
              </div>

              {/* Notes */}
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
              />

              {error && <p className="text-xs text-tibetan">{error}</p>}

              {/* Recent entries */}
              {adjustments.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {adjustments.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        {a.type === "CASH_IN"
                          ? <Plus className="h-3 w-3 text-emerald" />
                          : <Minus className="h-3 w-3 text-tibetan" />}
                        <span className="truncate max-w-[140px]">{a.reason}</span>
                      </span>
                      <span className={a.type === "CASH_IN" ? "text-emerald font-medium" : "text-tibetan font-medium"}>
                        {a.type === "CASH_IN" ? "+" : "−"}{fmt(a.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting || !shift}
          >
            {submitting ? "Saving..." : "Record"}
          </Button>
        </div>
      </div>
    </div>
  )
}
