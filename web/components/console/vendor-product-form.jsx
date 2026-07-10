"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'btl', 'box', 'pack', 'dozen', 'pair', 'set', 'roll', 'sheet', 'bag', 'can', 'tube', 'sachet']

const EMPTY_FORM = {
  name: '', sku: '', hsn_code: '', unit: 'pcs',
  wholesale_price: '', mrp: '', distributor_price: '', manufacturer_price: '',
  current_stock: '0', reorder_point: '10',
  sold_by_weight: false,
  batch_number: '', manufactured_at: '', expires_at: '',
}

/**
 * Add / Edit product modal for the vendor (distributor / wholesaler) consoles.
 *
 * Distinct from the retailer ProductForm: here the vendor sets their B2B prices directly
 * (wholesale_price + mrp), and a distributor additionally sets distributor_price. Stock is an
 * opening-quantity field on create only — edits don't touch stock (matches the retailer flow).
 *
 * @param {{
 *   open: boolean,
 *   product: object|null,        null = new product
 *   categories: object[],
 *   saving: boolean,
 *   role: string,                entity role — 'DISTRIBUTOR' unlocks distributor_price
 *   onSave: (formData, categoryIds) => Promise<{error}>,
 *   onClose: () => void
 * }} props
 */
export function VendorProductForm({ open, product, categories, saving, role, onSave, onClose }) {
  const isEdit = !!product
  const isDistributor = role === 'DISTRIBUTOR'

  const [form,         setForm]         = useState(EMPTY_FORM)
  const [selectedCats, setSelectedCats] = useState([])
  const [error,        setError]        = useState(null)

  // Populate form when editing (sync the incoming product prop into local form state)
  useEffect(() => {
    if (product) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name:              product.name ?? '',
        sku:               product.sku ?? '',
        hsn_code:          product.hsn_code ?? '',
        unit:              product.unit ?? 'pcs',
        wholesale_price:   product.wholesale_price != null ? String(product.wholesale_price) : '',
        mrp:               product.mrp != null ? String(product.mrp) : '',
        distributor_price: product.distributor_price != null ? String(product.distributor_price) : '',
        manufacturer_price: product.manufacturer_price != null ? String(product.manufacturer_price) : '',
        current_stock:     String(product.current_stock ?? '0'),
        reorder_point:     String(product.reorder_point ?? '10'),
        sold_by_weight:    product.sold_by_weight ?? false,
        batch_number: '', manufactured_at: '', expires_at: '',
      })
      setSelectedCats((product.product_categories ?? []).map(pc => pc.category_id))
    } else {
      setForm(EMPTY_FORM)
      setSelectedCats([])
    }
    setError(null)
  }, [product, open])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleCat(id) {
    setSelectedCats(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim())     return setError('Product name is required')
    if (!form.hsn_code.trim()) return setError('HSN code is required for GST compliance')

    const { error: saveError } = await onSave(form, selectedCats)
    if (saveError) setError(saveError)
    else handleClose()
  }

  function handleClose() {
    setForm(EMPTY_FORM)
    setSelectedCats([])
    setError(null)
    onClose()
  }

  const priceLabel = `${form.sold_by_weight ? `Rate / ${form.unit}` : 'Price'}`

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the product you supply.' : 'Add a product you supply. HSN code is required for GST compliance.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name + SKU + HSN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium text-foreground">Product Name <span className="text-tibetan">*</span></label>
              <Input
                placeholder="e.g. Wai Wai Noodles 75g"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
                autoFocus={!isEdit}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">SKU</label>
              <Input
                placeholder="e.g. WWN-075"
                value={form.sku}
                onChange={e => set('sku', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">HSN Code <span className="text-tibetan">*</span></label>
              <Input
                placeholder="e.g. 1902"
                value={form.hsn_code}
                onChange={e => set('hsn_code', e.target.value)}
                required
              />
            </div>
          </div>

          {/* B2B pricing — editable here (vendor sets their own rates) */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">B2B Pricing</p>
            <div className={`grid gap-3 ${isDistributor ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Wholesale {priceLabel}</label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  placeholder="0.00"
                  value={form.wholesale_price}
                  onChange={e => set('wholesale_price', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Rate retailers buy at</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">MRP</label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  placeholder="0.00"
                  value={form.mrp}
                  onChange={e => set('mrp', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Max retail price</p>
              </div>
              {isDistributor && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Distributor {priceLabel}</label>
                  <Input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    placeholder="0.00"
                    value={form.distributor_price}
                    onChange={e => set('distributor_price', e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">3rd-tier rate</p>
                </div>
              )}
            </div>

            {/* Cost + margin */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Manufacturer cost</label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                  value={form.manufacturer_price}
                  onChange={e => set('manufacturer_price', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">What you pay to buy it</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Margin</label>
                {(() => {
                  const cost = parseFloat(form.manufacturer_price)
                  const sell = parseFloat(isDistributor ? form.distributor_price : form.wholesale_price)
                  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(sell) || sell <= 0) {
                    return <p className="h-9 flex items-center text-sm text-muted-foreground">—</p>
                  }
                  const m = sell - cost
                  const pct = (m / sell) * 100
                  return <p className={`h-9 flex items-center text-sm font-semibold ${m >= 0 ? 'text-emerald-600' : 'text-tibetan'}`}>Nu. {m.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground ml-1">({pct.toFixed(0)}%)</span></p>
                })()}
                <p className="text-[10px] text-muted-foreground">Your {isDistributor ? 'distributor' : 'wholesale'} rate − cost</p>
              </div>
            </div>
          </div>

          {/* Unit + Opening stock (new products only) */}
          <div className={`grid gap-3 ${isEdit ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <select
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Opening Stock</label>
                <Input
                  type="number" min="0"
                  placeholder="0"
                  value={form.current_stock}
                  onChange={e => set('current_stock', e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">Initial qty on hand (receive stock to add more later)</p>
              </div>
            )}
          </div>

          {/* Current stock (read-only on edit — adjusted via receipts/movements) */}
          {isEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-[10px] text-muted-foreground">Stock on hand</p>
              <p className="font-semibold text-sm">{product?.current_stock ?? 0} {form.unit}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Stock changes through receipts and sales, not this form.</p>
            </div>
          )}

          {/* Sold by weight / measure */}
          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="vendor_sold_by_weight"
              type="checkbox"
              checked={!!form.sold_by_weight}
              onChange={e => set('sold_by_weight', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="vendor_sold_by_weight" className="text-sm cursor-pointer">
              <span className="font-medium text-foreground">Sold by weight / measure</span>
              <span className="block text-[10px] text-muted-foreground">
                Priced per {form.unit} — use for loose goods (rice, sugar, oil). The price above is the rate per {form.unit}.
              </span>
            </label>
          </div>

          {/* Reorder point */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reorder Point (units)</label>
            <Input
              type="number" min="0"
              placeholder="10"
              value={form.reorder_point}
              onChange={e => set('reorder_point', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Low-stock alert triggers when stock falls to or below this number</p>
          </div>

          {/* Opening batch details (new product only) */}
          {!isEdit && parseInt(form.current_stock) > 0 && (
            <div className="space-y-2 p-3 border border-border rounded-lg bg-muted/30">
              <p className="text-xs font-semibold text-foreground">Opening Batch Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-foreground">Batch Number</label>
                  <Input
                    placeholder="e.g. BTH-2026-001"
                    value={form.batch_number}
                    onChange={e => set('batch_number', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Manuf. Date</label>
                  <Input type="date" value={form.manufactured_at} onChange={e => set('manufactured_at', e.target.value)} className="h-7 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Expiry Date</label>
                  <Input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} className="h-7 text-xs" />
                </div>
              </div>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className={`
                      px-3 py-1 rounded-full text-xs font-medium border transition-all
                      ${selectedCats.includes(cat.id)
                        ? 'bg-primary text-primary-foreground border-transparent'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                      }
                    `}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : isEdit ? 'Save Changes' : 'Add Product'
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
