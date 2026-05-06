"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Search, RefreshCw, Plus, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CreateAccountModal } from "@/components/pos/khata/create-account-modal"
import { useKhata } from "@/hooks/use-khata"
import { getUser, getRoleClaims } from "@/lib/auth"

const STATUS_COLORS = {
  ACTIVE:  'border-emerald-500 text-emerald-600',
  FROZEN:  'border-amber-500 text-amber-600',
  CLOSED:  'border-muted text-muted-foreground',
}

export default function KhataPage() {
  const router = useRouter()

  const [entityId,  setEntityId]  = useState(null)
  const [subRole,   setSubRole]   = useState('CASHIER')
  const [search,    setSearch]    = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      if (sr === 'CASHIER') return router.push('/pos')
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
    }
    load()
  }, [])

  const { accounts, loading, fetchAccounts, createAccount } = useKhata(entityId)

  const canCreate = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)

  const displayed = accounts.filter(a =>
    !search.trim() ||
    (a.debtor_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.debtor_phone ?? '').includes(search)
  )

  async function handleCreate(data) {
    return createAccount(data)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold text-foreground">Khata (Credit)</h1>
          <p className="text-xs text-muted-foreground">{accounts.length} accounts</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={fetchAccounts}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Account list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <Wallet className="h-8 w-8 opacity-20" />
            <p className="text-sm">{search ? 'No accounts match your search' : 'No khata accounts yet'}</p>
            {canCreate && !search && (
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create first account
              </Button>
            )}
          </div>
        ) : (
          displayed.map(account => (
            <button
              key={account.id}
              onClick={() => router.push(`/pos/khata/${account.id}`)}
              className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {account.debtor_name || account.debtor_phone}
                  </span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {account.party_type}
                  </Badge>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 ${STATUS_COLORS[account.status] ?? ''}`}>
                  {account.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-muted-foreground">
                  {account.debtor_phone ?? '—'}
                </span>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className={`text-sm font-semibold tabular-nums ${
                    parseFloat(account.outstanding_balance) > 0 ? 'text-tibetan' : 'text-emerald-600'
                  }`}>
                    Nu. {parseFloat(account.outstanding_balance).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-muted-foreground">
                  Limit: Nu. {parseFloat(account.credit_limit).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Term: {account.credit_term_days}d
                </span>
                {account.last_payment_at && (
                  <span className="text-[10px] text-muted-foreground">
                    Last pay: {new Date(account.last_payment_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <CreateAccountModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
