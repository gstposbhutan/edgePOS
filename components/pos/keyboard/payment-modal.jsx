"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

const METHODS = [
  { key: 'MBOB',   label: 'mBoB',   num: '1' },
  { key: 'MPAY',   label: 'mPay',   num: '2' },
  { key: 'RTGS',   label: 'RTGS',   num: '3' },
  { key: 'CASH',   label: 'Cash',   num: '4' },
  { key: 'CREDIT', label: 'Credit', num: '5' },
]

const DENOMINATIONS = [10, 50, 100, 500, 1000]

/**
 * Payment modal for keyboard POS.
 * Keys 1-5 select method. E = exact, R = round. Enter completes.
 */
export function PaymentModal({ open, grandTotal, onConfirm, onClose }) {
  const [method,   setMethod]   = useState('CASH')
  const [received, setReceived] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setReceived('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKey(e) {
      // 1-5: select payment method
      if (/^[1-5]$/.test(e.key) && !e.ctrlKey) {
        const m = METHODS.find(m => m.num === e.key)
        if (m) { setMethod(m.key); e.preventDefault(); return }
      }

      // Ctrl+1..5: add denomination (CASH only)
      if (method === 'CASH' && e.ctrlKey && /^[1-5]$/.test(e.key)) {
        const denom = DENOMINATIONS[parseInt(e.key, 10) - 1]
        setReceived(prev => String(parseFloat(prev || '0') + denom))
        e.preventDefault()
        return
      }

      // E: exact
      if (e.key === 'e' || e.key === 'E') {
        setReceived(String(grandTotal))
        e.preventDefault()
        return
      }

      // R: round to nearest 5
      if (e.key === 'r' || e.key === 'R') {
        const rounded = Math.ceil(grandTotal / 5) * 5
        setReceived(String(rounded))
        e.preventDefault()
        return
      }

      // Backspace: clear last char from received
      if (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT') {
        setReceived(prev => prev.slice(0, -1))
        e.preventDefault()
        return
      }

      // Digits 0-9 and decimal (when no input focused)
      if (/^[\d.]$/.test(e.key) && document.activeElement?.tagName !== 'INPUT') {
        setReceived(prev => prev + e.key)
        e.preventDefault()
        return
      }

      // Enter: complete
      if (e.key === 'Enter') {
        const rec = parseFloat(received || '0')
        if (method !== 'CASH' || rec >= grandTotal) {
          handleConfirm()
          e.preventDefault()
        }
      }

      // Escape: close
      if (e.key === 'Escape') { onClose(); e.preventDefault() }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, method, received, grandTotal])

  function handleConfirm() {
    onConfirm({ method, received: parseFloat(received || grandTotal) })
  }

  const receivedAmt = parseFloat(received || '0')
  const change = receivedAmt - grandTotal
  const canComplete = method !== 'CASH' || receivedAmt >= grandTotal

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md bg-background rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-lg">Payment</h2>
            <p className="text-2xl font-bold text-primary tabular-nums">
              Nu. {parseFloat(grandTotal).toFixed(2)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-5 space-y-5">
          {/* Method selection */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Payment Method (1–5)</p>
            <div className="grid grid-cols-5 gap-2">
              {METHODS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    method === m.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="block text-[10px] text-muted-foreground mb-0.5">[{m.num}]</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash: received amount + denominations */}
          {method === 'CASH' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground shrink-0">Received</label>
                <input
                  type="number"
                  value={received}
                  onChange={e => setReceived(e.target.value)}
                  className="flex-1 px-3 py-2 text-lg font-mono text-right border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
                  placeholder="0.00"
                />
              </div>

              {/* Denomination tiles */}
              <div className="grid grid-cols-5 gap-1.5">
                {DENOMINATIONS.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setReceived(prev => String(parseFloat(prev || '0') + d))}
                    className="py-2 text-xs font-medium rounded-lg bg-muted hover:bg-muted/80 border border-border transition-colors"
                  >
                    <span className="block text-[9px] text-muted-foreground">[Ctrl+{i+1}]</span>
                    Nu.{d}
                  </button>
                ))}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setReceived(String(grandTotal))}
                >
                  [E] Exact
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setReceived(String(Math.ceil(grandTotal / 5) * 5))}
                >
                  [R] Round to Nu.5
                </Button>
              </div>

              {/* Change display */}
              {receivedAmt > 0 && (
                <div className={`p-3 rounded-lg text-center ${
                  change >= 0
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-tibetan/10 border border-tibetan/30'
                }`}>
                  <p className="text-xs text-muted-foreground">{change >= 0 ? 'Change' : 'Remaining'}</p>
                  <p className={`text-2xl font-bold tabular-nums ${change >= 0 ? 'text-emerald-600' : 'text-tibetan'}`}>
                    Nu. {Math.abs(change).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            [Esc] Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canComplete}
            className="flex-1 h-12 text-base"
          >
            [Enter] Complete
          </Button>
        </div>
      </div>
    </div>
  )
}
