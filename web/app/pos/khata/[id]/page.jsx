"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, RefreshCw, CreditCard, Settings, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { RecordPaymentModal } from "@/components/pos/khata/record-payment-modal"
import { AdjustBalanceModal } from "@/components/pos/khata/adjust-balance-modal"
import { useKhata } from "@/hooks/use-khata"
import { getUser, getRoleClaims } from "@/lib/auth"

export default function KhataDetailPage() {
  const router = useRouter()
  const { id: accountId } = useParams()

  const [entityId,  setEntityId]  = useState(null)
  const [subRole,   setSubRole]   = useState('CASHIER')
  const [account,   setAccount]   = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showPay,   setShowPay]   = useState(false)
  const [showAdj,   setShowAdj]   = useState(false)
  const [showLimit, setShowLimit] = useState(false)
  const [newLimit,  setNewLimit]  = useState('')
  const [limitErr,  setLimitErr]  = useState(null)

  const { fetchAccount, recordPayment, adjustBalance, setCreditLimit, setAccountStatus } = useKhata(entityId)

  const canPay     = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)
  const canManage  = ['OWNER', 'ADMIN'].includes(subRole)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
    }
    load()
  }, [])

  useEffect(() => {
    if (!entityId || !accountId) return
    loadAccount()
  }, [entityId, accountId])

  async function loadAccount() {
    setLoading(true)
    const { account: acc, transactions: txns } = await fetchAccount(accountId)
    setAccount(acc)
    setTransactions(txns)
    setLoading(false)
  }

  async function handleRecordPayment(amount, method, opts) {
    const user = await getUser()
    const { data: profile } = await (await import('@/lib/supabase/client')).createClient()
      .from('user_profiles').select('id').eq('id', user.id).single()

    return recordPayment(accountId, amount, method, {
      ...opts,
      profileId: profile?.id ?? user.id,
    })
  }

  async function handleAdjust(type, amount, reason) {
    const user = await getUser()
    const { data: profile } = await (await import('@/lib/supabase/client')).createClient()
      .from('user_profiles').select('id').eq('id', user.id).single()

    const result = await adjustBalance(accountId, type, amount, reason, profile?.id ?? user.id)
    if (!result.error) await loadAccount()
    return result
  }

  async function handleSetLimit() {
    setLimitErr(null)
    const user = await getUser()
    const { data: profile } = await (await import('@/lib/supabase/client')).createClient()
      .from('user_profiles').select('id').eq('id', user.id).single()

    const limit = parseFloat(newLimit)
    if (isNaN(limit) || limit < 0) {
      setLimitErr('Enter a valid limit')
      return
    }

    const { error } = await setCreditLimit(accountId, limit, profile?.id ?? user.id)
    if (error) {
      setLimitErr(error)
      return
    }

    setShowLimit(false)
    await loadAccount()
  }

  async function handleStatusChange(status) {
    const { error } = await setAccountStatus(accountId, status)
    if (!error) await loadAccount()
  }

  if (loading || !account) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const balance = parseFloat(account.outstanding_balance)
  const limit = parseFloat(account.credit_limit)
  const available = limit - balance

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/khata')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-serif font-bold text-foreground truncate">
            {account.debtor_name || account.debtor_phone}
          </h1>
          <p className="text-xs text-muted-foreground">{account.debtor_phone}</p>
        </div>
        <Badge variant="outline" className="text-[9px]">{account.party_type}</Badge>
        <Badge variant="outline" className={`text-[9px] ${
          account.status === 'ACTIVE' ? 'border-emerald-500 text-emerald-600' :
          account.status === 'FROZEN' ? 'border-amber-500 text-amber-600' :
          'border-muted text-muted-foreground'
        }`}>{account.status}</Badge>
        <Button variant="ghost" size="icon-sm" onClick={loadAccount}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 p-4 shrink-0">
        <div className="p-3 rounded-lg border border-border bg-card">
          <p className="text-[10px] text-muted-foreground">Outstanding</p>
          <p className="text-lg font-bold text-tibetan tabular-nums">Nu. {balance.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <p className="text-[10px] text-muted-foreground">Credit Limit</p>
          <p className="text-lg font-bold text-foreground tabular-nums">Nu. {limit.toFixed(2)}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <p className="text-[10px] text-muted-foreground">Available</p>
          <p className={`text-lg font-bold tabular-nums ${available > 0 ? 'text-emerald-600' : 'text-tibetan'}`}>
            Nu. {Math.max(0, available).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 pb-3 shrink-0">
        {canPay && (
          <Button size="sm" onClick={() => setShowPay(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <CreditCard className="h-4 w-4 mr-1" /> Record Payment
          </Button>
        )}
        {canManage && (
          <>
            <Button size="sm" variant="outline" onClick={() => { setNewLimit(String(limit)); setShowLimit(true) }}>
              <Settings className="h-4 w-4 mr-1" /> Set Limit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdj(true)}>
              Adjust Balance
            </Button>
            {account.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" className="text-amber-600" onClick={() => handleStatusChange('FROZEN')}>
                Freeze
              </Button>
            )}
            {account.status === 'FROZEN' && (
              <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => handleStatusChange('ACTIVE')}>
                Unfreeze
              </Button>
            )}
          </>
        )}
      </div>

      {/* Transaction ledger */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Transaction Ledger ({transactions.length})
        </p>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transactions yet</p>
        ) : (
          <div className="space-y-1">
            {transactions.map(txn => (
              <div key={txn.id} className="flex items-center gap-3 p-2 rounded-md text-xs border border-transparent hover:border-border transition-colors">
                <span className="text-muted-foreground w-20 shrink-0 tabular-nums">
                  {new Date(txn.created_at).toLocaleDateString()}
                </span>
                <Badge className={`text-[9px] shrink-0 ${
                  txn.transaction_type === 'DEBIT' ? 'bg-tibetan/10 text-tibetan' :
                  txn.transaction_type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-600' :
                  'bg-primary/10 text-primary'
                }`}>
                  {txn.transaction_type}
                </Badge>
                <span className="flex-1 text-muted-foreground truncate">
                  {txn.notes ?? (txn.order_id ? `Order` : txn.payment_method ?? '—')}
                </span>
                <span className={`font-medium tabular-nums shrink-0 w-20 text-right ${
                  txn.transaction_type === 'DEBIT' ? 'text-tibetan' :
                  txn.transaction_type === 'CREDIT' ? 'text-emerald-600' :
                  'text-primary'
                }`}>
                  {txn.transaction_type === 'CREDIT' ? '-' : '+'}Nu. {parseFloat(txn.amount).toFixed(2)}
                </span>
                <span className="text-muted-foreground tabular-nums shrink-0 w-24 text-right">
                  Bal: Nu. {parseFloat(txn.balance_after).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <RecordPaymentModal
        open={showPay}
        onClose={() => setShowPay(false)}
        onRecord={async (amount, method, opts) => {
          const result = await handleRecordPayment(amount, method, opts)
          if (!result.error) await loadAccount()
          return result
        }}
        outstandingBalance={balance}
        accountName={account.debtor_name || account.debtor_phone}
      />

      <AdjustBalanceModal
        open={showAdj}
        onClose={() => setShowAdj(false)}
        onAdjust={handleAdjust}
        outstandingBalance={balance}
        accountName={account.debtor_name || account.debtor_phone}
      />

      {/* Set Limit Dialog */}
      <Dialog open={showLimit}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="font-serif">Set Credit Limit</DialogTitle>
            <DialogDescription>
              Current limit: Nu. {limit.toFixed(2)}. Set to 0 to disable credit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              type="number"
              min="0"
              step="100"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              autoFocus
            />
            {limitErr && <p className="text-xs text-tibetan">{limitErr}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowLimit(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSetLimit} className="flex-1 bg-primary hover:bg-primary/90">Set Limit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
