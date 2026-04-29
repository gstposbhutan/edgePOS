"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Package, AlertTriangle, XCircle, History, RefreshCw, TrendingUp, FileText, Camera, Layers, PackagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { StockTable }        from "@/components/pos/inventory/stock-table"
import { AdjustStockModal }  from "@/components/pos/inventory/adjust-stock-modal"
import { MovementHistory }   from "@/components/pos/inventory/movement-history"
import { PredictionTab }     from "@/components/pos/inventory/prediction-tab"
import { LeadTimeModal }     from "@/components/pos/inventory/lead-time-modal"
import { ScanBillModal }     from "@/components/pos/inventory/scan-bill-modal"
import { DraftPurchaseReview } from "@/components/pos/inventory/draft-purchase-review"
import { DraftPurchasesList }  from "@/components/pos/inventory/draft-purchases-list"
import { ReceiveStockModal }   from "@/components/pos/inventory/receive-stock-modal"
import { useInventory }      from "@/hooks/use-inventory"
import { useStockPredictions } from "@/hooks/use-stock-predictions"
import { useDraftPurchases } from "@/hooks/use-draft-purchases"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

const TABS = [
  { id: 'stock',       label: 'Stock Levels',    icon: Package },
  { id: 'batches',     label: 'Batches',          icon: Layers },
  { id: 'drafts',      label: 'Draft Purchases',  icon: FileText },
  { id: 'predictions', label: 'Predictions',      icon: TrendingUp },
  { id: 'history',     label: 'Movement History', icon: History },
]

export default function InventoryPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [entityId,        setEntityId]        = useState(null)
  const [activeTab,       setActiveTab]       = useState('stock')
  const [adjustProduct,   setAdjustProduct]   = useState(null)
  const [leadTimeProduct, setLeadTimeProduct] = useState(null)
  const [scanOpen,        setScanOpen]        = useState(false)
  const [reviewingDraft,  setReviewingDraft]  = useState(null)
  const [receiveOpen,     setReceiveOpen]     = useState(false)
  const [userId,          setUserId]          = useState(null)
  const [search,          setSearch]          = useState('')

  // Load entity on mount
  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid } = getRoleClaims(user)
      setEntityId(eid)
      setUserId(user.id)
    }
    load()
  }, [])

  const {
    products, loading, filter, setFilter,
    lowCount, outCount, movements, batches,
    adjustStock, fetchMovements, fetchBatches, receiveStock, refresh,
  } = useInventory(entityId)

  const {
    predictions, summary: predSummary, calculatedAt,
    loading: predLoading, refreshing,
    fetchPredictions, refreshPredictions, setLeadTime,
  } = useStockPredictions(entityId)

  const {
    drafts, loading: draftLoading, fetchDrafts, fetchDraft, updateDraft, confirmDraft, cancelDraft,
  } = useDraftPurchases(entityId)

  // Load movements when tab switches
  useEffect(() => {
    if (activeTab === 'history' && entityId) fetchMovements()
    if (activeTab === 'predictions' && entityId) fetchPredictions()
    if (activeTab === 'drafts' && entityId) fetchDrafts()
    if (activeTab === 'batches' && entityId) fetchBatches()
  }, [activeTab, entityId])

  // Client-side search filter
  const displayed = products.filter(p =>
    !search.trim() ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleAdjust(productId, type, qty, notes) {
    const result = await adjustStock(productId, type, qty, notes)
    if (!result.error && activeTab === 'history') fetchMovements()
    return result
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold text-foreground">Inventory</h1>
          <p className="text-xs text-muted-foreground">Stock management & adjustments</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Alert banners */}
      {(outCount > 0 || lowCount > 0) && (
        <div className="px-4 pt-3 space-y-2 shrink-0">
          {outCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <XCircle className="h-4 w-4 text-tibetan shrink-0" />
              <p className="text-xs text-tibetan font-medium">
                {outCount} product{outCount > 1 ? 's' : ''} out of stock
              </p>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-tibetan text-xs"
                onClick={() => setFilter('OUT')}
              >
                View
              </Button>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-600 font-medium">
                {lowCount} product{lowCount > 1 ? 's' : ''} running low (≤10 units)
              </p>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-amber-600 text-xs"
                onClick={() => setFilter('LOW')}
              >
                View
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 shrink-0 border-b border-border pb-0">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'stock' && (
          <>
            {/* Filter + search bar */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="Search by name or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setReceiveOpen(true)}
                  className="gap-1.5 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/5">
                  <PackagePlus className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Receive</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setScanOpen(true)}
                  className="border-primary/30 text-primary hover:bg-primary/5">
                  <Camera className="h-4 w-4" />
                </Button>
                {['ALL', 'LOW', 'OUT'].map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                    className={filter === f ? 'bg-primary' : ''}
                  >
                    {f === 'ALL' ? 'All' : f === 'LOW' ? `Low (${lowCount})` : `Out (${outCount})`}
                  </Button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <StockTable
                products={displayed}
                onAdjust={setAdjustProduct}
              />
            )}
          </>
        )}

        {activeTab === 'predictions' && (
          <PredictionTab
            predictions={predictions}
            summary={predSummary}
            calculatedAt={calculatedAt}
            loading={predLoading}
            refreshing={refreshing}
            onRefresh={refreshPredictions}
            onSetLeadTime={setLeadTimeProduct}
          />
        )}

        {activeTab === 'history' && (
          <MovementHistory movements={movements} loading={loading} />
        )}

        {activeTab === 'batches' && (
          <BatchesTab batches={batches} onRefresh={fetchBatches} entityId={entityId} />
        )}

        {activeTab === 'drafts' && (
          reviewingDraft ? (
            <DraftPurchaseReview
              draft={reviewingDraft}
              onUpdateItem={updateDraft}
              onConfirm={confirmDraft}
              onCancel={cancelDraft}
              onBack={() => { setReviewingDraft(null); fetchDrafts() }}
            />
          ) : (
            <DraftPurchasesList
              drafts={drafts}
              loading={draftLoading}
              onSelectDraft={setReviewingDraft}
              onScanBill={() => setScanOpen(true)}
            />
          )
        )}
      </div>

      {/* Adjust modal */}
      <AdjustStockModal
        open={!!adjustProduct}
        product={adjustProduct}
        entityId={entityId}
        onAdjust={handleAdjust}
        onReceive={receiveStock}
        onClose={() => setAdjustProduct(null)}
      />

      {/* Lead time modal */}
      <LeadTimeModal
        open={!!leadTimeProduct}
        prediction={leadTimeProduct}
        onSave={async (productId, supplierId, days, notes) => {
          const result = await setLeadTime(productId, supplierId, days, notes)
          if (!result.error) {
            setLeadTimeProduct(null)
            await refreshPredictions()
          }
          return result
        }}
        onClose={() => setLeadTimeProduct(null)}
      />

      {/* Scan bill modal */}
      <ScanBillModal
        open={scanOpen}
        entityId={entityId}
        createdBy={userId}
        onDraftCreated={(draft) => {
          setScanOpen(false)
          setReviewingDraft(draft)
          setActiveTab('drafts')
        }}
        onClose={() => setScanOpen(false)}
      />

      {/* Receive Stock modal */}
      <ReceiveStockModal
        open={receiveOpen}
        entityId={entityId}
        onReceive={receiveStock}
        onClose={() => setReceiveOpen(false)}
      />
    </div>
  )
}

// ── Batches Tab ───────────────────────────────────────────────────────────────
function BatchesTab({ batches, onRefresh, entityId }) {
  useEffect(() => { if (entityId) onRefresh() }, [entityId])

  const STATUS_STYLE = {
    ACTIVE:   'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    DEPLETED: 'text-muted-foreground bg-muted/30 border-border',
    EXPIRED:  'text-tibetan bg-tibetan/10 border-tibetan/20',
    RECALLED: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  }

  if (!batches.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
        <Layers className="h-10 w-10 opacity-20" />
        <p className="text-sm">No batches recorded yet. Use "Receive Stock" to add your first batch.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <th className="text-left px-4 py-2 font-medium">Product</th>
            <th className="text-left px-4 py-2 font-medium">Batch #</th>
            <th className="text-left px-4 py-2 font-medium">Barcode</th>
            <th className="text-right px-4 py-2 font-medium">Qty</th>
            <th className="text-right px-4 py-2 font-medium">Cost</th>
            <th className="text-right px-4 py-2 font-medium">MRP</th>
            <th className="text-right px-4 py-2 font-medium">Selling</th>
            <th className="text-left px-4 py-2 font-medium">Exp Date</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {batches.map(batch => {
            const isExpiringSoon = batch.expires_at &&
              new Date(batch.expires_at) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            return (
              <tr key={batch.id} className="border-b border-border hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <p className="font-medium truncate max-w-[160px]">{batch.products?.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{batch.products?.sku}</p>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{batch.batch_number}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{batch.barcode || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{batch.quantity}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {batch.unit_cost ? `Nu. ${parseFloat(batch.unit_cost).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {batch.mrp ? `Nu. ${parseFloat(batch.mrp).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                  {batch.selling_price ? `Nu. ${parseFloat(batch.selling_price).toFixed(2)}` : '—'}
                </td>
                <td className={`px-4 py-2.5 text-xs ${isExpiringSoon && batch.status === 'ACTIVE' ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                  {batch.expires_at ? new Date(batch.expires_at).toLocaleDateString() : '—'}
                  {isExpiringSoon && batch.status === 'ACTIVE' && ' ⚠'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[batch.status] || ''}`}>
                    {batch.status}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
