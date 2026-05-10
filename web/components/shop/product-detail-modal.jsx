"use client"

import { X, ShoppingBag, Package, Truck, Shield, Clock, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export function ProductDetailModal({ product, store, onClose, onAddToCart }) {
  const price = parseFloat(product.mrp ?? 0)
  const stock = product.current_stock ?? 0
  const lowStock = stock <= 10
  const outOfStock = stock <= 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-auto bg-background rounded-t-3xl sm:rounded-3xl shadow-xl">
        {/* Handle for mobile swipe */}
        <div className="sticky top-0 flex justify-center pt-3 pb-1 bg-background z-10">
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Product Image */}
        <div className="relative aspect-square bg-muted">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <ShoppingBag className="h-20 w-20 text-muted-foreground/30" />
            </div>
          )}

          {/* Stock Badge */}
          <div className="absolute top-4 left-4">
            {outOfStock ? (
              <span className="px-3 py-1.5 bg-tibetan text-background text-xs font-semibold rounded-full">
                Out of Stock
              </span>
            ) : lowStock ? (
              <span className="px-3 py-1.5 bg-amber-500 text-background text-xs font-semibold rounded-full">
                Only {stock} left
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-emerald-500 text-background text-xs font-semibold rounded-full">
                In Stock ({stock})
              </span>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="p-6 space-y-6">
          {/* Name & Price */}
          <div>
            <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">Nu. {price.toFixed(2)}</span>
              <span className="text-muted-foreground">/{product.unit || "pcs"}</span>
            </div>
          </div>

          {/* Store Info */}
          {store && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Sold by {store.name}</p>
                {store.tpn_gstin && (
                  <p className="text-xs text-muted-foreground">TPN: {store.tpn_gstin}</p>
                )}
              </div>
            </div>
          )}

          {/* Product Details */}
          <div className="space-y-4">
            {/* SKU & HSN */}
            <div className="grid grid-cols-2 gap-4">
              {product.sku && (
                <div className="p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">SKU</p>
                  <p className="text-sm font-medium">{product.sku}</p>
                </div>
              )}
              {product.hsn_code && (
                <div className="p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">HSN Code</p>
                  <p className="text-sm font-medium">{product.hsn_code}</p>
                </div>
              )}
            </div>

            {/* Category */}
            {product.category_name && (
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Category: </span>
                <span className="text-sm font-medium">{product.category_name}</span>
              </div>
            )}

            {/* Tax Info */}
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">GST: </span>
              <span className="text-sm font-medium">5% (Included)</span>
            </div>

            {/* Manufacturer */}
            {product.manufacturer && (
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Manufacturer: </span>
                <span className="text-sm font-medium">{product.manufacturer}</span>
              </div>
            )}

            {/* Batch & Expiry */}
            {(product.batch_no || product.expiry_date) && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {product.batch_no && (
                  <>
                    <span className="text-sm text-muted-foreground">Batch: </span>
                    <span className="text-sm font-medium">{product.batch_no}</span>
                  </>
                )}
                {product.expiry_date && (
                  <>
                    <span className="text-sm text-muted-foreground ml-2">Expires: </span>
                    <span className="text-sm font-medium">
                      {new Date(product.expiry_date).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Package Contents */}
            {product.package_contents && (
              <div className="p-3 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Package Contents</p>
                <p className="text-sm">{product.package_contents}</p>
              </div>
            )}

            {/* Vendor Notes */}
            {product.vendor_notes && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl">
                <p className="text-xs text-muted-foreground mb-1">Note from Store</p>
                <p className="text-sm">{product.vendor_notes}</p>
              </div>
            )}

            {/* Specifications */}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <div className="p-3 bg-muted/50 rounded-xl">
                <p className="text-xs text-muted-foreground mb-2">Specifications</p>
                <div className="space-y-1">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add to Cart Button */}
          <Button
            size="lg"
            onClick={onAddToCart}
            disabled={outOfStock}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <ShoppingBag className="h-5 w-5 mr-2" />
            {outOfStock ? "Out of Stock" : `Add to Cart - Nu. ${price.toFixed(2)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
