'use client'

import { Package, Plus, Factory, Globe, Calendar, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

/**
 * Product detail modal for POS
 * Shows comprehensive product information when clicking on a product
 *
 * @param {boolean} readOnly - If true, hides Add to Cart button (for product management page)
 */
export function ProductDetailModal({ open, product, onAddToCart, onClose, readOnly = false }) {
  if (!product) return null

  const price = parseFloat(product.mrp ?? product.wholesale_price ?? 0)
  const stock = product.available_stock ?? product.current_stock ?? 0
  const isPackage = product.product_type === 'PACKAGE'
  const pkgLabel = isPackage ? product.package_type : null

  const PKG_LABELS = {
    BULK: { label: 'Bulk', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    BUNDLE: { label: 'Bundle', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    MIXED: { label: 'Mixed', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    PALLET: { label: 'Pallet', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  }

  const lowStock = stock > 0 && stock <= (product.reorder_point ?? 5)
  const outOfStock = stock <= 0

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Product Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product image */}
          <div className="h-48 w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-20 w-20 text-muted-foreground/30" />
            )}
          </div>

          {/* Product name with badges */}
          <div>
            <div className="flex items-start gap-2">
              <h3 className="text-xl font-semibold flex-1">{product.name}</h3>
              {pkgLabel && (
                <Badge variant="outline" className={PKG_LABELS[pkgLabel]?.color}>
                  {PKG_LABELS[pkgLabel]?.label}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.hsn_code && <span>HSN: {product.hsn_code}</span>}
              {product.barcode && <span>Barcode: {product.barcode}</span>}
              {product.unit && <span>Unit: {product.unit}</span>}
            </div>
          </div>

          {/* Category information */}
          {(product.category || product.subcategory || product.hsn_chapter) && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-1">Category</p>
              <div className="flex flex-wrap gap-2">
                {product.category && <Badge variant="secondary">{product.category}</Badge>}
                {product.subcategory && <Badge variant="outline">{product.subcategory}</Badge>}
                {product.hsn_chapter && (
                  <span className="text-xs text-muted-foreground">
                    Chapter: {product.hsn_chapter}
                    {product.hsn_heading && ` → ${product.hsn_heading}`}
                    {product.hsn_subheading && ` → ${product.hsn_subheading}`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Price and stock */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">MRP</p>
              <p className="text-xl font-bold text-primary">Nu. {price.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stock</p>
              <p className={`text-lg font-semibold ${outOfStock ? 'text-tibetan' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                {outOfStock ? 'Out of Stock' : `${stock} ${product.unit ?? 'pcs'}`}
              </p>
            </div>
          </div>

          {/* Tax information (from HSN) */}
          {(product.customs_duty || product.sales_tax || product.green_tax) && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Tax Information</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                {product.customs_duty && (
                  <div>
                    <span className="text-muted-foreground">Customs Duty:</span>
                    <span className="ml-1 font-medium">{product.customs_duty}%</span>
                  </div>
                )}
                {product.sales_tax && (
                  <div>
                    <span className="text-muted-foreground">Sales Tax:</span>
                    <span className="ml-1 font-medium">{product.sales_tax}%</span>
                  </div>
                )}
                {product.green_tax && (
                  <div>
                    <span className="text-muted-foreground">Green Tax:</span>
                    <span className="ml-1 font-medium">{product.green_tax}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manufacturer Details */}
          {(product.manufacturer_name || product.manufacturer_brand || product.country_of_origin) && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Factory className="h-3 w-3" /> Manufacturer Details
              </p>
              <div className="space-y-1 text-sm">
                {product.manufacturer_name && (
                  <div><span className="text-muted-foreground">Name:</span> {product.manufacturer_name}</div>
                )}
                {product.manufacturer_brand && (
                  <div><span className="text-muted-foreground">Brand:</span> {product.manufacturer_brand}</div>
                )}
                {product.country_of_origin && (
                  <div className="flex items-center gap-1">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Country:</span> {product.country_of_origin}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch & Expiry Information */}
          {(product.batch_number || product.manufactured_on || product.expiry_date || product.best_before) && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Batch & Expiry
              </p>
              <div className="space-y-1 text-sm">
                {product.batch_number && (
                  <div><span className="text-muted-foreground">Batch:</span> {product.batch_number}</div>
                )}
                {product.manufactured_on && (
                  <div><span className="text-muted-foreground">Mfg Date:</span> {formatDate(product.manufactured_on)}</div>
                )}
                {product.expiry_date && (
                  <div><span className="text-muted-foreground">Expiry:</span> {formatDate(product.expiry_date)}</div>
                )}
                {product.best_before && (
                  <div><span className="text-muted-foreground">Best Before:</span> {formatDate(product.best_before)}</div>
                )}
              </div>
            </div>
          )}

          {/* Package contents (if applicable) */}
          {isPackage && product.package_items && product.package_items.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Package Contents:</p>
              <div className="space-y-1">
                {product.package_items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                    <span>{item.product?.name}</span>
                    <span className="text-muted-foreground">× {item.quantity} {item.product?.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor Notes */}
          {product.vendor_notes && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Notes
              </p>
              <p className="text-sm">{product.vendor_notes}</p>
            </div>
          )}

          {/* Specifications (if any) */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Specifications</p>
              <div className="space-y-1 text-sm">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key}>
                    <span className="text-muted-foreground">{key}:</span> {String(value)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reorder Point */}
          {product.reorder_point !== undefined && (
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Reorder Point: {product.reorder_point} {product.unit ?? 'pcs'}
              </p>
            </div>
          )}

          {/* Add to cart button */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className={readOnly ? "w-full" : "flex-1"}>
              Close
            </Button>
            {!readOnly && (
              <Button
                onClick={() => onAddToCart(product)}
                disabled={outOfStock}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add to Cart
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
