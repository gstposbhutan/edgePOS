"use client"

import { Search, Package, AlertTriangle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

/**
 * Left panel — product search and grid.
 * Clicking a product adds it to the cart.
 *
 * @param {{ products: object[], loading: boolean, onSearch: (q:string)=>void, onAddItem: (p:object)=>void }} props
 */
export function ProductPanel({ products, loading, onSearch, onAddItem }) {
  return (
    <div className="flex flex-col h-full gap-3">
      {/* Search bar */}
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products by name or SKU..."
          onChange={(e) => onSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={() => onAddItem(product)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Individual product card in the grid.
 */
function ProductCard({ product, onAdd }) {
  const price      = parseFloat(product.mrp ?? product.wholesale_price ?? 0)
  const lowStock   = product.current_stock <= 5
  const outOfStock = product.current_stock <= 0

  return (
    <button
      onClick={onAdd}
      disabled={outOfStock}
      className={`
        group relative flex flex-col gap-2 p-3 rounded-xl border text-left
        transition-all duration-150 active:scale-95
        ${outOfStock
          ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
          : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
        }
      `}
    >
      {/* Product image / placeholder */}
      <div className="h-14 w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          : <Package className="h-6 w-6 text-muted-foreground/50" />
        }
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">
        {product.name}
      </p>

      {/* Price + stock */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-sm font-bold text-primary">
          Nu. {price.toFixed(2)}
        </span>
        {lowStock && !outOfStock && (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        )}
        {outOfStock && (
          <Badge variant="destructive" className="text-[10px] px-1 py-0">Out</Badge>
        )}
      </div>

      {/* Stock count */}
      <p className="text-[10px] text-muted-foreground">
        {outOfStock ? 'Out of stock' : `${product.current_stock} ${product.unit ?? 'pcs'} left`}
      </p>
    </button>
  )
}
