'use client'

import { Search, Plus, Package } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function WholesalerCatalog({ products, loading, search, onSearch, onAddToCart }) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-9"
          data-testid="catalog-search"
        />
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !products.length ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {search ? 'No products match your search' : 'Select a supplier to browse their catalog'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1" data-testid="product-grid">
          {products.map(product => (
            <button
              key={product.id}
              onClick={() => onAddToCart(product)}
              data-testid={`product-${product.name}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{product.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-primary">
                    Nu. {parseFloat(product.wholesale_price).toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {product.unit || 'pcs'}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-xs ${product.current_stock > 10 ? 'text-emerald-500' : product.current_stock > 0 ? 'text-amber-500' : 'text-tibetan'}`}>
                    {product.current_stock} in stock
                  </span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
