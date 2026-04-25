"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Package, AlertTriangle, XCircle, History, RefreshCw, TrendingUp, FileText, Camera } from "lucide-react"
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
import { useInventory }      from "@/hooks/use-inventory"
import { useStockPredictions } from "@/hooks/use-stock-predictions"
import { useDraftPurchases } from "@/hooks/use-draft-purchases"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

const TABS = [
  { id: 'stock',       label: 'Stock Levels', icon: Package },
  { id: 'drafts',      label: 'Draft Purchases', icon: FileText },
  { id: 'predictions', label: 'Predictions', icon: TrendingUp },
  { id: 'history',     label: 'Movement History', icon: History },
]

export default function InventoryPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [entityId,        setEntityId]        = useState(null)
  const [activeTab,       setActiveTab]       = useState('stock')
  const [adjustProduct,   setAdjustProduct]   = useState(null) // product to adjust
  const [leadTimeProduct, setLeadTimeProduct] = useState(null) // prediction for lead time
  const [scanOpen,        setScanOpen]        = useState(false)
  const [reviewingDraft,  setReviewingDraft]  = useState(null)
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
    lowCount, outCount, movements,
    adjustStock, fetchMovements, refresh,
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
        onAdjust={handleAdjust}
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
    </div>
  )
}
