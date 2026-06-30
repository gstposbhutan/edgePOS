"use client"

import { useState } from "react"
import { Plus, Search, RefreshCw, Pencil, ToggleLeft, ToggleRight, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useConsoleCatalog } from "@/hooks/use-console-catalog"
import { VendorProductForm } from "@/components/console/vendor-product-form"

/**
 * The Catalog section for the distributor / wholesaler consoles. Lists the vendor's OWN
 * products (everything from /api/console/catalog is already scoped to their entity) with
 * add / edit / activate-toggle. Distributors additionally see/edit a distributor price.
 *
 * @param {{ role: string }} props  entity role — controls the distributor_price column/field
 */
export function VendorCatalog({ role }) {
  const isDistributor = role === 'DISTRIBUTOR'

  const { products, categories, loading, saving, createProduct, updateProduct, toggleActive, refresh } = useConsoleCatalog()

  const [search,      setSearch]      = useState('')
  const [filterActive, setFilterActive] = useState('ALL')
  const [showForm,    setShowForm]    = useState(false)
  const [editProduct, setEditProduct] = useState(null)

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

  function openAdd()  { setEditProduct(null); setShowForm(true) }
  function openEdit(p) { setEditProduct(p); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditProduct(null) }

  return (
    <div className="space-y-4">
      {/* Heading + add */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-serif font-bold text-foreground">Catalog</h2>
          <p className="text-xs text-muted-foreground">{products.length} product{products.length === 1 ? '' : 's'} you supply</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Product
        </Button>
      </div>

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

      {/* List */}
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

      {/* Add / edit modal */}
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
    </div>
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
