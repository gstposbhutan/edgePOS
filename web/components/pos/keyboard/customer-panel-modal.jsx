"use client"

import { useState, useEffect, useRef } from "react"
import { X, Search, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const TYPE_LABELS = {
  CONSUMER: 'Walk-in / Loyalty',
  RETAILER: 'B2B-Retailer',
  WHOLESALER: 'B2B-Wholesaler',
  SUPPLIER: 'Supplier',
}
const typeLabel = (t) => TYPE_LABELS[t] ?? t ?? '—'

/**
 * F6 customer panel. Lists the store's khata (credit) accounts with outstanding
 * balance, plus a Walk-in default (no account → cash sale).
 *
 * Credit/standing issues are flagged orange (deck item #9):
 *  - status === 'FROZEN'                              → blocked (row disabled, not selectable)
 *  - over-limit (outstanding_balance >= credit_limit) → orange + "please note…" tooltip, still
 *    selectable (a cash sale is valid; a credit sale is already blocked server-side by
 *    the khata_debit_on_confirm trigger).
 *
 * @param {{ accounts?: any[], selectedPhone: string|null, onSelect: (a: any|null) => void, onClose: () => void }} props
 */
export function CustomerPanelModal({ accounts = [], selectedPhone, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const term = q.trim().toLowerCase()
  const rows = accounts.filter(a => !term
    || (a.debtor_phone ?? '').toLowerCase().includes(term)
    || (a.debtor_name ?? '').toLowerCase().includes(term))

  const isFrozen = (a) => a.status === 'FROZEN'
  const isOverLimit = (a) => Number(a.credit_limit ?? 0) > 0
    && Number(a.outstanding_balance ?? 0) >= Number(a.credit_limit ?? 0)
  const bal = (a) => Number(a.outstanding_balance ?? 0)

  function rowClass(a, selected) {
    if (isFrozen(a)) return 'bg-tibetan/10 opacity-60 cursor-not-allowed'
    if (selected) return 'bg-primary/10 font-medium'
    if (isOverLimit(a)) return 'bg-tibetan/10 hover:bg-tibetan/15'
    return 'hover:bg-muted/40'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold">Select Customer</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onClose() }}
              placeholder="Search by mobile or name…"
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 border-b border-border">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2 w-32">Mobile No</th>
                <th className="text-left px-4 py-2">Customer Name</th>
                <th className="text-left px-4 py-2 w-32">Type</th>
                <th className="text-right px-4 py-2 w-32">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {/* Walk-in default (no account → cash sale) */}
              <tr
                onClick={() => onSelect(null)}
                className={`border-b border-border cursor-pointer transition-colors ${!selectedPhone ? 'bg-primary/10 font-medium' : 'hover:bg-muted/40'}`}
              >
                <td className="px-4 py-2.5 text-muted-foreground">—</td>
                <td className="px-4 py-2.5">Walk-in Customer</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">Walk-in</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">—</td>
              </tr>

              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No customers match “{q}”.
                  </td>
                </tr>
              )}

              {rows.map(a => {
                const frozen = isFrozen(a)
                const over = isOverLimit(a)
                const selected = !!selectedPhone && a.debtor_phone === selectedPhone
                return (
                  <tr
                    key={a.id}
                    onClick={() => { if (!frozen) onSelect(a) }}
                    title={frozen
                      ? 'Account frozen — cannot be selected'
                      : over
                        ? 'please note that this customer is over their credit limit'
                        : undefined}
                    className={`border-b border-border text-left transition-colors ${rowClass(a, selected)} ${frozen ? '' : 'cursor-pointer'}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{a.debtor_phone ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {a.debtor_name ?? '—'}
                      {frozen && <span className="ml-1.5 text-[10px] text-tibetan font-semibold uppercase">Frozen</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{typeLabel(a.party_type)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={bal(a) > 0 ? 'font-semibold text-tibetan' : 'text-muted-foreground'}>
                        Nu. {bal(a).toFixed(2)}
                      </span>
                      {over && (
                        <span className="flex items-center justify-end gap-0.5 text-[10px] text-tibetan">
                          <AlertTriangle className="h-2.5 w-2.5" /> over limit
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between shrink-0">
          <p className="text-[11px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm bg-tibetan/50 align-middle mr-1" />
            orange = credit / standing issue
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>Close (Esc)</Button>
        </div>
      </div>
    </div>
  )
}
