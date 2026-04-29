"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Search, RefreshCw, Pencil, ToggleLeft, ToggleRight, Package, Boxes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ProductForm }   from "@/components/pos/products/product-form"
import { PackageForm }   from "@/components/pos/products/package-form"
import { ProductDetailModal } from "@/components/pos/product-detail-modal"
import { useProductCatalog } from "@/hooks/use-product-catalog"
import { getUser, getRoleClaims } from "@/lib/auth"

const TABS = ['Products', 'Packages']

export default function ProductsPage() {
  const router = useRouter()

  const [entityId,      setEntityId]      = useState(null)
  const [subRole,       setSubRole]       = useState('CASHIER')
  const [activeTab,     setActiveTab]     = useState('Products')
  const [search,        setSearch]        = useState('')
  const [showForm,      setShowForm]      = useState(false)
  const [editProduct,   setEditProduct]   = useState(null)
  const [showPkgForm,   setShowPkgForm]   = useState(false)
  const [editPackage,   setEditPackage]   = useState(null)
  const [packages,      setPackages]      = useState([])
  const [pkgsLoading,   setPkgsLoading]   = useState(false)
  const [filterActive,  setFilterActive]  = useState('ALL')
  const [viewProduct,   setViewProduct]   = useState(null)  // For cashier view-only

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      setEntityId(eid)
      setSubRole(sr ?? 'CASHIER')
    }
    load()
  }, [])

  const canManage = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)

  const {
    products, categories, loading, saving,
    createProduct, updateProduct, toggleActive, togglePackageOnly, toggleVisibleOnWeb,
    createPackage, updatePackage, deactivatePackage, fetchPackages,
    refresh,
  } = useProductCatalog(entityId)

  // Load packages when tab switches
  useEffect(() => {
    if (activeTab === 'Packages' && entityId) loadPackages()
  }, [activeTab, entityId])

  async function loadPackages() {
    setPkgsLoading(true)
    const data = await fetchPackages()
    setPackages(data)
    setPkgsLoading(false)
  }

  async function handleSavePackage(formData, componentItems, catIds) {
    if (editPackage) {
      return updatePackage(editPackage.id, editPackage.product?.id, formData, componentItems, catIds)
        .then(r => { loadPackages(); return r })
    }
    return createPackage(formData, componentItems, catIds)
      .then(r => { loadPackages(); return r })
  }

  // Client-side filters
  const displayed = products.filter(p => {
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

  async function handleSave(formData, categoryIds) {
    if (editProduct) return updateProduct(editProduct.id, formData, categoryIds)
    return createProduct(formData, categoryIds)
  }

  function openAdd() { setEditProduct(null); setShowForm(true) }
  function openEdit(p) {
    if (!canManage) {
      // Cashier - show read-only detail modal
      setViewProduct(p)
    } else {
      // Manager/Admin - show edit form
      setEditProduct(p)
      setShowForm(true)
    }
  }
  function closeForm() { setShowForm(false); setEditProduct(null) }
  function closeDetail() { setViewProduct(null) }

  // Keyboard shortcuts: N = add product, Escape = close form
  useEffect(() => {
    function handleKeyDown(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (showForm || viewProduct) return
      if (e.key === 'n' || e.key === 'N') {
        if (canManage) { e.preventDefault(); openAdd() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showForm, viewProduct, canManage])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold text-foreground">Products</h1>
          <p className="text-xs text-muted-foreground">
            {activeTab === 'Products' ? `${products.length} products` : `${packages.length} packages`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={activeTab === 'Products' ? refresh : loadPackages} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canManage && activeTab === 'Products' && (
          <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
        )}
        {canManage && activeTab === 'Packages' && (
          <Button onClick={() => { setEditPackage(null); setShowPkgForm(true) }} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Create Package
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 shrink-0">
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSearch('') }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab === 'Products' ? <Package className="h-3.5 w-3.5" /> : <Boxes className="h-3.5 w-3.5" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Filters (products tab only) */}
      <div className={`px-4 py-3 flex gap-2 shrink-0 border-b border-border ${activeTab !== 'Products' ? 'hidden' : ''}`}>
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

      {/* Products tab */}
      {activeTab === 'Products' && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <Package className="h-12 w-12 opacity-20" />
              <p className="text-sm">No products found</p>
              {canManage && (
                <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Add your first product
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayed.map(product => (
                <ProductRow
                  key={product.id}
                  product={product}
                  canManage={canManage}
                  onEdit={() => openEdit(product)}
                  onToggle={() => toggleActive(product.id, !product.is_active)}
                  onTogglePkgOnly={() => togglePackageOnly(product.id, !product.sold_as_package_only)}
                  onToggleWeb={() => toggleVisibleOnWeb(product.id, !product.visible_on_web)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages tab */}
      {activeTab === 'Packages' && (
        <div className="flex-1 overflow-y-auto">
          {pkgsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <Boxes className="h-12 w-12 opacity-20" />
              <p className="text-sm">No packages yet</p>
              {canManage && (
                <Button onClick={() => { setEditPackage(null); setShowPkgForm(true) }} className="bg-primary hover:bg-primary/90" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Create first package
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {packages.map(pkg => (
                <PackageRow
                  key={pkg.id}
                  pkg={pkg}
                  canManage={canManage}
                  onEdit={() => { setEditPackage(pkg); setShowPkgForm(true) }}
                  onDeactivate={() => deactivatePackage(pkg.id, pkg.product?.id).then(loadPackages)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product form modal */}
      <ProductForm
        open={showForm}
        product={editProduct}
        categories={categories}
        saving={saving}
        onSave={(formData, catIds) => editProduct ? updateProduct(editProduct.id, formData, catIds) : createProduct(formData, catIds)}
        onClose={closeForm}
      />

      {/* Package form modal */}
      <PackageForm
        open={showPkgForm}
        pkg={editPackage}
        allProducts={products}
        categories={categories}
        saving={saving}
        onSave={handleSavePackage}
        onClose={() => { setShowPkgForm(false); setEditPackage(null) }}
      />

      {/* Product detail modal (read-only for cashiers) */}
      <ProductDetailModal
        open={!!viewProduct}
        product={viewProduct}
        onAddToCart={() => {}}
        onClose={closeDetail}
        readOnly={true}
      />
    </div>
  )
}

function PackageRow({ pkg, canManage, onEdit, onDeactivate }) {
  const price      = parseFloat(pkg.mrp ?? 0)
  const components = pkg.package_items ?? []
  const PKG_COLORS = { BULK: 'text-blue-600', BUNDLE: 'text-purple-600', MIXED: 'text-amber-600', PALLET: 'text-emerald-600' }
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {pkg.product?.image_url
          ? <img src={pkg.product.image_url} alt={pkg.name} className="h-full w-full object-cover rounded-lg" />
          : <Boxes className="h-5 w-5 text-muted-foreground/40" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{pkg.name}</p>
          <span className={`text-[10px] font-semibold ${PKG_COLORS[pkg.package_type] ?? ''}`}>{pkg.package_type}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {components.map(c => `${c.quantity}× ${c.product?.name}`).join(' + ')}
        </p>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-sm font-semibold text-primary">Nu. {price.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">{components.length} components</p>
      </div>
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon-sm" onClick={onDeactivate} className="text-tibetan hover:text-tibetan">
            <ToggleLeft className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  )
}

function ProductRow({ product, canManage, onEdit, onToggle, onTogglePkgOnly, onToggleWeb }) {
  const cats  = (product.product_categories ?? []).map(pc => pc.categories?.name).filter(Boolean)
  const price = parseFloat(product.mrp ?? 0)
  const cost  = parseFloat(product.wholesale_price ?? 0)
  const stock = product.current_stock ?? 0

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${!product.is_active ? 'opacity-50' : ''}`}
      onClick={onEdit}
    >
      {/* Image / placeholder */}
      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          : <Package className="h-5 w-5 text-muted-foreground/40" />
        }
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
          {!product.is_active && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>}
          {product.sold_as_package_only && (
            <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] px-1.5 py-0">
              Pkg only
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
        <p className="text-sm font-semibold text-primary">Nu. {price.toFixed(2)}</p>
        {cost > 0 && <p className="text-xs text-muted-foreground">Cost: Nu. {cost.toFixed(2)}</p>}
        <p className={`text-xs mt-0.5 ${stock <= 0 ? 'text-tibetan' : stock <= 10 ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {stock} {product.unit ?? 'pcs'}
        </p>
      </div>

      {/* Actions */}
      {canManage && (
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
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePkgOnly(); }}
            title={product.sold_as_package_only ? 'Allow direct sale' : 'Package only (hide from POS/marketplace)'}
            className={`transition-colors text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              product.sold_as_package_only
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                : 'text-muted-foreground border-border hover:border-amber-500/30'
            }`}
          >
            PKG
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWeb(); }}
            title={product.visible_on_web ? 'Hide from marketplace' : 'Show on marketplace'}
            className={`transition-colors text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              product.visible_on_web
                ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30'
                : 'text-muted-foreground border-border hover:border-[#D4AF37]/30'
            }`}
          >
            WEB
          </button>
        </div>
      )}
    </div>
  )
}
