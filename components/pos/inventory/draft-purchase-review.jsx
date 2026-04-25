"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Check, X, Search, Camera, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

/**
 * Draft Purchase Review — editable items table with confidence tiers,
 * product picker for unmatched items, confirm/cancel actions.
 *
 * @param {{
 *   draft: object,
 *   onUpdateItem: (draftId: string, updates: object) => Promise<object|null>,
 *   onConfirm: (draftId: string) => Promise<object>,
 *   onCancel: (draftId: string) => Promise<object>,
 *   onBack: () => void
 * }} props
 */
export function DraftPurchaseReview({ draft, onUpdateItem, onConfirm, onCancel, onBack }) {
  const [items, setItems] = useState(draft.draft_purchase_items ?? [])
  const [supplierName, setSupplierName] = useState(draft.supplier_name || '')
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [searching, setSearching] = useState(null)  // item id being searched
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const supabase = createClient()

  useEffect(() => {
    setItems(draft.draft_purchase_items ?? [])
    setSupplierName(draft.supplier_name || '')
  }, [draft])

  // Product search for unmatched items
  useEffect(() => {
    if (!searching || !searchQuery.trim()) { setSearchResults([]); return }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, mrp')
        .eq('entity_id', draft.entity_id)
        .eq('is_active', true)
        .ilike('name', `%${searchQuery}%`)
        .limit(10)

      setSearchResults(data ?? [])
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, searching, draft.entity_id])

  async function handleSelectProduct(itemId, product) {
    const updatedItems = items.map(i =>
      i.id === itemId
        ? { ...i, product_id: product.id, matched_name: product.name, match_confidence: 1, match_status: 'MATCHED' }
        : i
    )
    setItems(updatedItems)
    setSearching(null)
    setSearchQuery('')

    await onUpdateItem(draft.id, {
      items: [{ id: itemId, product_id: product.id, match_status: 'MATCHED' }],
    })
  }

  async function handleItemChange(itemId, field, value) {
    const updatedItems = items.map(i => {
      if (i.id !== itemId) return i
      const updated = { ...i, [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        updated.total_price = parseFloat((updated.quantity || 0) * (updated.unit_price || 0)).toFixed(2)
      }
      return updated
    })
    setItems(updatedItems)

    await onUpdateItem(draft.id, {
      items: [{ id: itemId, [field]: value, total_price: updatedItems.find(i => i.id === itemId).total_price }],
    })
  }

  async function handleConfirm() {
    setConfirming(true)
    await onConfirm(draft.id)
    setConfirming(false)
    onBack()
  }

  async function handleCancel() {
    setCancelling(true)
    await onCancel(draft.id)
    setCancelling(false)
    onBack()
  }

  const validItems = items.filter(i => i.product_id && i.match_status !== 'UNMATCHED')
  const unmatchedItems = items.filter(i => !i.product_id || i.match_status === 'UNMATCHED')
  const canConfirm = validItems.length > 0 && !confirming

  const totalMatched = validItems.reduce((s, i) => s + parseFloat(i.total_price || 0), 0)

  function confidenceBadge(confidence, matchStatus) {
    if (matchStatus === 'UNMATCHED' || !confidence) {
      return <Badge className="text-[10px] bg-tibetan/10 text-tibetan border-tibetan/20">No match</Badge>
    }
    if (confidence >= 0.85) {
      return <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
        {Math.round(confidence * 100)}%
      </Badge>
    }
    if (confidence >= 0.70) {
      return <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
        {Math.round(confidence * 100)}%
      </Badge>
    }
    return <Badge className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
      {Math.round(confidence * 100)}%
    </Badge>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-sm font-serif font-bold text-foreground">Review Draft Purchase</h2>
          <p className="text-xs text-muted-foreground">
            {new Date(draft.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            {draft.bill_date && ` — Bill: ${draft.bill_date}`}
          </p>
        </div>
        <Badge className={`text-[10px] ${
          draft.status === 'DRAFT' ? 'bg-slate-500/10 text-slate-600 border-slate-500/20' :
          draft.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
          'bg-amber-500/10 text-amber-600 border-amber-500/20'
        }`}>
          {draft.status}
        </Badge>
      </div>

      {/* Supplier */}
      <div className="p-3 rounded-lg border border-border bg-card space-y-2">
        <p className="text-xs text-muted-foreground">Supplier</p>
        {draft.status === 'DRAFT' ? (
          <Input
            value={supplierName}
            onChange={e => setSupplierName(e.target.value)}
            onBlur={() => onUpdateItem(draft.id, { supplier_name: supplierName })}
            placeholder="Enter supplier name"
            className="h-8 text-sm"
          />
        ) : (
          <p className="text-sm font-medium text-foreground">{supplierName || 'Unknown'}</p>
        )}
        {draft.bill_photo_url && (
          <a href={draft.bill_photo_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Camera className="h-3 w-3" /> View original bill
          </a>
        )}
      </div>

      {/* Unmatched warning */}
      {unmatchedItems.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-600">
              {unmatchedItems.length} unmatched item{unmatchedItems.length > 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Select the correct product for each unmatched item before confirming.
            </p>
          </div>
        </div>
      )}

      {/* Items table */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">
          Items ({items.length})
        </p>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`p-2.5 rounded-lg border bg-card space-y-2 ${
              item.match_status === 'UNMATCHED' ? 'border-tibetan/30' :
              item.match_confidence >= 0.85 ? 'border-emerald-500/30' :
              item.match_confidence >= 0.70 ? 'border-amber-500/30' :
              'border-yellow-500/30'
            }`}>
              {/* Row 1: product name + confidence */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.raw_name}</p>
                  {item.product_id && item.matched_name && item.matched_name !== item.raw_name && (
                    <p className="text-[10px] text-muted-foreground">
                      Matched: {item.matched_name || item.products?.name}
                    </p>
                  )}
                </div>
                {confidenceBadge(item.match_confidence, item.match_status)}
              </div>

              {/* Row 2: editable fields */}
              {draft.status === 'DRAFT' && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Qty</label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Unit Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="text-xs font-semibold text-primary">Nu. {parseFloat(item.total_price || 0).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {/* Row 3: product picker for unmatched */}
              {draft.status === 'DRAFT' && (!item.product_id || item.match_status === 'UNMATCHED') && (
                <div className="relative">
                  {searching === item.id ? (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        <Input
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search products..."
                          className="h-7 text-xs"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={() => { setSearching(null); setSearchQuery('') }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      {searchResults.length > 0 && (
                        <div className="border border-border rounded-md max-h-32 overflow-y-auto">
                          {searchResults.map(p => (
                            <button key={p.id}
                              onClick={() => handleSelectProduct(item.id, p)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/30 flex justify-between">
                              <span className="truncate">{p.name}</span>
                              <span className="text-muted-foreground shrink-0 ml-2">Nu. {p.mrp}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setSearching(item.id)}
                      className="text-[10px] h-6 border-primary/30 text-primary">
                      <Search className="h-3 w-3 mr-1" /> Assign product
                    </Button>
                  )}
                </div>
              )}

              {/* Read-only total for confirmed */}
              {draft.status !== 'DRAFT' && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.quantity} × Nu. {parseFloat(item.unit_price || 0).toFixed(2)}</span>
                  <span className="font-semibold text-primary">Nu. {parseFloat(item.total_price || 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      {draft.status === 'DRAFT' && (
        <div className="space-y-3 pt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {validItems.length} of {items.length} items matched — Total: Nu. {totalMatched.toFixed(2)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={cancelling}
              className="flex-1 border-tibetan/30 text-tibetan hover:bg-tibetan/5">
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Cancel Draft
            </Button>
            <Button onClick={handleConfirm} disabled={!canConfirm}
              className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Confirm Restock ({validItems.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
