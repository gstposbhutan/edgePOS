"use client"

import { useState, useEffect } from "react"
import { Plus, Search, RefreshCw, Pencil, ToggleLeft, ToggleRight, Package, Boxes, PackageOpen, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useConsoleCatalog } from "@/hooks/use-console-catalog"
import { VendorProductForm } from "@/components/console/vendor-product-form"
import { PackageForm } from "@/components/pos/products/package-form"

const TABS = ['Products', 'Packages']

/**
 * The Catalog section for the distributor / wholesaler consoles. Two tabs:
 *  - Products: the vendor's own SINGLE products (add / edit / activate-toggle).
 *  - Packages: discrete Model-B packages (pallet / box / bundle). Each package level is a
 *    PACKAGE product carrying its own sealed `current_stock`; "Open" converts one sealed unit
 *    into its direct components (one level deep). Distributors additionally see a distributor
 *    price on products.
 *
 * @param {{ role: string }} props  entity role — controls the distributor_price column/field
 */
export function VendorCatalog({ role }) {
  const isDistributor = role === 'DISTRIBUTOR'

  const {
    products, categories, loading, saving,
    createProduct, updateProduct, toggleActive,
    fetchPackages, createPackage, updatePackage, deactivatePackage, openPackage,
    refresh,
  } = useConsoleCatalog()

  const [activeTab,    setActiveTab]    = useState('Products')
  const [search,       setSearch]       = useState('')
  const [filterActive, setFilterActive] = useState('ALL')

  const [showForm,    setShowForm]    = useState(false)
  const [editProduct, setEditProduct] = useState(null)

  const [packages,    setPackages]    = useState([])
  const [pkgsLoading, setPkgsLoading] = useState(false)
  const [showPkgForm, setShowPkgForm] = useState(false)
  const [editPackage, setEditPackage] = useState(null)
  const [openTarget,  setOpenTarget]  = useState(null)   // package row being opened

  // The Products tab lists SINGLE products only; PACKAGE rows are managed under Packages.
  const singleProducts = products.filter(p => (p.product_type ?? 'SINGLE') === 'SINGLE')

  const displayed = singleProducts.filter(p => {
    const matchSearch = !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.hsn_code ?? '').toLowerCase().includes(search.toLowerCase())
    const matchActive =
      filterActive === 'ALL' ? true :
      filterActive === 'ACTIVE' ? p.is_active :
      !p.is_active
    return matchSearch && matchActive
  })

  // Load packages when the Packages tab opens.
  useEffect(() => {
    if (activeTab === 'Packages') loadPackages()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPackages() {
    setPkgsLoading(true)
    const data = await fetchPackages()
    setPackages(data)
    setPkgsLoading(false)
  }

  function openAdd()  { setEditProduct(null); setShowForm(true) }
  function openEdit(p) { setEditProduct(p); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditProduct(null) }

  async function handleSavePackage(formData, componentItems, catIds) {
    const result = editPackage
      ? await updatePackage(editPackage.id, editPackage.product?.id, formData, componentItems, catIds)
      : await createPackage(formData, componentItems, catIds)
    if (!result?.error) loadPackages()
    return result
  }

  return (
    <div className="space-y-4">
      {/* Heading + add */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-serif font-bold text-foreground">Catalog</h2>
          <p className="text-xs text-muted-foreground">
            {activeTab === 'Products'
              ? `${singleProducts.length} product${singleProducts.length === 1 ? '' : 's'} you supply`
              : `${packages.length} package${packages.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={activeTab === 'Products' ? refresh : loadPackages} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {activeTab === 'Products' ? (
          <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
        ) : (
          <Button onClick={() => { setEditPackage(null); setShowPkgForm(true) }} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Create Package
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSearch('') }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab === 'Products' ? <Package className="h-3.5 w-3.5" /> : <Boxes className="h-3.5 w-3.5" />}
            {tab}
          </button>
        ))}
      </div>

      {/* ---------- Products tab ---------- */}
      {activeTab === 'Products' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, SKU, or HSN code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filterActive === f ? 'default' : 'outline'}
                  onClick={() => setFilterActive(f)}
                  className={filterActive === f ? 'bg-primary' : ''}
                >
                  {f.charAt(0) + f.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : displayed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                <Package className="h-12 w-12 opacity-20" />
                <p className="text-sm">No products yet</p>
                <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Add your first product
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayed.map(product => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    isDistributor={isDistributor}
                    onEdit={() => openEdit(product)}
                    onToggle={() => toggleActive(product.id, !product.is_active)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------- Packages tab ---------- */}
      {activeTab === 'Packages' && (
        <div className="rounded-lg border border-border overflow-hidden">
          {pkgsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
              <Boxes className="h-12 w-12 opacity-20" />
              <p className="text-sm">No packages yet</p>
              <Button onClick={() => { setEditPackage(null); setShowPkgForm(true) }} className="bg-primary hover:bg-primary/90" size="sm">
                <Plus className="h-4 w-4 mr-1.5" /> Create first package
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {packages.map(pkg => (
                <PackageRow
                  key={pkg.id}
                  pkg={pkg}
                  onEdit={() => { setEditPackage(pkg); setShowPkgForm(true) }}
                  onOpen={() => setOpenTarget(pkg)}
                  onDeactivate={() => deactivatePackage(pkg.id, pkg.product?.id).then(loadPackages)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product add / edit modal */}
      <VendorProductForm
        open={showForm}
        product={editProduct}
        categories={categories}
        saving={saving}
        role={role}
        onSave={(formData, catIds) => editProduct
          ? updateProduct(editProduct.id, formData, catIds)
          : createProduct(formData, catIds)}
        onClose={closeForm}
      />

      {/* Package create / edit modal — vendorMode turns on opening stock + relaxed price.
          allProducts feeds the component picker (SINGLE for box/bundle, PACKAGE for pallet). */}
      <PackageForm
        open={showPkgForm}
        pkg={editPackage}
        allProducts={products}
        categories={categories}
        saving={saving}
        vendorMode
        onSave={handleSavePackage}
        onClose={() => { setShowPkgForm(false); setEditPackage(null) }}
      />

      {/* Open package modal */}
      <OpenPackageModal
        pkg={openTarget}
        onOpen={openPackage}
        onDone={() => { setOpenTarget(null); loadPackages() }}
        onClose={() => setOpenTarget(null)}
      />
    </div>
  )
}

const PKG_COLORS = { BULK: 'text-blue-600', BUNDLE: 'text-purple-600', MIXED: 'text-amber-600', PALLET: 'text-emerald-600' }

function PackageRow({ pkg, onEdit, onOpen, onDeactivate }) {
  const price      = parseFloat(pkg.mrp ?? 0)
  const components = pkg.package_items ?? []
  const stock      = pkg.product?.current_stock ?? 0
  const active     = pkg.is_active

  return (
    <div className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${!active ? 'opacity-50' : ''}`}>
      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {pkg.product?.image_url
          ? <img src={pkg.product.image_url} alt={pkg.name} className="h-full w-full object-cover rounded-lg" />
          : <Boxes className="h-5 w-5 text-muted-foreground/40" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{pkg.name}</p>
          <span className={`text-[10px] font-semibold ${PKG_COLORS[pkg.package_type] ?? ''}`}>{pkg.package_type}</span>
          {!active && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {components.map(c => `${c.quantity}× ${c.product?.name}`).join(' + ')}
        </p>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        {price > 0 && <p className="text-sm font-semibold text-primary">Nu. {price.toFixed(2)}</p>}
        <p className={`text-xs mt-0.5 ${stock <= 0 ? 'text-tibetan' : stock <= 5 ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {stock} sealed
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onOpen} disabled={stock <= 0} className="text-emerald-600 hover:text-emerald-700" title="Open a sealed unit">
          <PackageOpen className="h-4 w-4 mr-1" /> Open
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon-sm" onClick={onDeactivate} className="text-tibetan hover:text-tibetan" title="Deactivate">
          <ToggleLeft className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

/** Modal to open N sealed units of a package, with a live preview of what gets released. */
function OpenPackageModal({ pkg, onOpen, onDone, onClose }) {
  const [qty,    setQty]    = useState(1)
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => { setQty(1); setBusy(false); setError(null) }, [pkg])

  if (!pkg) return null

  const onHand     = pkg.product?.current_stock ?? 0
  const components = pkg.package_items ?? []
  const n          = parseInt(qty) || 0

  async function handleOpen() {
    setBusy(true); setError(null)
    const result = await onOpen(pkg.product?.id, n)
    setBusy(false)
    if (result?.error) { setError(result.error); return }
    onDone()
  }

  return (
    <Dialog open={!!pkg}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Open {pkg.name}</DialogTitle>
          <DialogDescription>
            Break open sealed units into their components. {onHand} on hand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Units to open</label>
            <Input type="number" min="1" max={onHand} value={qty}
              onChange={e => setQty(e.target.value)} autoFocus />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1">
            <p className="font-medium text-foreground">
              Open {n} × {pkg.name} <span className="text-tibetan">−{n}</span>
            </p>
            {components.length > 0 ? components.map(c => (
              <p key={c.id} className="text-muted-foreground">
                → <span className="text-emerald-600 font-medium">+{(c.quantity ?? 0) * n}</span> {c.product?.name}
              </p>
            )) : (
              <p className="text-muted-foreground">No components defined.</p>
            )}
          </div>

          {error && <p className="text-xs text-tibetan">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="button" onClick={handleOpen} disabled={busy || n < 1 || n > onHand}
              className="flex-1 bg-primary hover:bg-primary/90">
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening...</> : `Open ${n}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProductRow({ product, isDistributor, onEdit, onToggle }) {
  const cats  = (product.product_categories ?? []).map(pc => pc.categories?.name).filter(Boolean)
  const wholesale = product.wholesale_price != null ? parseFloat(product.wholesale_price) : null
  const mrp       = product.mrp != null ? parseFloat(product.mrp) : null
  const distPrice = product.distributor_price != null ? parseFloat(product.distributor_price) : null
  const stock = product.current_stock ?? 0

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${!product.is_active ? 'opacity-50' : ''}`}
      onClick={onEdit}
    >
      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
          {!product.is_active && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
          {product.sold_by_weight && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] px-1.5 py-0">
              By weight
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {product.sku && <span className="text-xs text-muted-foreground">{product.sku}</span>}
          <span className="text-xs text-muted-foreground">HSN: {product.hsn_code}</span>
          {cats.map(c => (
            <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0">{c}</Badge>
          ))}
        </div>
      </div>

      {/* Pricing + stock */}
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-sm font-semibold text-primary">
          {wholesale != null ? `Nu. ${wholesale.toFixed(2)}` : '—'}
          <span className="text-[10px] font-normal text-muted-foreground ml-1">wholesale</span>
        </p>
        {mrp != null && <p className="text-xs text-muted-foreground">MRP: Nu. {mrp.toFixed(2)}</p>}
        {isDistributor && distPrice != null && (
          <p className="text-xs text-muted-foreground">Dist: Nu. {distPrice.toFixed(2)}</p>
        )}
        <p className={`text-xs mt-0.5 ${stock <= 0 ? 'text-tibetan' : stock <= 10 ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {stock} {product.unit ?? 'pcs'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          title={product.is_active ? 'Deactivate' : 'Activate'}
          className={`transition-colors ${product.is_active ? 'text-emerald-600 hover:text-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {product.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}
