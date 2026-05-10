"use client"

import { useState } from "react"
import { Loader2, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const MOVEMENT_TYPES = [
  { id: 'RESTOCK',  label: 'Restock',  sign: +1, color: 'border-emerald-500 text-emerald-600', desc: 'Stock received from supplier' },
  { id: 'LOSS',     label: 'Loss',     sign: -1, color: 'border-tibetan text-tibetan',          desc: 'Stock lost or missing' },
  { id: 'DAMAGED',  label: 'Damaged',  sign: -1, color: 'border-amber-500 text-amber-600',      desc: 'Damaged / unsellable stock' },
  { id: 'TRANSFER', label: 'Transfer', sign: -1, color: 'border-blue-500 text-blue-600',        desc: 'Transferred to another location' },
]

/**
 * @param {{
 *   open: boolean,
 *   product: object|null,
 *   entityId: string,
 *   onAdjust: (productId, type, qty, notes) => Promise<{error}>,
 *   onReceive: (formData) => Promise<{error, batch}>,
 *   onClose: () => void
 * }} props
 */
export function AdjustStockModal({ open, product, entityId, onAdjust, onReceive, onClose }) {
  const [type,         setType]         = useState('RESTOCK')
  const [qty,          setQty]          = useState('')
  const [notes,        setNotes]        = useState('')
  // Restock-only batch pricing fields
  const [unitCost,     setUnitCost]     = useState('')
  const [mrp,          setMrp]          = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [batchNumber,  setBatchNumber]  = useState('')
  const [barcode,      setBarcode]      = useState('')
  const [mfgDate,      setMfgDate]      = useState('')
  const [expDate,      setExpDate]      = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)

  const selectedType = MOVEMENT_TYPES.find(t => t.id === type)
  const newStock     = product
    ? product.current_stock + (selectedType.sign * (parseInt(qty) || 0))
    : 0

  const sellingOverMrp = type === 'RESTOCK' && sellingPrice && mrp &&
    parseFloat(sellingPrice) > parseFloat(mrp)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const quantity = parseInt(qty)
    if (!quantity || quantity <= 0) {
      setError('Enter a valid quantity greater than 0')
      return
    }

    if (type === 'RESTOCK') {
      if (!mrp) { setError('MRP is required for restocking'); return }
      if (!sellingPrice) { setError('Selling price is required for restocking'); return }
      if (sellingOverMrp) { setError('Selling price cannot exceed MRP'); return }
    }

    setLoading(true)

    if (type === 'RESTOCK' && onReceive) {
      // Use the batch-aware receive endpoint
      const { error: recvErr } = await onReceive({
        product_id:      product.id,
        entity_id:       entityId,
        quantity,
        unit_cost:       unitCost       ? parseFloat(unitCost)       : undefined,
        mrp:             parseFloat(mrp),
        selling_price:   parseFloat(sellingPrice),
        batch_number:    batchNumber.trim() || undefined,
        barcode:         barcode.trim()     || undefined,
        manufactured_at: mfgDate            || undefined,
        expires_at:      expDate            || undefined,
        notes:           notes.trim() || `Restock — ${product.name}`,
      })
      if (recvErr) { setError(recvErr); setLoading(false); return }
    } else {
      const signedQty = selectedType.sign * quantity
      const { error: adjError } = await onAdjust(product.id, type, signedQty, notes || `${type} adjustment`)
      if (adjError) { setError(adjError); setLoading(false); return }
    }

    // Reset and close
    setQty(''); setNotes(''); setUnitCost(''); setMrp(''); setSellingPrice('')
    setBatchNumber(''); setBarcode(''); setMfgDate(''); setExpDate('')
    setLoading(false)
    onClose()
  }

  function handleClose() {
    setQty(''); setNotes(''); setUnitCost(''); setMrp(''); setSellingPrice('')
    setBatchNumber(''); setBarcode(''); setMfgDate(''); setExpDate('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Adjust Stock</DialogTitle>
          <DialogDescription>
            {product?.name} · Current stock: <strong>{product?.current_stock ?? 0} {product?.unit ?? 'pcs'}</strong>
            {product?.selling_price && (
              <> · Selling: <strong>Nu. {parseFloat(product.selling_price).toFixed(2)}</strong></>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Movement type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`
                    p-2.5 rounded-lg border text-left transition-all
                    ${type === t.id
                      ? `${t.color} bg-current/5`
                      : 'border-border text-muted-foreground hover:border-border/80'
                    }
                  `}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {t.sign === 1
                      ? <Plus className="h-3.5 w-3.5" />
                      : <Minus className="h-3.5 w-3.5" />
                    }
                    <span className="text-xs font-semibold">{t.label}</span>
                  </div>
                  <p className="text-[10px] opacity-70">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Quantity</label>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              autoFocus
            />
            {qty && parseInt(qty) > 0 && type !== 'RESTOCK' && (
              <p className="text-xs text-muted-foreground">
                New stock level:{' '}
                <span className={newStock < 0 ? 'text-tibetan font-semibold' : 'text-foreground font-semibold'}>
                  {newStock} {product?.unit ?? 'pcs'}
                </span>
                {newStock < 0 && ' ⚠ Cannot go below 0'}
              </p>
            )}
          </div>

          {/* Restock pricing fields */}
          {type === 'RESTOCK' && (
            <>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Batch Pricing</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Wholesale Price</label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={unitCost}
                      onChange={e => setUnitCost(e.target.value)}
                      placeholder="Nu. 0.00"
                    />
                    <p className="text-[10px] text-muted-foreground">What you paid</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">MRP <span className="text-tibetan">*</span></label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={mrp}
                      onChange={e => {
                        setMrp(e.target.value)
                        // Auto-fill selling price if empty
                        if (!sellingPrice) setSellingPrice(e.target.value)
                      }}
                      placeholder="Nu. 0.00"
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">On packaging</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Selling Price <span className="text-tibetan">*</span></label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={sellingPrice}
                      onChange={e => setSellingPrice(e.target.value)}
                      placeholder="Nu. 0.00"
                      className={sellingOverMrp ? 'border-tibetan' : ''}
                      required
                    />
                    {sellingOverMrp
                      ? <p className="text-[10px] text-tibetan font-medium">Cannot exceed MRP</p>
                      : <p className="text-[10px] text-muted-foreground">Charged to customer</p>
                    }
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Batch Details (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Batch Number</label>
                    <Input
                      value={batchNumber}
                      onChange={e => setBatchNumber(e.target.value)}
                      placeholder="Auto-generated if blank"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Barcode</label>
                    <Input
                      value={barcode}
                      onChange={e => setBarcode(e.target.value)}
                      placeholder="Scan or type"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Mfg Date</label>
                    <Input type="date" value={mfgDate} onChange={e => setMfgDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Expiry Date</label>
                    <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes <span className="text-muted-foreground">(optional)</span></label>
            <Input
              placeholder={type === 'RESTOCK' ? 'e.g. Delivery from Wholesaler A' : 'e.g. Found damaged in storage'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (newStock < 0 && selectedType?.sign === -1) || sellingOverMrp}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {loading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : type === 'RESTOCK' ? 'Receive Stock' : 'Confirm Adjustment'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
