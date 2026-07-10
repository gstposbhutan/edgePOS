"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Inbox, ChevronDown, ChevronRight, Loader2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// What the seller can do next from a given status (mirrors the /api/console/orders/[id] state machine).
const NEXT_ACTIONS = {
  CONFIRMED:  [{ to: 'PROCESSING', label: 'Start processing' }, { to: 'DISPATCHED', label: 'Mark dispatched' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  PROCESSING: [{ to: 'DISPATCHED', label: 'Mark dispatched' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  DISPATCHED: [{ to: 'DELIVERED', label: 'Mark delivered' }],
  DELIVERED:  [{ to: 'COMPLETED', label: 'Mark completed' }],
}

/**
 * Incoming-orders section for the distributor / wholesaler consoles. Lists the orders where this
 * entity is the seller (everything from /api/console/orders is already scoped to seller_id =
 * the caller's entity). Each row shows the buyer, order no., total, status and date, and expands
 * to the line items with the seller's fulfilment actions (process → dispatch → deliver → complete,
 * or cancel). Cancelling returns stock on both sides and reverses the buyer's khata.
 */
export function IncomingOrders() {
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [filter,   setFilter]   = useState('')      // status filter ('' = all)
  const [openId,   setOpenId]   = useState(null)    // expanded order id
  const [acting,   setActing]   = useState(null)    // order id mid-action

  const load = useCallback(async (status) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/console/orders?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load orders')
      setRows(data.orders ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(filter) }, [load, filter])

  const act = useCallback(async (order, to) => {
    let reason = null
    if (to === 'CANCELLED') {
      reason = window.prompt(`Cancel order ${order.order_no}? This returns stock and reverses any credit.\n\nReason (optional):`, '')
      if (reason === null) return   // dismissed the prompt
    }
    setActing(order.id)
    setError(null)
    try {
      const res = await fetch(`/api/console/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, reason: reason || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      await load(filter)
    } catch (err) {
      setError(err.message)
    } finally {
      setActing(null)
    }
  }, [load, filter])

  return (
    <div className="space-y-4">
      {/* Heading + filter + refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Incoming Orders</h2>
          <p className="text-xs text-muted-foreground">{rows.length} order{rows.length === 1 ? '' : 's'} placed with you</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
        >
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="DELIVERED">Delivered</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Button variant="ghost" size="icon-sm" onClick={() => load(filter)} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-tibetan">{error}</p>}

      {/* List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Inbox className="h-12 w-12 opacity-20" />
            <p className="text-sm">No incoming orders yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(o => (
              <OrderRow
                key={o.id}
                order={o}
                open={openId === o.id}
                onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                acting={acting === o.id}
                onAction={act}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLES = {
  DRAFT:      'bg-muted text-muted-foreground border border-border',
  CONFIRMED:  'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  PROCESSING: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  DISPATCHED: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  DELIVERED:  'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  COMPLETED:  'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  CANCELLED:  'bg-tibetan/10 text-tibetan border border-tibetan/20',
}

function money(v) {
  return `Nu. ${parseFloat(v ?? 0).toFixed(2)}`
}

function OrderRow({ order, open, onToggle, acting, onAction }) {
  const items = Array.isArray(order.items) ? order.items : []
  const statusClass = STATUS_STYLES[order.status] || STATUS_STYLES.DRAFT
  const actions = NEXT_ACTIONS[order.status] || []

  return (
    <div className={!order.status || order.status === 'CANCELLED' ? 'opacity-70' : ''}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="text-muted-foreground shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{order.buyer_name}</p>
            <Badge className={`${statusClass} text-[10px] px-1.5 py-0`}>{order.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {order.order_no} · {new Date(order.created_at).toLocaleDateString()} · {order.payment_method}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary">{money(order.grand_total)}</p>
          <p className="text-[10px] text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</p>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pl-11 space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No line items recorded.</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{it.name}</p>
                    {it.sku && <p className="text-[10px] text-muted-foreground">{it.sku}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {it.qty} × {money(it.rate)}
                  </p>
                  <p className="text-xs font-medium w-20 text-right">{money(it.total)}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-6 text-xs pt-1">
            <span className="text-muted-foreground">Subtotal <span className="text-foreground font-medium">{money(order.subtotal)}</span></span>
            <span className="text-muted-foreground">GST (5%) <span className="text-foreground font-medium">{money(order.gst_total)}</span></span>
            <span className="text-muted-foreground">Total <span className="text-primary font-bold">{money(order.grand_total)}</span></span>
          </div>

          {/* Fulfilment actions (seller) */}
          {actions.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              {acting ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</span>
              ) : actions.map(a => (
                <Button
                  key={a.to}
                  size="sm"
                  variant={a.danger ? 'outline' : 'default'}
                  className={a.danger ? 'text-tibetan border-tibetan/30 hover:bg-tibetan/10' : ''}
                  onClick={() => onAction(order, a.to)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
