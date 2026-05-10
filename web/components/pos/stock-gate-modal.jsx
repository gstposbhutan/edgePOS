"use client"

import { useState } from "react"
import { AlertTriangle, Plus, Trash2, Loader2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

/**
 * Shown during checkout when one or more cart items have insufficient stock.
 * Forces the cashier to either restock the item or remove it from the cart
 * before the order can be confirmed.
 *
 * @param {{
 *   open: boolean,
 *   shortfalls: Array<{ item: object, available: number, needed: number }>,
 *   entityId: string,
 *   onRestock: () => void,        called after successful restock so cart re-checks
 *   onRemoveItem: (id) => void,
 *   onClose: () => void
 * }} props
 */
export function StockGateModal({ open, shortfalls, entityId, onRestock, onRemoveItem, onClose }) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <DialogTitle className="font-serif">Insufficient Stock</DialogTitle>
          </div>
          <DialogDescription>
            The following items cannot be confirmed. Add stock or remove them to proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {shortfalls.map(({ item, available, needed }) => (
            <ShortfallRow
              key={item.id}
              item={item}
              available={available}
              needed={needed}
              entityId={entityId}
              onRestock={onRestock}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))}
        </div>

        <Button variant="outline" onClick={onClose} className="w-full mt-2">
          Back to Cart
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Individual shortfall row with inline restock form.
 */
function ShortfallRow({ item, available, needed, entityId, onRestock, onRemove }) {
  const supabase = createClient()

  const [showRestock, setShowRestock] = useState(false)
  const [qty,         setQty]         = useState('')
  const [batchNo,     setBatchNo]     = useState('')
  const [manufDate,   setManufDate]   = useState('')
  const [expiryDate,  setExpiryDate]  = useState('')
  const [barcode,     setBarcode]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const shortage = needed - available

  async function handleRestock(e) {
    e.preventDefault()
    setError(null)

    const quantity = parseInt(qty)
    if (!quantity || quantity <= 0) return setError('Enter a valid quantity')
    if (!batchNo.trim())           return setError('Batch number is required')

    setLoading(true)

    // Create batch record
    const { data: batch, error: batchError } = await supabase
      .from('product_batches')
      .insert({
        product_id:     item.product_id,
        entity_id:      entityId,
        batch_number:   batchNo.trim(),
        barcode:        barcode.trim() || null,
        manufactured_at: manufDate || null,
        expires_at:     expiryDate || null,
        quantity,
        status:         'ACTIVE',
        notes:          `Emergency restock during checkout — order item: ${item.name}`,
      })
      .select('id')
      .single()

    if (batchError) { setError(batchError.message); setLoading(false); return }

    // Record inventory movement linked to batch
    const { error: movError } = await supabase
      .from('inventory_movements')
      .insert({
        product_id:    item.product_id,
        entity_id:     entityId,
        movement_type: 'RESTOCK',
        quantity,
        batch_id:      batch.id,
        notes:         `Restock before checkout: ${item.name} (Batch ${batchNo})`,
      })

    if (movError) { setError(movError.message); setLoading(false); return }

    setLoading(false)
    setShowRestock(false)
    onRestock() // re-check all shortfalls
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Item summary */}
      <div className="flex items-center gap-3 p-3 bg-amber-500/5">
        <Package className="h-5 w-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
          <p className="text-xs text-amber-600">
            Need <strong>{needed}</strong> · Available <strong>{available}</strong> · Short by <strong>{shortage}</strong>
          </p>
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-tibetan transition-colors"
          title="Remove from cart"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Restock toggle */}
      {!showRestock ? (
        <button
          onClick={() => setShowRestock(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border"
        >
          <Plus className="h-3.5 w-3.5" /> Add Stock Now
        </button>
      ) : (
        <form onSubmit={handleRestock} className="p-3 border-t border-border space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Batch No. <span className="text-tibetan">*</span></label>
              <Input
                placeholder="e.g. BTH-2026-001"
                value={batchNo}
                onChange={e => setBatchNo(e.target.value)}
                className="h-7 text-xs"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Qty to Add <span className="text-tibetan">*</span></label>
              <Input
                type="number" min="1"
                placeholder={String(shortage)}
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="h-7 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Manuf. Date</label>
              <Input
                type="date"
                value={manufDate}
                onChange={e => setManufDate(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Expiry Date</label>
              <Input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-foreground">Barcode</label>
              <Input
                placeholder="Scan or enter barcode"
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRestock(false)}
              className="flex-1 h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              size="sm"
              className="flex-1 h-7 text-xs bg-primary hover:bg-primary/90"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Restock'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
