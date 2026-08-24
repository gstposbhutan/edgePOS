"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CreateAccountModal } from "@/components/pos/khata/create-account-modal"
import { useKhata } from "@/hooks/use-khata"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// Khata — the credit ledger, read as Bills Receivable (spec WF-09).
//
// A shop chasing money reads this the way it reads a receivable register: every party on one
// screen, the outstanding column aligned so the big debts stand out of the column, and the
// total under it. Age is what turns a list into a chase list, so it is computed here from the
// last payment and printed as days rather than a date the reader has to subtract.
const money = (v) => parseFloat(v ?? 0).toFixed(2)

function ageDays(account) {
  const since = account.last_payment_at ?? account.created_at
  if (!since) return null
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
  return Number.isFinite(days) && days >= 0 ? days : null
}

const COLUMNS = [
  { key: 'name',        label: 'Account' },   // no width: this column absorbs the slack
  { key: 'phone',       label: 'Phone',       width: 130 },
  { key: 'party',       label: 'Type',        width: 100 },
  { key: 'status',      label: 'Status',      width: 90 },
  { key: 'limit',       label: 'Credit Limit', width: 120, align: 'right' },
  { key: 'term',        label: 'Term',        align: 'right', width: 70 },
  { key: 'outstanding', label: 'Outstanding', width: 130, align: 'right' },
  { key: 'age',         label: 'Age',         align: 'right', width: 70 },
]

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

  const rows = displayed.map(a => {
    const age = ageDays(a)
    return {
      id: a.id,
      _account: a,
      name: a.debtor_name || a.debtor_phone || '—',
      phone: a.debtor_phone ?? '—',
      party: a.party_type,
      status: a.status,
      limit: money(a.credit_limit),
      term: `${a.credit_term_days}d`,
      outstanding: money(a.outstanding_balance),
      age: age == null ? '—' : String(age),
    }
  })

  const totalOutstanding = displayed.reduce((sum, a) => sum + parseFloat(a.outstanding_balance ?? 0), 0)
  const totalLimit = displayed.reduce((sum, a) => sum + parseFloat(a.credit_limit ?? 0), 0)

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Bills Receivable (Khata)"
      keys={[
        ...(canCreate ? [{ key: 'N', label: 'New Account', onClick: () => setShowCreate(true) }] : []),
        ...withHandlers(REPORT_KEYS, { P: () => window.print(), 'Ctrl+⇧L': () => router.push('/pos/stores') }),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="px-1.5 py-0.5 border bg-white w-56"
            style={{ borderColor: 'var(--office-line)' }}
          />
        </label>
        <button type="button" onClick={fetchAccounts}
          className="px-2.5 py-1 text-[11px] border" style={{ borderColor: 'var(--office-line)', background: 'var(--office-panel-bg)' }}>
          Refresh
        </button>
        <span className="ml-auto opacity-75">
          {displayed.length} account{displayed.length === 1 ? '' : 's'}
          {search ? ` of ${accounts.length}` : ''}
        </span>
      </div>

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={COLUMNS}
          rows={rows}
          totals={{ name: 'Total', limit: money(totalLimit), outstanding: money(totalOutstanding) }}
          onOpen={(row) => router.push(`/pos/khata/${row.id}`)}
          openOnClick
          rowAttrs={(row) => ({
            'data-testid': 'khata-account-row',
            'data-account-id': row.id,
            'data-account-name': row._account.debtor_name || row._account.debtor_phone,
            'data-account-phone': row._account.debtor_phone,
          })}
          empty={search ? 'No accounts match your search.' : 'No khata accounts yet.'}
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Age counts days since the last payment, or since the account opened when none has been
        taken. Enter opens the selected account. Amounts in Nu.
      </p>

      <CreateAccountModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={createAccount}
      />
    </OfficeShell>
  )
}
