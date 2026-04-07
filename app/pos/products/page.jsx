"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Search, RefreshCw, Pencil, ToggleLeft, ToggleRight, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ProductForm }        from "@/components/pos/products/product-form"
import { useProductCatalog }  from "@/hooks/use-product-catalog"
import { getUser, getRoleClaims } from "@/lib/auth"

export default function ProductsPage() {
  const router = useRouter()

  const [entityId,      setEntityId]      = useState(null)
  const [subRole,       setSubRole]       = useState('CASHIER')
  const [search,        setSearch]        = useState('')
  const [showForm,      setShowForm]      = useState(false)
  const [editProduct,   setEditProduct]   = useState(null)  // null = new
  const [filterActive,  setFilterActive]  = useState('ALL') // ALL | ACTIVE | INACTIVE

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

  const { products, categories, loading, saving, createProduct, updateProduct, toggleActive, refresh } =
    useProductCatalog(entityId)

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
  function openEdit(p) { setEditProduct(p); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditProduct(null) }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-serif font-bold text-foreground">Products</h1>
          <p className="text-xs text-muted-foreground">{products.length} products in catalogue</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {canManage && (
          <Button onClick={openAdd} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 py-3 flex gap-2 shrink-0 border-b border-border">
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

      {/* Product list */}
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit form modal */}
      <ProductForm
        open={showForm}
        product={editProduct}
        categories={categories}
        saving={saving}
        onSave={handleSave}
        onClose={closeForm}
      />
    </div>
  )
}

function ProductRow({ product, canManage, onEdit, onToggle }) {
  const cats  = (product.product_categories ?? []).map(pc => pc.categories?.name).filter(Boolean)
  const price = parseFloat(product.mrp ?? 0)
  const cost  = parseFloat(product.wholesale_price ?? 0)
  const stock = product.current_stock ?? 0

  return (
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${!product.is_active ? 'opacity-50' : ''}`}>
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
            onClick={onToggle}
            title={product.is_active ? 'Deactivate' : 'Activate'}
            className={`transition-colors ${product.is_active ? 'text-emerald-600 hover:text-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {product.is_active
              ? <ToggleRight className="h-5 w-5" />
              : <ToggleLeft className="h-5 w-5" />
            }
          </button>
        </div>
      )}
    </div>
  )
}
