"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, ChevronDown, ChevronRight, Loader2, Wallet, HandCoins, SlidersHorizontal,
  Snowflake, Sun, X, AlertCircle, CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Credit (khata) management for the distributor / wholesaler consoles — the vendor is the creditor.
 * Lists the accounts they extend to the tier below with outstanding vs limit, and lets an owner/
 * manager record repayments, set the credit limit, freeze/unfreeze, and (owner) write off a balance.
 */
export function KhataManager() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [modal, setModal] = useState(null)   // { mode, account }
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/console/khata')
      const data = await res.json()
      if (res.ok) setRows(data.accounts || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const totalOwed = rows.reduce((s, a) => s + parseFloat(a.outstanding_balance || 0), 0)

  async function setStatus(account, status) {
    setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/console/khata/${account.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setNotice(status === 'FROZEN' ? 'Account frozen' : 'Account unfrozen')
      load()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Credit (Khata)</h2>
          <p className="text-xs text-muted-foreground">{rows.length} account{rows.length === 1 ? '' : 's'} · {money(totalOwed)} outstanding</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2"><AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" /><p className="text-sm text-tibetan">{error}</p></div>}
      {notice && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /><p className="text-sm text-emerald-600">{notice}</p></div>}

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground"><Wallet className="h-12 w-12 opacity-20" /><p className="text-sm text-center max-w-xs">No credit accounts yet — they appear when you connect a buyer or sell on credit.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(a => (
              <KhataRow key={a.id} account={a} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                onAction={(mode) => { setError(null); setNotice(null); setModal({ mode, account: a }) }} onSetStatus={setStatus} />
            ))}
          </div>
        )}
      </div>

      {modal && (
        <ActionModal mode={modal.mode} account={modal.account} onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setNotice(msg); load() }} onError={setError} />
      )}
    </div>
  )
}

function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }
const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  FROZEN: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  CLOSED: 'bg-muted text-muted-foreground border border-border',
}

function KhataRow({ account, open, onToggle, onAction, onSetStatus }) {
  const [detail, setDetail] = useState(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try { const res = await fetch(`/api/console/khata/${account.id}`); const d = await res.json(); if (alive && res.ok) setDetail(d) } catch { /* */ }
    })()
    return () => { alive = false }
  }, [open, account.id])

  const owed = parseFloat(account.outstanding_balance || 0)
  const limit = parseFloat(account.credit_limit || 0)
  const overLimit = limit > 0 && owed >= limit
  const avail = Math.max(0, limit - owed)

  return (
    <div className={account.status === 'CLOSED' ? 'opacity-70' : ''}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
        <div className="text-muted-foreground shrink-0">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{account.name}</p>
            <span className={`text-[10px] px-1.5 py-0 rounded ${STATUS_STYLES[account.status] || STATUS_STYLES.ACTIVE}`}>{account.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">limit {money(limit)} · {overLimit ? <span className="text-tibetan">over limit</span> : `${money(avail)} available`}</p>
        </div>
        <p className={`text-sm font-bold shrink-0 ${owed > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{money(owed)}</p>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAction('payment')} disabled={owed <= 0}><HandCoins className="h-4 w-4 mr-1" /> Record payment</Button>
            <Button size="sm" variant="outline" onClick={() => onAction('limit')}><SlidersHorizontal className="h-4 w-4 mr-1" /> Set limit</Button>
            {account.status === 'FROZEN'
              ? <Button size="sm" variant="outline" onClick={() => onSetStatus(account, 'ACTIVE')}><Sun className="h-4 w-4 mr-1" /> Unfreeze</Button>
              : account.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => onSetStatus(account, 'FROZEN')}><Snowflake className="h-4 w-4 mr-1" /> Freeze</Button>}
            <Button size="sm" variant="outline" className="text-tibetan border-tibetan/30 hover:bg-tibetan/10" onClick={() => onAction('adjust')}>Write-off</Button>
          </div>

          {/* Ledger */}
          {!detail ? <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div> : (
            <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-y-auto">
              {(detail.transactions || []).length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No transactions yet.</p>
              ) : detail.transactions.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{t.transaction_type}{t.payment_method ? ` · ${t.payment_method}` : ''}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{t.notes || ''} · {new Date(t.created_at).toLocaleString()}</p>
                  </div>
                  <p className={`text-xs font-bold shrink-0 ${t.transaction_type === 'DEBIT' ? 'text-amber-600' : t.transaction_type === 'CREDIT' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {t.transaction_type === 'DEBIT' ? '+' : t.transaction_type === 'CREDIT' ? '−' : ''}{money(t.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground w-20 text-right shrink-0">bal {money(t.balance_after)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PAY_METHODS = ['CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER']

function ActionModal({ mode, account, onClose, onDone, onError }) {
  const [form, setForm] = useState({
    amount: '', payment_method: 'CASH', reference_no: '',
    limit: String(account.credit_limit ?? ''), credit_term_days: String(account.credit_term_days ?? 30),
    type: 'WRITE_OFF', reason: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const title = { payment: 'Record payment', limit: 'Set credit limit', adjust: 'Adjust balance' }[mode]

  async function submit() {
    setBusy(true); onError(null)
    try {
      let url, body
      if (mode === 'payment') {
        url = `/api/console/khata/${account.id}/payment`
        body = { amount: Number(form.amount), payment_method: form.payment_method, reference_no: form.reference_no || undefined }
      } else if (mode === 'limit') {
        url = `/api/console/khata/${account.id}/credit-limit`
        body = { limit: Number(form.limit), credit_term_days: form.credit_term_days ? Number(form.credit_term_days) : undefined }
      } else {
        url = `/api/console/khata/${account.id}/adjust`
        body = { type: form.type, amount: Number(form.amount), reason: form.reason }
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onDone(`${title} — ${account.name} done`)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  const num = (k, ph) => <input type="number" min="0" step="0.01" placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring" />

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-serif font-bold">{title}</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
        <p className="text-xs text-muted-foreground truncate">{account.name} · owes {money(account.outstanding_balance)}</p>

        {mode === 'payment' && (
          <>
            <label className="text-xs text-muted-foreground">Amount received</label>{num('amount', '0.00')}
            <label className="text-xs text-muted-foreground">Method</label>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring">
              {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="text-xs text-muted-foreground">Reference (optional)</label>
            <Input value={form.reference_no} onChange={e => set('reference_no', e.target.value)} placeholder="txn / UTR ref" />
          </>
        )}
        {mode === 'limit' && (
          <>
            <label className="text-xs text-muted-foreground">Credit limit</label>{num('limit', '0.00')}
            <label className="text-xs text-muted-foreground">Payment term (days)</label>{num('credit_term_days', '30')}
          </>
        )}
        {mode === 'adjust' && (
          <>
            <label className="text-xs text-muted-foreground">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring">
              <option value="WRITE_OFF">Write off (reduce the balance)</option>
              <option value="CHARGE">Charge (add to the balance)</option>
            </select>
            <label className="text-xs text-muted-foreground">Amount</label>{num('amount', '0.00')}
            <label className="text-xs text-muted-foreground">Reason</label>
            <Input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="why" />
          </>
        )}

        <Button onClick={submit} disabled={busy} className="w-full">{busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : title}</Button>
      </div>
    </div>
  )
}
