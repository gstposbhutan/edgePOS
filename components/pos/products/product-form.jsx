"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'dozen', 'pair', 'set']

const EMPTY_FORM = {
  name: '', sku: '', hsn_code: '', unit: 'pcs',
  mrp: '', wholesale_price: '', current_stock: '0', image_url: '',
  barcode: '', qr_code: '', reorder_point: '10',
  batch_number: '', manufactured_at: '', expires_at: '',
}

/**
 * Add / Edit product modal.
 *
 * @param {{
 *   open: boolean,
 *   product: object|null,       null = new product
 *   categories: object[],
 *   saving: boolean,
 *   onSave: (formData, categoryIds) => Promise<{error}>,
 *   onClose: () => void
 * }} props
 */
export function ProductForm({ open, product, categories, saving, onSave, onClose }) {
  const isEdit = !!product

  const [form,         setForm]         = useState(EMPTY_FORM)
  const [selectedCats, setSelectedCats] = useState([])
  const [error,        setError]        = useState(null)

  // Populate form when editing
  useEffect(() => {
    if (product) {
      setForm({
        name:            product.name ?? '',
        sku:             product.sku ?? '',
        hsn_code:        product.hsn_code ?? '',
        unit:            product.unit ?? 'pcs',
        mrp:             String(product.mrp ?? ''),
        wholesale_price: String(product.wholesale_price ?? ''),
        current_stock:   String(product.current_stock ?? '0'),
        image_url:       product.image_url ?? '',
        barcode:         product.barcode ?? '',
        qr_code:         product.qr_code ?? '',
        reorder_point:   String(product.reorder_point ?? '10'),
        batch_number:    '',
        manufactured_at: '',
        expires_at:      '',
      })
      setSelectedCats(
        (product.product_categories ?? []).map(pc => pc.category_id)
      )
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
    if (!form.mrp || isNaN(parseFloat(form.mrp))) return setError('MRP (selling price) is required')

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

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update product details.' : 'Add a product to your catalogue. HSN code is required for GST compliance.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name + SKU */}
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

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">MRP / Selling Price (Nu.) <span className="text-tibetan">*</span></label>
              <Input
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.mrp}
                onChange={e => set('mrp', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cost / Wholesale Price (Nu.)</label>
              <Input
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.wholesale_price}
                onChange={e => set('wholesale_price', e.target.value)}
              />
            </div>
          </div>

          {/* Unit + Initial stock */}
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {isEdit ? 'Current Stock' : 'Opening Stock'}
              </label>
              <Input
                type="number" min="0"
                placeholder="0"
                value={form.current_stock}
                onChange={e => set('current_stock', e.target.value)}
                disabled={isEdit} // stock changes go through inventory adjustments
              />
              {isEdit && (
                <p className="text-[10px] text-muted-foreground">Adjust stock from Inventory page</p>
              )}
            </div>
          </div>

          {/* Barcode + QR */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Barcode</label>
              <Input
                placeholder="Scan or enter EAN/UPC"
                value={form.barcode}
                onChange={e => set('barcode', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">QR Code</label>
              <Input
                placeholder="QR code data"
                value={form.qr_code}
                onChange={e => set('qr_code', e.target.value)}
              />
            </div>
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
                  <label className="text-xs font-medium text-foreground">Batch Number <span className="text-tibetan">*</span></label>
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

          {/* Image URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Image URL <span className="text-muted-foreground">(optional)</span></label>
            <Input
              placeholder="https://..."
              value={form.image_url}
              onChange={e => set('image_url', e.target.value)}
            />
          </div>

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

          {/* GST preview */}
          {form.mrp && !isNaN(parseFloat(form.mrp)) && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs space-y-1">
              <p className="font-medium text-foreground">GST Preview (5% flat)</p>
              <div className="flex justify-between text-muted-foreground">
                <span>MRP</span><span>Nu. {parseFloat(form.mrp).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST included (5%)</span>
                <span>Nu. {(parseFloat(form.mrp) * 0.05 / 1.05).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <span>Customer pays</span>
                <span>Nu. {parseFloat(form.mrp).toFixed(2)}</span>
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
