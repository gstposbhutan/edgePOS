"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, Trash2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

const PKG_TYPES = [
  { id: 'BULK',   label: 'Bulk',   desc: 'Same product in large quantity (carton, case)' },
  { id: 'BUNDLE', label: 'Bundle', desc: 'Multiple different products as a combo' },
  { id: 'MIXED',  label: 'Mixed',  desc: 'Multiple different products, same category' },
  { id: 'PALLET', label: 'Pallet', desc: 'Multiple packages (distributor level)' },
]

const EMPTY_FORM = {
  name: '', package_type: 'BUNDLE', mrp: '', wholesale_price: '',
  hsn_code: '', barcode: '', qr_code: '', image_url: '',
}

/**
 * Create / Edit package modal.
 * For PALLET type, component picker shows packages (product_type = 'PACKAGE').
 * For all others, component picker shows SINGLE products.
 *
 * @param {{ open, pkg, allProducts, categories, saving, onSave, onClose }} props
 */
export function PackageForm({ open, pkg, allProducts, categories, saving, onSave, onClose }) {
  const supabase  = createClient()
  const isEdit    = !!pkg

  const [form,       setForm]       = useState(EMPTY_FORM)
  const [components, setComponents] = useState([])   // [{ product_id, name, unit, quantity }]
  const [catIds,     setCatIds]     = useState([])
  const [search,     setSearch]     = useState('')
  const [error,      setError]      = useState(null)

  useEffect(() => {
    if (open && pkg) {
      setForm({
        name:            pkg.name ?? '',
        package_type:    pkg.package_type ?? 'BUNDLE',
        mrp:             String(pkg.mrp ?? ''),
        wholesale_price: String(pkg.wholesale_price ?? ''),
        hsn_code:        pkg.hsn_code ?? '',
        barcode:         pkg.barcode ?? '',
        qr_code:         pkg.qr_code ?? '',
        image_url:       pkg.product?.image_url ?? '',
      })
      setComponents(
        (pkg.package_items ?? []).map(pi => ({
          product_id: pi.product.id,
          name:       pi.product.name,
          unit:       pi.product.unit,
          quantity:   pi.quantity,
        }))
      )
    } else if (open) {
      setForm(EMPTY_FORM)
      setComponents([])
      setCatIds([])
    }
    setError(null)
    setSearch('')
  }, [open, pkg])

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  // Which products/packages to show in component picker
  const isPallet = form.package_type === 'PALLET'
  const pickable = (allProducts ?? []).filter(p => {
    const matchesType  = isPallet ? p.product_type === 'PACKAGE' : p.product_type === 'SINGLE'
    const notAlready   = !components.find(c => c.product_id === p.id)
    const matchSearch  = !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    return matchesType && notAlready && matchSearch && p.is_active
  })

  function addComponent(product) {
    setComponents(prev => [...prev, {
      product_id: product.id,
      name:       product.name,
      unit:       product.unit ?? (isPallet ? 'pkg' : 'pcs'),
      quantity:   1,
    }])
    setSearch('')
  }

  function updateComponentQty(productId, qty) {
    const n = parseInt(qty)
    if (n < 1) return
    setComponents(prev => prev.map(c => c.product_id === productId ? { ...c, quantity: n } : c))
  }

  function removeComponent(productId) {
    setComponents(prev => prev.filter(c => c.product_id !== productId))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim())         return setError('Package name is required')
    if (components.length === 0)   return setError('Add at least one component')
    if (!form.mrp || isNaN(parseFloat(form.mrp))) return setError('Retail price is required')

    const { error: err } = await onSave(form, components.map(c => ({
      product_id: c.product_id,
      quantity:   c.quantity,
    })), catIds)

    if (err) setError(err)
    else handleClose()
  }

  function handleClose() {
    setForm(EMPTY_FORM); setComponents([]); setCatIds([]); setError(null); setSearch('')
    onClose()
  }

  // GST preview on package price
  const packageGst = form.mrp ? (parseFloat(form.mrp) * 0.05 / 1.05).toFixed(2) : null

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? 'Edit Package' : 'Create Package'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update package details and components.' : 'Define a sellable package — bundle, bulk, mixed, or pallet.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Package type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Package Type <span className="text-tibetan">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {PKG_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => set('package_type', t.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${form.package_type === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'}`}>
                  <p className="text-xs font-semibold text-foreground">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Package Name <span className="text-tibetan">*</span></label>
            <Input placeholder="e.g. Breakfast Bundle, Wai Wai Carton, Mixed Drinks Case"
              value={form.name} onChange={e => set('name', e.target.value)} required autoFocus={!isEdit} />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Retail Price (Nu.) <span className="text-tibetan">*</span></label>
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.mrp} onChange={e => set('mrp', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Wholesale Price (Nu.)</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.wholesale_price} onChange={e => set('wholesale_price', e.target.value)} />
            </div>
          </div>

          {/* HSN + Barcode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">HSN Code</label>
              <Input placeholder="e.g. 2106" value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Barcode</label>
              <Input placeholder="Scan or type" value={form.barcode} onChange={e => set('barcode', e.target.value)} />
            </div>
          </div>

          {/* GST preview */}
          {packageGst && (
            <div className="p-2.5 bg-primary/5 border border-primary/20 rounded-lg text-xs flex justify-between">
              <span className="text-muted-foreground">GST included (5%)</span>
              <span className="font-medium">Nu. {packageGst}</span>
            </div>
          )}

          {/* Components */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {isPallet ? 'Packages in this Pallet' : 'Products in this Package'} <span className="text-tibetan">*</span>
            </label>

            {/* Component list */}
            {components.length > 0 && (
              <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg">
                {components.map(c => (
                  <div key={c.product_id} className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-foreground truncate">{c.name}</p>
                    <Input type="number" min="1" value={c.quantity}
                      onChange={e => updateComponentQty(c.product_id, e.target.value)}
                      className="h-6 w-16 text-xs text-center px-1" />
                    <span className="text-[10px] text-muted-foreground w-8">{c.unit}</span>
                    <button type="button" onClick={() => removeComponent(c.product_id)}
                      className="text-muted-foreground hover:text-tibetan">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Component search + picker */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={isPallet ? 'Search packages to add...' : 'Search products to add...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>

            {search.trim() && pickable.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                {pickable.slice(0, 10).map(p => (
                  <button key={p.id} type="button" onClick={() => addComponent(p)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 text-left border-b border-border/50 last:border-0">
                    <span className="text-xs text-foreground">{p.name}</span>
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {search.trim() && pickable.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No {isPallet ? 'packages' : 'products'} found</p>
            )}
          </div>

          {/* Categories */}
          {(categories ?? []).length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button key={cat.id} type="button"
                    onClick={() => setCatIds(prev => prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                      ${catIds.includes(cat.id) ? 'bg-primary text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : isEdit ? 'Save Changes' : 'Create Package'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
