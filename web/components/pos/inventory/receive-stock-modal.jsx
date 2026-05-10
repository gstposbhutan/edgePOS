"use client"

import { useState, useEffect, useRef } from "react"
import { Search, Loader2, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

export function ReceiveStockModal({ open, entityId, onReceive, onClose }) {
  const supabase = createClient()

  const [productQuery, setProductQuery]   = useState('')
  const [productResults, setProductResults] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searching, setSearching]         = useState(false)

  const [quantity,     setQuantity]     = useState('')
  const [unitCost,     setUnitCost]     = useState('')
  const [mrp,          setMrp]          = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [batchNumber,  setBatchNumber]  = useState('')
  const [barcode,      setBarcode]      = useState('')
  const [mfgDate,      setMfgDate]      = useState('')
  const [expDate,      setExpDate]      = useState('')
  const [notes,        setNotes]        = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(null)

  const searchRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setProductQuery(''); setProductResults([]); setSelectedProduct(null)
      setQuantity(''); setUnitCost(''); setMrp(''); setSellingPrice('')
      setBatchNumber(''); setBarcode(''); setMfgDate(''); setExpDate('')
      setNotes(''); setError(null); setSuccess(null)
    } else {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced product search
  useEffect(() => {
    if (!productQuery.trim() || selectedProduct) { setProductResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, mrp, selling_price, wholesale_price, current_stock')
        .or(`name.ilike.%${productQuery}%,sku.ilike.%${productQuery}%`)
        .eq('is_active', true)
        .limit(8)
      setProductResults(data || [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [productQuery, selectedProduct])

  function selectProduct(product) {
    setSelectedProduct(product)
    setProductQuery(product.name)
    setProductResults([])
    // Pre-fill current prices as reference
    if (product.mrp)           setMrp(String(product.mrp))
    if (product.selling_price) setSellingPrice(String(product.selling_price))
    if (product.wholesale_price) setUnitCost(String(product.wholesale_price))
  }

  const sellingOverMrp = sellingPrice && mrp && parseFloat(sellingPrice) > parseFloat(mrp)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedProduct) { setError('Select a product'); return }
    if (sellingOverMrp)   { setError('Selling price cannot exceed MRP'); return }

    setLoading(true); setError(null)
    const result = await onReceive({
      product_id:      selectedProduct.id,
      entity_id:       entityId,
      quantity:        parseInt(quantity, 10),
      unit_cost:       unitCost       ? parseFloat(unitCost)       : undefined,
      mrp:             parseFloat(mrp),
      selling_price:   parseFloat(sellingPrice),
      batch_number:    batchNumber.trim() || undefined,
      barcode:         barcode.trim()     || undefined,
      manufactured_at: mfgDate            || undefined,
      expires_at:      expDate            || undefined,
      notes:           notes.trim()       || undefined,
    })
    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess({ batchNumber: result.batch?.batch_number, productName: selectedProduct.name })
    }
  }

  if (success) {
    return (
      <Dialog open={open}>
        <DialogContent>
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="h-14 w-14 text-emerald-500" />
            <h3 className="text-lg font-semibold">Stock Received</h3>
            <p className="text-sm text-muted-foreground text-center">
              <strong>{success.productName}</strong> — Batch {success.batchNumber}
            </p>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => {
                setSuccess(null)
                setProductQuery(''); setSelectedProduct(null)
                setQuantity(''); setUnitCost(''); setMrp(''); setSellingPrice('')
                setBatchNumber(''); setBarcode(''); setMfgDate(''); setExpDate(''); setNotes('')
                setTimeout(() => searchRef.current?.focus(), 50)
              }}>
                Receive Another
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Receive Stock</DialogTitle>
          <DialogDescription>Record a new stock receipt and set batch pricing.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Product search */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product <span className="text-tibetan">*</span></label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={productQuery}
                onChange={e => { setProductQuery(e.target.value); setSelectedProduct(null) }}
                placeholder="Search product name or SKU..."
                className="pl-9"
              />
            </div>
            {productResults.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden shadow-md">
                {productResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProduct(p)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left border-b border-border last:border-0"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku} · Stock: {p.current_stock}</p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-2">MRP Nu.{p.mrp}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct && (
              <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-emerald-700">{selectedProduct.name}</span>
                <button type="button" onClick={() => { setSelectedProduct(null); setProductQuery('') }} className="ml-auto text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantity <span className="text-tibetan">*</span></label>
            <Input
              type="number" min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="Units received"
              required
            />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Wholesale Price</label>
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
                onChange={e => setMrp(e.target.value)}
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

          {/* Batch details */}
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
                  placeholder="Scan or type barcode"
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
            <div className="mt-3 space-y-1.5">
              <label className="text-sm text-muted-foreground">Notes</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <p className="text-xs text-tibetan">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              disabled={loading || !selectedProduct || sellingOverMrp}
              className="flex-1"
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Receiving...</> : 'Receive Stock'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
