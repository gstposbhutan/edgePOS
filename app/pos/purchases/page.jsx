"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, RefreshCw, FileText, Receipt, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrderStatusBadge } from "@/components/pos/orders/order-status-badge"
import { usePurchases } from "@/hooks/use-purchases"

const PO_STATUS_STYLE = {
  DRAFT:               'bg-muted text-muted-foreground border-border',
  SENT:                'bg-blue-500/10 text-blue-600 border-blue-500/20',
  PARTIALLY_RECEIVED:  'bg-amber-500/10 text-amber-600 border-amber-500/20',
  CANCELLED:           'bg-tibetan/10 text-tibetan border-tibetan/20',
  CONFIRMED:           'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  PAID:                'bg-emerald-600/10 text-emerald-700 border-emerald-600/20',
}

function StatusBadge({ status }) {
  const style = PO_STATUS_STYLE[status] || 'bg-muted text-muted-foreground'
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${style}`}>
      {status}
    </span>
  )
}

export default function PurchasesPage() {
  const router = useRouter()
  const { purchases, loading, error, fetchPurchases } = usePurchases()
  const [tab, setTab] = useState('PO') // 'PO' | 'INVOICE'

  useEffect(() => { fetchPurchases({ type: tab }) }, [tab])

  const supplierName = (p) => p.seller?.name || p.supplier_name || 'Unknown Supplier'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold">Purchases</h1>
          <p className="text-xs text-muted-foreground">{purchases.length} {tab === 'PO' ? 'orders' : 'invoices'}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => fetchPurchases({ type: tab })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => router.push('/pos/purchases/new')} className="gap-1.5">
          <Plus className="h-4 w-4" /> New PO
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 flex gap-2 border-b border-border shrink-0">
        {[['PO', 'Purchase Orders', FileText], ['INVOICE', 'Purchase Invoices', Receipt]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-20" />
            <p className="text-sm">No {tab === 'PO' ? 'purchase orders' : 'invoices'} yet</p>
            {tab === 'PO' && <Button size="sm" onClick={() => router.push('/pos/purchases/new')}>Create First PO</Button>}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {purchases.map(p => (
              <button key={p.id} onClick={() => router.push(`/pos/purchases/${p.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-mono font-medium">{p.order_no}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate max-w-[160px]">{supplierName(p)}</span>
                    <span>·</span>
                    <span>{new Date(p.created_at).toLocaleDateString()}</span>
                    {p.expected_delivery && tab === 'PO' && (
                      <><span>·</span><span>Due {new Date(p.expected_delivery).toLocaleDateString()}</span></>
                    )}
                    {p.purchase_order_id && tab === 'INVOICE' && (
                      <span className="text-[10px] text-primary">← {p.purchase_order_id?.slice(0,8)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-primary">Nu. {parseFloat(p.grand_total).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{p.payment_method}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
