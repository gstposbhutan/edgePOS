"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, FileText, ChevronDown, ChevronRight, Loader2, Package, FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/**
 * Sales Orders & Quotations for the distributor / wholesaler consoles. Lists the SALES_ORDER records
 * this entity created (order_type SALES_ORDER, both binding orders and non-binding quotations). A
 * DRAFT one can be fulfilled into a Sales Invoice — that deducts stock, debits the buyer's khata on
 * credit, and receives the goods into the buyer. Create them from the Sell page.
 */
export function SalesOrders() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [openId, setOpenId]   = useState(null)
  const [acting, setActing]   = useState(null)
  const [notice, setNotice]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/console/sales')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.orders ?? [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const fulfil = useCallback(async (order) => {
    if (!window.confirm(`Fulfil ${order.order_no} into an invoice? This deducts your stock and, for a credit order, debits ${order.buyer_name || 'the buyer'}'s khata.`)) return
    setActing(order.id); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/console/sales/${order.id}/invoice`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fulfilment failed')
      setNotice(`Invoice ${data.invoice?.order_no || ''} created${data.warning ? ' — ' + data.warning : ''}`)
      await load()
    } catch (err) { setError(err.message) } finally { setActing(null) }
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Quotes &amp; Orders</h2>
          <p className="text-xs text-muted-foreground">{rows.length} sales order{rows.length === 1 ? '' : 's'} &amp; quotation{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {error && <p className="text-sm text-tibetan">{error}</p>}
      {notice && <p className="text-sm text-emerald">{notice}</p>}

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FileText className="h-12 w-12 opacity-20" />
            <p className="text-sm text-center max-w-xs">No quotes or sales orders yet — create one from the Sell page.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(o => (
              <SORow key={o.id} order={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} acting={acting === o.id} onFulfil={fulfil} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLES = {
  DRAFT:      'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  CONFIRMED:  'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  PARTIALLY_FULFILLED: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  CANCELLED:  'bg-tibetan/10 text-tibetan border border-tibetan/20',
}
function money(v) { return `Nu. ${parseFloat(v ?? 0).toFixed(2)}` }

function SORow({ order, open, onToggle, acting, onFulfil }) {
  const items = Array.isArray(order.items) ? order.items : []
  const statusClass = STATUS_STYLES[order.status] || STATUS_STYLES.DRAFT
  const canFulfil = order.status === 'DRAFT'
  return (
    <div className={order.status === 'CANCELLED' ? 'opacity-70' : ''}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
        <div className="text-muted-foreground shrink-0">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{order.buyer_name || 'Buyer'}</p>
            <Badge className={`${order.is_quotation ? 'bg-muted text-muted-foreground border border-border' : 'bg-primary/10 text-primary border border-primary/20'} text-[10px] px-1.5 py-0`}>
              {order.is_quotation ? 'Quote' : 'Order'}
            </Badge>
            <Badge className={`${statusClass} text-[10px] px-1.5 py-0`}>{order.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{order.order_no} · {new Date(order.created_at).toLocaleDateString()} · {order.payment_method}</p>
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
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0"><Package className="h-3.5 w-3.5 text-muted-foreground" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{it.name}</p>{it.sku && <p className="text-[10px] text-muted-foreground">{it.sku}</p>}</div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">{it.qty} × {money(it.rate)}</p>
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
          {canFulfil && (
            <div className="flex justify-end pt-2 border-t border-border">
              {acting
                ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fulfilling…</span>
                : <Button size="sm" onClick={() => onFulfil(order)}><FileCheck2 className="h-4 w-4 mr-1" /> Fulfil into invoice</Button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
