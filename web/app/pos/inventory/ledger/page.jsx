"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { getUser, getRoleClaims } from "@/lib/auth"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { REPORT_KEYS, withHandlers } from "@/lib/pos/office-keys"

// Stock Ledger (spec WF-09) — one product's movements, with the balance carried down.
//
// The Stock Register answers "what do I hold"; this answers "how did it get to that". A shop
// reaches for it when a number looks wrong: it reads down Balance until the figure stops making
// sense, and the row where it changed is the one to explain. That is why the period opens with an
// OPENING row rather than the first movement — without it the running balance is fiction.
const iso = (d) => d.toISOString().slice(0, 10)
const qty = (n) => (n == null ? '' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')

// What a movement means in a shop's words, not the enum's.
const PARTICULARS = {
  RESTOCK: 'Purchase / restock',
  RETURN:  'Customer return',
  SALE:    'Sale',
  DAMAGED: 'Damaged',
  LOSS:    'Loss / shrinkage',
  OPEN:    'Package opened',
}

const COLUMNS = [
  { key: 'date',        label: 'Date',        width: 110 },
  { key: 'particulars', label: 'Particulars' },
  { key: 'ref',         label: 'Reference',   width: 130 },
  { key: 'in_qty',      label: 'In Qty',      width: 100, align: 'right' },
  { key: 'out_qty',     label: 'Out Qty',     width: 100, align: 'right' },
  { key: 'balance',     label: 'Balance',     width: 110, align: 'right' },
]

export default function StockLedgerPage() {
  const router = useRouter()
  const today = new Date()
  const yearAgo = new Date(today.getTime() - 365 * 86400000)

  const [authed, setAuthed] = useState(false)
  const [products, setProducts] = useState([])
  const [productId, setProductId] = useState('')
  const [from, setFrom] = useState(iso(yearAgo))
  const [to, setTo] = useState(iso(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const productRef = useRef(null)
  const fromRef = useRef(null)

  useEffect(() => {
    async function guard() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { subRole } = getRoleClaims(user)
      if (subRole === 'CASHIER') return router.push('/pos')
      setAuthed(true)
    }
    guard()
  }, [])

  useEffect(() => {
    if (!authed) return
    // /api/products/sellable is the catalogue the till itself reads. It returns one row per
    // BATCH, so the same product appears several times — dedupe by product id for the picker.
    fetch('/api/products/sellable')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d?.products ?? d?.results ?? []
        const seen = new Map()
        for (const row of list) if (row?.id && !seen.has(row.id)) seen.set(row.id, row)
        setProducts([...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      })
      .catch(() => {})
  }, [authed])

  const load = useCallback(async () => {
    if (!productId) { setData(null); return }
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        product_id: productId,
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
      })
      const res = await fetch(`/api/pos/reports/stock-ledger?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load ledger')
      setData(d)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [productId, from, to])
  useEffect(() => { if (authed) load() }, [authed, load])

  // The opening balance is a row, not a caption — it is the first number in the Balance column and
  // every later balance is read against it.
  const rows = data ? [
    { id: '__opening', date: day(from), particulars: 'Opening Balance', ref: '', in_qty: '', out_qty: '', balance: qty(data.opening) },
    ...data.rows.map(r => ({
      id: r.id,
      date: day(r.date),
      particulars: PARTICULARS[r.type] ?? r.type,
      ref: r.reference_id ? String(r.reference_id).slice(0, 8) : (r.notes ? String(r.notes).slice(0, 18) : '—'),
      in_qty: qty(r.in_qty),
      out_qty: qty(r.out_qty),
      balance: qty(r.balance),
    })),
  ] : []

  const selected = products.find(p => p.id === productId)

  return (
    <OfficeShell
      crumb="Warehouse Management"
      title={selected ? `Stock Ledger — ${selected.name}` : 'Stock Ledger'}
      date={`${from} — ${to}`}
      keys={withHandlers(REPORT_KEYS, {
        F2: () => { fromRef.current?.focus(); fromRef.current?.select?.() },
        P: () => window.print(),
        'Ctrl+⇧L': () => router.push('/pos/stores'),
      })}
    >
      <div className="flex flex-wrap items-end gap-3 mb-3 text-[12px]">
        <label className="flex items-center gap-1.5">
          <span>Product</span>
          <select
            ref={productRef}
            value={productId}
            onChange={e => setProductId(e.target.value)}
            className="px-1.5 py-0.5 border bg-white min-w-[260px]"
            style={{ borderColor: 'var(--office-line)' }}
          >
            <option value="">Select a product…</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span>From</span>
          <input ref={fromRef} type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-1.5 py-0.5 border bg-white" style={{ borderColor: 'var(--office-line)' }} />
        </label>
        <label className="flex items-center gap-1.5">
          <span>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-1.5 py-0.5 border bg-white" style={{ borderColor: 'var(--office-line)' }} />
        </label>
        {data && (
          <span className="ml-auto opacity-75">
            opening {qty(data.opening)} · in {qty(data.totals.in)} · out {qty(data.totals.out)} · closing {qty(data.closing)}
            {selected?.unit ? ` ${selected.unit}` : ''}
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-[12px] text-red-700">{error}</p>}

      {!productId ? (
        <p className="text-[12px] opacity-60 p-4">Choose a product to read its ledger.</p>
      ) : loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={COLUMNS}
          rows={rows}
          totals={data ? { date: 'Closing', in_qty: qty(data.totals.in), out_qty: qty(data.totals.out), balance: qty(data.closing) } : undefined}
          empty="No movements in this period."
        />
      )}

      <p className="mt-2 text-[10px] opacity-60">
        Balance carries down from the opening figure. Quantities are in the product&apos;s stock unit.
      </p>
    </OfficeShell>
  )
}
