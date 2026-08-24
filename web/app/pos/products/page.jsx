"use client"

import { useState, useEffect } from "react"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { MASTER_KEYS, withHandlers } from "@/lib/pos/office-keys"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Search, RefreshCw, Pencil, ToggleLeft, ToggleRight, Package, Boxes, Upload, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ProductForm }   from "@/components/pos/products/product-form"
import { ProductImportModal } from "@/components/pos/products/product-import-modal"
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
  const [showImport,    setShowImport]    = useState(false)
  const [aiAll,         setAiAll]         = useState(null)   // { done, total } while bulk-enriching

  // Enrich every not-yet-enriched product in this shop's catalog via the AI engine.
  async function enrichAll() {
    const targets = products.filter(p => !p.ai_enriched)
    if (!targets.length) return
    setAiAll({ done: 0, total: targets.length })
    for (let i = 0; i < targets.length; i++) {
      try { await fetch(`/api/products/${targets[i].id}/enrich`, { method: 'POST' }) } catch { /* skip */ }
      setAiAll({ done: i + 1, total: targets.length })
    }
    setAiAll(null)
    refresh()
  }
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
      if (sr === 'CASHIER') return router.push('/pos')
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

  // N (add product) is bound by the office rail — see components/pos/office/office-shell.jsx.
  // It was a private listener here, so the key worked but nothing on screen said so; after the
  // reskin put N on the rail it would have been bound twice.

  // The product register (spec WF-09) — the master list read as a register, not a card wall.
  //
  // An owner opens this to check a rate or a stock figure against a name, which is a COLUMN
  // read: the eye runs down one column until it finds the row. Cards make that read impossible
  // because every value sits in a different place on every card. Enter opens the product card,
  // which is where editing still happens.
  const productRows = displayed.map(pr => ({
    id: pr.id,
    _p: pr,
    name: pr.name,
    sku: pr.sku || '—',
    hsn: pr.hsn_code ?? '—',
    category: [pr.category, pr.subcategory].filter(Boolean).join(' / ') || '—',
    unit: pr.unit ?? 'pcs',
    stock: String(pr.current_stock ?? 0),
    cost: parseFloat(pr.wholesale_price ?? 0).toFixed(2),
    rate: parseFloat(pr.mrp ?? 0).toFixed(2),
    status: !pr.is_active ? 'Inactive' : pr.sold_as_package_only ? 'Pkg only' : 'Active',
  }))

  const PRODUCT_COLUMNS = [
    { key: 'name',     label: 'Product Name' },   // no width: absorbs the slack
    { key: 'sku',      label: 'Code',         width: 110 },
    { key: 'hsn',      label: 'HSN',          width: 80 },
    { key: 'category', label: 'Group',        width: 160 },
    { key: 'unit',     label: 'Unit',         width: 60 },
    { key: 'stock',    label: 'Stock',        width: 70,  align: 'right' },
    { key: 'cost',     label: 'Cost',         width: 90,  align: 'right' },
    { key: 'rate',     label: 'Rate',         width: 90,  align: 'right' },
    { key: 'status',   label: 'Status',       width: 80 },
    ...(canManage ? [{
      key: '_act', label: '', width: 96,
      render: (_v, row) => (
        <span className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <button type="button" title="Edit" onClick={() => openEdit(row._p)} className="underline">Edit</button>
          <button
            type="button"
            title={row._p.is_active ? 'Deactivate' : 'Activate'}
            onClick={() => toggleActive(row._p.id, !row._p.is_active)}
            className="underline"
          >
            {row._p.is_active ? 'Off' : 'On'}
          </button>
        </span>
      ),
    }] : []),
  ]

  return (
    <OfficeShell
      crumb="Master Data Management"
      title={activeTab === 'Products' ? 'Product Register' : 'Package Register'}
      keys={[
        ...(canManage && activeTab === 'Products' ? [
          { key: 'N', label: 'Add Product', onClick: openAdd },   // label kept from the old header — the guided tours click it by name
          { key: 'I', label: 'Import', onClick: () => setShowImport(true) },
          { key: 'A', label: aiAll ? `Enriching ${aiAll.done}/${aiAll.total}` : 'Enrich all', onClick: aiAll ? undefined : enrichAll },
        ] : []),
        ...(canManage && activeTab === 'Packages' ? [
          { key: 'N', label: 'New Package', onClick: () => { setEditPackage(null); setShowPkgForm(true) } },
        ] : []),
        { key: 'Tab', label: activeTab === 'Products' ? 'Packages' : 'Products',
          onClick: () => { setActiveTab(activeTab === 'Products' ? 'Packages' : 'Products'); setSearch('') } },
        ...withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc'),
      ]}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        {TABS.map(tab => (
          <button key={tab} type="button" onClick={() => { setActiveTab(tab); setSearch('') }}
            className="px-3 py-1 text-[11px] border"
            style={{
              borderColor: 'var(--office-line)',
              background: activeTab === tab ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
              color: activeTab === tab ? '#fff' : undefined,
              fontWeight: activeTab === tab ? 700 : 400,
            }}>
            {tab}
          </button>
        ))}

        {activeTab === 'Products' && (
          <>
            <label className="flex items-center gap-1.5 ml-2">
              <span>Search</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="name, SKU or HSN"
                className="px-1.5 py-0.5 border bg-white w-60" style={{ borderColor: 'var(--office-line)' }} />
            </label>
            {['ALL', 'ACTIVE', 'INACTIVE'].map(f => (
              <button key={f} type="button" onClick={() => setFilterActive(f)}
                className="px-2 py-1 text-[11px] border"
                style={{
                  borderColor: 'var(--office-line)',
                  background: filterActive === f ? 'var(--office-menu-sel)' : 'var(--office-panel-bg)',
                  color: filterActive === f ? '#fff' : undefined,
                }}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </>
        )}

        <button type="button" onClick={activeTab === 'Products' ? refresh : loadPackages}
          className="px-2.5 py-1 text-[11px] border" style={{ borderColor: 'var(--office-line)', background: 'var(--office-panel-bg)' }}>
          Refresh
        </button>
        <span className="ml-auto opacity-75">
          {activeTab === 'Products' ? `${displayed.length} of ${products.length} products` : `${packages.length} packages`}
        </span>
      </div>

      {/* Products tab */}
      {activeTab === 'Products' && (
        loading
          ? <p className="text-[12px] opacity-60 p-4">Loading…</p>
          : <OfficeGrid
              columns={PRODUCT_COLUMNS}
              rows={productRows}
              onOpen={(row) => (canManage ? openEdit(row._p) : setViewProduct(row._p))}
          openOnClick
              empty="No products found."
            />
      )}

      {/* Packages tab */}
      {activeTab === 'Packages' && (
        <div>
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

      <ProductImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refresh}
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
    </OfficeShell>
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
  const cats  = [product.category, product.subcategory].filter(Boolean)   // HSN category tree (Phase 1)
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
