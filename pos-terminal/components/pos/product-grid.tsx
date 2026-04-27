"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ScanLine, Package } from "lucide-react";
import { getPBUrl } from "@/lib/pb-client";
import type { Product, Category } from "@/hooks/use-products";

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (id: string | null) => void;
  onAddProduct: (product: Product) => void;
  onScan: () => void;
}

export function ProductGrid({
  products,
  categories,
  loading,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  onAddProduct,
  onScan,
}: ProductGridProps) {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" onClick={onScan}>
            <ScanLine className="h-4 w-4" />
          </Button>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => onAddProduct(product)}
                disabled={product.current_stock <= 0}
                className={`relative text-left rounded-lg border p-3 transition-all hover:shadow-md hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed bg-card ${
                  product.current_stock <= 0 ? "border-destructive/50" : "border-border"
                }`}
              >
                {product.current_stock <= 0 && (
                  <Badge variant="destructive" className="absolute top-2 right-2 text-[10px]">
                    OUT
                  </Badge>
                )}
                {product.current_stock > 0 && product.current_stock <= product.reorder_point && (
                  <Badge variant="outline" className="absolute top-2 right-2 text-[10px] border-warning text-warning">
                    LOW
                  </Badge>
                )}
                <div className="aspect-square rounded-md bg-muted mb-2 flex items-center justify-center overflow-hidden">
                  {product.image ? (
                    <img
                      src={`${getPBUrl()}/api/files/products/${product.id}/${product.image}`}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="font-medium text-sm line-clamp-2 leading-tight">{product.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{product.sku}</p>
                <p className="text-sm font-semibold text-primary mt-1">
                  Nu. {product.sale_price || product.mrp}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Stock: {product.current_stock} {product.unit}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
