"use client"

import { useState, useEffect } from "react"
import { Loader2, Sparkles, ImagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { HsnPicker } from "./hsn-picker"
import { BrandPicker } from "./brand-picker"

const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'btl', 'box', 'pack', 'dozen', 'pair', 'set', 'roll', 'sheet', 'bag', 'can', 'tube', 'sachet']

const EMPTY_FORM = {
  name: '', sku: '', hsn_code: '', brand: '', unit: 'pcs',
  wholesale_price: '', mrp: '', selling_price: '', cost_price: '',
  current_stock: '0', image_url: '', reorder_point: '10',
  sold_by_weight: false, gst_exempt: false, video_url: '', specifications: {},
  stock_rotation: 'FIFO',
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
  const [uploading,    setUploading]    = useState(false)
  const [specTemplate, setSpecTemplate] = useState([])   // [{key,label,type,options}] for product.category
  const [aiBusy,       setAiBusy]       = useState(null)  // 'enrich' | 'image' | null
  const [nextSku,      setNextSku]      = useState('')    // auto-number preview (new products)

  // Populate form when editing
  useEffect(() => {
    if (product) {
      setForm({
        name:            product.name ?? '',
        sku:             product.sku ?? '',
        hsn_code:        product.hsn_code ?? '',
        brand:           product.brand ?? '',
        unit:            product.unit ?? 'pcs',
        wholesale_price: String(product.wholesale_price ?? ''),
        mrp:             String(product.mrp ?? ''),
        selling_price:   String(product.selling_price ?? ''),
        current_stock:   String(product.current_stock ?? '0'),
        image_url:       product.image_url ?? '',
        reorder_point:   String(product.reorder_point ?? '10'),
        sold_by_weight:  product.sold_by_weight ?? false,
        gst_exempt:      product.gst_exempt ?? false,
        video_url:       product.video_url ?? '',
        specifications:  product.specifications && typeof product.specifications === 'object' ? product.specifications : {},
        stock_rotation:  product.stock_rotation ?? 'FIFO',
      })
      setSelectedCats([])
    } else {
      setForm(EMPTY_FORM)
      setSelectedCats([])
    }
    setError(null)
  }, [product, open])

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setSpec(key, value) {
    setForm(prev => ({ ...prev, specifications: { ...prev.specifications, [key]: value } }))
  }

  // Preview the SKU that will be auto-assigned if left blank (new products only).
  useEffect(() => {
    if (!open || isEdit) { setNextSku(''); return }
    fetch('/api/products/next-sku')
      .then(r => r.ok ? r.json() : null)
      .then(d => setNextSku(d?.sku || ''))
      .catch(() => setNextSku(''))
  }, [open, isEdit])

  // Load the admin-defined custom-property template for this product's category (+ subcategory).
  useEffect(() => {
    const cat = product?.category
    const sub = product?.subcategory
    if (!open || !cat) { setSpecTemplate([]); return }
    const qs = `category=${encodeURIComponent(cat)}${sub ? `&subcategory=${encodeURIComponent(sub)}` : ''}`
    fetch(`/api/property-templates?${qs}`)
      .then(r => r.ok ? r.json() : { properties: [] })
      .then(d => setSpecTemplate(Array.isArray(d.properties) ? d.properties : []))
      .catch(() => setSpecTemplate([]))
  }, [open, product?.category, product?.subcategory])

  // AI: enrich metadata for the (existing) product, then reflect the returned fields in the form.
  async function runEnrich() {
    if (!product?.id) return
    setAiBusy('enrich'); setError(null)
    try {
      const res = await fetch(`/api/products/${product.id}/enrich`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enrichment failed')
      const p = data.product || {}
      setForm(prev => ({ ...prev, hsn_code: p.hsn_code || prev.hsn_code, specifications: p.specifications || prev.specifications }))
    } catch (err) { setError(err.message) } finally { setAiBusy(null) }
  }

  // AI: generate a default catalog image and set it.
  async function runGenerateImage() {
    if (!product?.id) return
    setAiBusy('image'); setError(null)
    try {
      const res = await fetch(`/api/products/${product.id}/generate-image`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Image generation failed')
      if (data.product?.image_url) set('image_url', data.product.image_url)
    } catch (err) { setError(err.message) } finally { setAiBusy(null) }
  }

  function toggleCat(id) {
    setSelectedCats(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  async function handleImageFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/uploads/product-image', { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      set('image_url', data.url)
    } catch (err) {
      setError(err.message || 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim())     return setError('Product name is required')
    if (!form.hsn_code.trim()) return setError('HSN code is required for GST compliance')
    if (!isEdit && !(parseFloat(form.selling_price) > 0)) return setError('Enter a selling price greater than 0')
    if (!isEdit && form.stock_rotation === 'FEFO' && parseInt(form.current_stock) > 0 && !form.expires_at)
      return setError('FEFO products need an expiry date on the opening batch (below).')

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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update product details.' : 'Add a product to your catalogue. HSN code is required for GST compliance.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Product Name <span className="text-tibetan">*</span></label>
            <Input
              placeholder="e.g. Wai Wai Noodles 75g"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              required
              autoFocus={!isEdit}
            />
          </div>

          {/* SKU + Brand/Manufacturer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">SKU</label>
              <Input
                placeholder={!isEdit && nextSku ? `Auto: ${nextSku}` : 'e.g. WWN-075'}
                value={form.sku}
                onChange={e => set('sku', e.target.value)}
              />
              {!isEdit && (
                <p className="text-[10px] text-muted-foreground">
                  {nextSku ? <>Leave blank to auto-number → <span className="font-mono">{nextSku}</span></> : 'Leave blank to auto-number'}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Brand / Manufacturer</label>
              <BrandPicker value={form.brand} onChange={v => set('brand', v)} />
            </div>
          </div>

          {/* HSN code — searchable/filterable picker; category & GST derive from it on save */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">HSN Code <span className="text-tibetan">*</span></label>
            <HsnPicker value={form.hsn_code} onChange={(code) => set('hsn_code', code)} required />
            <p className="text-[10px] text-muted-foreground">Category, subcategory & GST are set automatically from the selected HSN code.</p>
          </div>

          {/* Prices + stock — read-only, managed via stock receipts and movements */}
          {isEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prices & Stock</p>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground">Wholesale</p>
                  <p className="font-medium">{form.wholesale_price ? `Nu. ${parseFloat(form.wholesale_price).toFixed(2)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">MRP</p>
                  <p className="font-medium">{form.mrp ? `Nu. ${parseFloat(form.mrp).toFixed(2)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Selling Price</p>
                  <p className="font-semibold text-primary">
                    Nu. {parseFloat(form.selling_price || form.mrp || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Stock</p>
                  <p className="font-semibold">{form.current_stock ?? 0} {form.unit}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Prices update when receiving stock. Stock updates automatically on sales and receipts.</p>
            </div>
          )}

          {/* Pricing — editable on create so a new product is never saved with a zero/blank price */}
          {!isEdit && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{form.sold_by_weight ? `Selling rate / ${form.unit}` : 'Selling price'} <span className="text-tibetan">*</span></label>
                  <Input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    value={form.selling_price}
                    onChange={e => set('selling_price', e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">What the customer pays</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">MRP</label>
                  <Input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    value={form.mrp}
                    onChange={e => set('mrp', e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Max retail price</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Cost</label>
                  <Input
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    value={form.cost_price}
                    onChange={e => set('cost_price', e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">What you pay to buy it</p>
                </div>
              </div>
            </div>
          )}

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

          {/* Sold-by-weight + GST-exempt — paired 2-up on desktop to cut the form's height */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="sold_by_weight"
              type="checkbox"
              checked={!!form.sold_by_weight}
              onChange={e => set('sold_by_weight', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="sold_by_weight" className="text-sm cursor-pointer">
              <span className="font-medium text-foreground">Sold by weight / measure</span>
              <span className="block text-[10px] text-muted-foreground">
                Cashier enters the amount in <strong>{form.unit}</strong> at checkout (e.g. 1.5 {form.unit}); the price is the rate per {form.unit}. Use for loose goods — rice, sugar, vegetables, fruit, oil.
              </span>
            </label>
          </div>

          {/* GST exempt */}
          <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="gst_exempt"
              type="checkbox"
              checked={!!form.gst_exempt}
              onChange={e => set('gst_exempt', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="gst_exempt" className="text-sm cursor-pointer">
              <span className="font-medium text-foreground">GST exempt</span>
              <span className="block text-[10px] text-muted-foreground">
                No 5% GST on this product — it sells tax-free on every channel.
              </span>
            </label>
          </div>

          </div>

          {/* Stock rotation (FEFO/FIFO) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Stock rotation</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { m: 'NONE', l: 'None', t: 'No rotation — cashier bills any batch. No warning.' },
                { m: 'FIFO', l: 'FIFO', t: 'Oldest stock sells first. Expiry optional.' },
                { m: 'FEFO', l: 'FEFO', t: 'Soonest-expiry first. Expiry required on every batch.' },
              ].map(({ m, l, t }) => (
                <button
                  type="button" key={m}
                  onClick={() => set('stock_rotation', m)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${form.stock_rotation === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                >
                  <span className="text-sm font-medium text-foreground">{l}</span>
                  <span className="block text-[10px] text-muted-foreground">{t}</span>
                </button>
              ))}
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
                  <label className="text-xs font-medium text-foreground">Expiry Date {form.stock_rotation === 'FEFO' && <span className="text-tibetan">*</span>}</label>
                  <Input type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)}
                    className={`h-7 text-xs ${form.stock_rotation === 'FEFO' && !form.expires_at ? 'border-tibetan' : ''}`} />
                  {form.stock_rotation === 'FEFO' && <p className="text-[10px] text-tibetan">Required for FEFO products.</p>}
                </div>
              </div>
            </div>
          )}

          {/* Product image — upload to CDN, or paste a URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Product Image <span className="text-muted-foreground">(optional)</span></label>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
                {form.image_url
                  ? <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                  : <span className="text-[10px] text-muted-foreground">No image</span>
                }
              </div>
              <div className="flex-1 space-y-1.5">
                <label
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-lg border border-input text-sm cursor-pointer transition-colors hover:bg-muted/50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  {uploading
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…</>
                    : (form.image_url ? 'Replace image' : 'Upload image')
                  }
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleImageFile}
                  />
                </label>
                {form.image_url && (
                  <button
                    type="button"
                    onClick={() => set('image_url', '')}
                    className="ml-2 text-xs text-muted-foreground hover:text-tibetan"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <Input
              placeholder="…or paste an image URL"
              value={form.image_url}
              onChange={e => set('image_url', e.target.value)}
            />
          </div>

          {/* AI assist — existing products only (enrich/generate persist server-side) */}
          {isEdit && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={runEnrich} disabled={!!aiBusy}>
                {aiBusy === 'enrich' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />} Enrich with AI
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={runGenerateImage} disabled={!!aiBusy}>
                {aiBusy === 'image' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1.5" />} Generate image
              </Button>
            </div>
          )}

          {/* Video link */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Video link <span className="text-muted-foreground">(YouTube / Instagram / TikTok, optional)</span></label>
            <Input placeholder="https://youtu.be/…" value={form.video_url} onChange={e => set('video_url', e.target.value)} />
          </div>

          {/* Custom properties for this product's category (admin-managed template) */}
          {specTemplate.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{product?.category} properties</label>
              <div className="grid grid-cols-2 gap-2">
                {specTemplate.map(p => (
                  <div key={p.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{p.label}</label>
                    {p.type === 'select' && Array.isArray(p.options) ? (
                      <select value={form.specifications?.[p.key] ?? ''} onChange={e => setSpec(p.key, e.target.value)}
                        className="w-full h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                        <option value="">—</option>
                        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input type={p.type === 'number' ? 'number' : 'text'} value={form.specifications?.[p.key] ?? ''} onChange={e => setSpec(p.key, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category tags removed — a product's taxonomy is its HSN category/subcategory (Phase 2) */}

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

          {/* Sticky footer — Save/Cancel always reachable without scrolling to the bottom */}
          <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 px-4 py-3 bg-popover border-t border-border flex gap-2">
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
