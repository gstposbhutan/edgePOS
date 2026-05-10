"use client"

import { SlidersHorizontal, AlertTriangle, XCircle, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * @param {{ products: object[], onAdjust: (product: object) => void }} props
 */
export function StockTable({ products, onAdjust }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Package className="h-10 w-10 opacity-30" />
        <p className="text-sm">No products match this filter</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Product</th>
            <th className="text-left py-2.5 px-3 text-muted-foreground font-medium hidden sm:table-cell">SKU</th>
            <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Stock</th>
            <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Status</th>
            <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Price (MRP)</th>
            <th className="py-2.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <StockRow key={product.id} product={product} onAdjust={() => onAdjust(product)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StockRow({ product, onAdjust }) {
  const stock    = product.current_stock ?? 0
  const isOut    = stock <= 0
  const isLow    = stock > 0 && stock <= 10
  const price    = parseFloat(product.mrp ?? product.wholesale_price ?? 0)

  const statusBadge = isOut
    ? <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
    : isLow
      ? <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs">Low Stock</Badge>
      : <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-xs">In Stock</Badge>

  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-3">
        <p className="font-medium text-foreground">{product.name}</p>
        {product.hsn_code && (
          <p className="text-xs text-muted-foreground">HSN: {product.hsn_code}</p>
        )}
      </td>
      <td className="py-3 px-3 text-muted-foreground hidden sm:table-cell">
        {product.sku ?? '—'}
      </td>
      <td className="py-3 px-3 text-right">
        <span className={`font-bold tabular-nums ${isOut ? 'text-tibetan' : isLow ? 'text-amber-600' : 'text-foreground'}`}>
          {stock}
        </span>
        <span className="text-xs text-muted-foreground ml-1">{product.unit ?? 'pcs'}</span>
      </td>
      <td className="py-3 px-3 text-center">{statusBadge}</td>
      <td className="py-3 px-3 text-right text-muted-foreground">
        Nu. {price.toFixed(2)}
      </td>
      <td className="py-3 px-3 text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={onAdjust}
          className="text-xs"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
          Adjust
        </Button>
      </td>
    </tr>
  )
}
