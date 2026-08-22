"use client"

import { useState, useEffect, useRef } from "react"
import { X, Camera, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReceiptScanModal } from "@/components/pos/receipt-scan-modal"
import { PaymentQr } from "@/components/pos/payment-qr"

const METHODS = [
  { key: 'ONLINE', label: 'Online',  num: '1' },
  { key: 'CASH',   label: 'Cash',    num: '2' },
  { key: 'CREDIT', label: 'Credit',  num: '3' },
]
const DENOMINATIONS = [10, 50, 100, 500, 1000]

/**
 * Payment modal for keyboard POS.
 * Keys 1-5 select method. E = exact, R = round. Enter completes.
 */
export function PaymentModal({ open, grandTotal, onConfirm, onClose, accounts = [], onCreateCustomer }) {
  const [method,       setMethod]       = useState('CASH')
  const [received,     setReceived]     = useState('')
  const [journalNo,    setJournalNo]    = useState('')
  const [showScan,     setShowScan]     = useState(false)
  const [scanHint,     setScanHint]     = useState(null)
  // CREDIT: inline customer search / add (no separate step).
  const [creditAccount, setCreditAccount] = useState(null)
  const [custQ,         setCustQ]         = useState('')
  const [addMode,       setAddMode]       = useState(false)
  const [newName,       setNewName]       = useState('')
  const [newPhone,      setNewPhone]      = useState('')
  const [creatingCust,  setCreatingCust]  = useState(false)
  const [custErr,       setCustErr]       = useState(null)
  const journalRef = useRef(null)

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setReceived('')
      setJournalNo('')
      setShowScan(false)
      setScanHint(null)
      setCreditAccount(null)
      setCustQ(''); setAddMode(false); setNewName(''); setNewPhone(''); setCustErr(null)
    }
  }, [open])

  const custTerm = custQ.trim().toLowerCase()
  const custRows = (accounts || []).filter(a => !custTerm
    || (a.debtor_phone ?? '').toLowerCase().includes(custTerm)
    || (a.debtor_name ?? '').toLowerCase().includes(custTerm)).slice(0, 6)

  async function addCustomer() {
    if (!newName.trim() || !newPhone.trim()) { setCustErr('Name and mobile number are required'); return }
    setCreatingCust(true); setCustErr(null)
    const { account, error } = await onCreateCustomer?.({ name: newName.trim(), phone: newPhone.trim() }) ?? {}
    setCreatingCust(false)
    if (error || !account) { setCustErr(error || 'Could not add customer'); return }
    setCreditAccount(account); setAddMode(false); setCustQ('')
  }

  // Auto-focus journal input when ONLINE selected
  useEffect(() => {
    if (open && method === 'ONLINE') {
      setTimeout(() => journalRef.current?.focus(), 100)
    }
  }, [open, method])

  useEffect(() => {
    if (!open) return

    function handleKey(e) {
      if (showScan) return   // camera modal owns the keyboard while open
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)

      // 1-3: select payment method (only when no input focused)
      if (/^[1-3]$/.test(e.key) && !e.ctrlKey && !inInput) {
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
      if ((e.key === 'e' || e.key === 'E') && !inInput) {
        setReceived(String(grandTotal))
        e.preventDefault()
        return
      }

      // R: round to nearest 5
      if ((e.key === 'r' || e.key === 'R') && !inInput) {
        const rounded = Math.ceil(grandTotal / 5) * 5
        setReceived(String(rounded))
        e.preventDefault()
        return
      }

      // Backspace: clear last char from received (CASH, no input focused)
      if (e.key === 'Backspace' && !inInput) {
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
        const journalReady = method !== 'ONLINE' || journalNo.trim().length > 0
        const creditReady = method !== 'CREDIT' || !!creditAccount
        if (journalReady && creditReady && (method !== 'CASH' || rec >= grandTotal)) {
          handleConfirm()
          e.preventDefault()
        }
      }

      // Escape: close
      if (e.key === 'Escape') { onClose(); e.preventDefault() }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, method, received, grandTotal, journalNo, showScan, creditAccount])

  function handleConfirm() {
    onConfirm({
      method,
      received: parseFloat(received || grandTotal),
      journalNo: method === 'ONLINE' ? journalNo.trim() : null,
      creditAccount: method === 'CREDIT' ? creditAccount : null,
    })
  }

  const receivedAmt = parseFloat(received || '0')
  const change = receivedAmt - grandTotal
  const canComplete =
    (method !== 'CASH' || receivedAmt >= grandTotal) &&
    (method !== 'ONLINE' || journalNo.trim().length > 0) &&
    (method !== 'CREDIT' || !!creditAccount)

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
            <p className="text-xs text-muted-foreground mb-2">Payment Method (1–3)</p>
            <div className="grid grid-cols-3 gap-2">
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

          {/* Online: show the payment QR first (customer scans & pays), then capture the journal number */}
          {method === 'ONLINE' && (
            <div className="space-y-2">
              <PaymentQr amount={grandTotal} />
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-muted-foreground">Journal Number *</label>
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowScan(true)}>
                  <Camera className="h-4 w-4 mr-1.5" /> Scan receipt
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Enter the reference number from the payment confirmation, or scan it from the phone.</p>
              <input
                ref={journalRef}
                type="text"
                value={journalNo}
                onChange={e => { setJournalNo(e.target.value); setScanHint(null) }}
                className="w-full px-3 py-2.5 text-lg font-mono text-center border border-input rounded-lg bg-background outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter journal number"
                autoFocus
              />
              {scanHint && (
                <p className={`text-xs ${scanHint.amountMatches ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {scanHint.amountMatches
                    ? `Scanned — Nu. ${scanHint.extractedAmount} matches the bill.`
                    : scanHint.extractedAmount != null
                      ? `Scanned — found Nu. ${scanHint.extractedAmount}, bill is Nu. ${parseFloat(grandTotal).toFixed(2)}. Please verify.`
                      : `Scanned — please verify the number.`}
                </p>
              )}
            </div>
          )}

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

          {/* Credit: pick or add the khata customer inline — no separate step (Fame Digital) */}
          {method === 'CREDIT' && (
            <div className="space-y-2">
              {creditAccount ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{creditAccount.debtor_name || 'Customer'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{creditAccount.debtor_phone || '—'}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCreditAccount(null)}>Change</Button>
                </div>
              ) : addMode ? (
                <div className="space-y-2 p-3 rounded-lg border border-border">
                  <p className="text-xs font-medium text-muted-foreground">New credit customer</p>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Customer name"
                    className="w-full h-9 px-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Mobile number" type="tel"
                    className="w-full h-9 px-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:ring-2 focus:ring-ring" />
                  {custErr && <p className="text-xs text-tibetan">{custErr}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setAddMode(false); setCustErr(null) }}>Back</Button>
                    <Button size="sm" className="flex-1" onClick={addCustomer} disabled={creatingCust}>
                      {creatingCust ? 'Adding…' : 'Add & select'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input value={custQ} onChange={e => setCustQ(e.target.value)} autoFocus
                      placeholder="Search customer by mobile or name…"
                      className="w-full h-9 pl-8 pr-2.5 border border-input rounded-lg bg-background text-sm outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  {custRows.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                      {custRows.map(a => (
                        <button key={a.id} type="button" onClick={() => setCreditAccount(a)}
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-2">
                          <span className="text-sm truncate">{a.debtor_name || '—'} <span className="text-xs text-muted-foreground font-mono">{a.debtor_phone}</span></span>
                          <span className="text-xs text-muted-foreground shrink-0">Nu. {Number(a.outstanding_balance || 0).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setAddMode(true); setNewName(custQ.trim()); setNewPhone(''); setCustErr(null) }}>
                    + Add new customer
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Pick the credit customer or add a new one — the sale goes on their khata.</p>
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

      <ReceiptScanModal
        open={showScan}
        expectedAmount={grandTotal}
        onClose={() => setShowScan(false)}
        onExtracted={(ref, meta) => { setJournalNo(ref); setScanHint(meta); setShowScan(false) }}
      />
    </div>
  )
}
