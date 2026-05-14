"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductFormModal } from "@/components/pos/product-form-modal";
import type { ProductFormData } from "@/components/pos/product-form-modal";
import type { Product } from "@/hooks/use-products";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Search,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

export default function ProductsPage() {
  const { isManager } = useAuth();
  const {
    allProducts,
    categories,
    loading,
    createProduct,
    updateProduct,
    deleteProduct,
    refresh,
    lowStockCount,
    outOfStockCount,
  } = useProducts();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined);

  const filtered = useMemo(() => {
    const list = allProducts.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.hsn_code.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && p.is_active) ||
        (filter === "inactive" && !p.is_active);
      return matchesSearch && matchesFilter;
    });
    return list;
  }, [allProducts, search, filter]);

  const handleSave = async (data: ProductFormData) => {
    if (editingProduct) {
      return updateProduct(editingProduct.id, {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        hsn_code: data.hsn_code,
        unit: data.unit,
        mrp: data.mrp,
        cost_price: data.cost_price,
        sale_price: data.sale_price,
        wholesale_price: data.wholesale_price,
        current_stock: data.current_stock,
        reorder_point: data.reorder_point,
        category: data.category || undefined,
      } as any);
    } else {
      const result = await createProduct({
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        hsn_code: data.hsn_code,
        unit: data.unit,
        mrp: data.mrp,
        cost_price: data.cost_price,
        sale_price: data.sale_price,
        wholesale_price: data.wholesale_price,
        current_stock: data.current_stock,
        reorder_point: data.reorder_point,
        category: data.category || undefined,
        is_active: true,
      } as any);
      if (result.success) {
        refresh();
      }
      return result;
    }
  };

  const handleToggleActive = async (product: Product) => {
    const result = await updateProduct(product.id, { is_active: !product.is_active });
    if (result.success) {
      toast.success(product.is_active ? "Product deactivated" : "Product activated");
    } else {
      toast.error(result.error || "Failed to toggle product");
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const result = await deleteProduct(product.id);
    if (result.success) {
      toast.success("Product deleted");
    } else {
      toast.error(result.error || "Failed to delete product");
    }
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Package className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Access restricted to managers and owners</p>
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to POS
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              POS
            </Button>
          </Link>
          <h1 className="font-serif font-bold text-lg">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          {outOfStockCount > 0 && (
            <Badge variant="destructive">{outOfStockCount} Out</Badge>
          )}
          {lowStockCount > 0 && (
            <Badge variant="outline" className="border-warning text-warning">
              {lowStockCount} Low
            </Badge>
          )}
          <Button size="sm" onClick={() => { setEditingProduct(undefined); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Product
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, barcode, HSN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex bg-muted rounded-md p-0.5">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm capitalize transition-colors ${
                  filter === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Products table */}
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No products found</p>
            <Button variant="link" size="sm" onClick={() => { setEditingProduct(undefined); setShowForm(true); }}>
              Add your first product
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id} className={!product.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      <div>
                        <span>{product.name}</span>
                        {product.expand?.category && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {product.expand.category.name}
                          </Badge>
                        )}
                      </div>
                      {product.barcode && (
                        <p className="text-[10px] text-muted-foreground">{product.barcode}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{product.sku || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{product.hsn_code || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{product.unit || "pcs"}</TableCell>
                    <TableCell className="text-right text-sm">Nu. {product.cost_price?.toFixed(2) || "0.00"}</TableCell>
                    <TableCell className="text-right text-sm">Nu. {product.mrp?.toFixed(2) || "0.00"}</TableCell>
                    <TableCell className="text-right text-sm">Nu. {(product.sale_price || product.mrp || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          product.current_stock <= 0
                            ? "text-destructive font-medium"
                            : product.current_stock <= product.reorder_point
                              ? "text-warning font-medium"
                              : ""
                        }
                      >
                        {product.current_stock}
                      </span>
                    </TableCell>
                    <TableCell>
                      {!product.is_active ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                      ) : product.current_stock <= 0 ? (
                        <Badge variant="destructive" className="text-xs">Out</Badge>
                      ) : product.current_stock <= product.reorder_point ? (
                        <Badge variant="outline" className="text-xs border-warning text-warning">Low</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditingProduct(product); setShowForm(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggleActive(product)}
                          title={product.is_active ? "Deactivate" : "Activate"}
                        >
                          {product.is_active ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(product)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <ProductFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingProduct(undefined); }}
        product={editingProduct}
        categories={categories}
        onSave={handleSave}
      />
    </div>
  );
}
