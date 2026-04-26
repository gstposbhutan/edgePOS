"use client";

import { useState } from "react";
import Link from "next/link";
import { useProducts } from "@/hooks/use-products";
import { useAuth } from "@/hooks/use-auth";
import { getPB } from "@/lib/pb-client";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Search,
  Plus,
  Minus,
  AlertTriangle,
} from "lucide-react";

export default function InventoryPage() {
  const { user } = useAuth();
  const pb = getPB();
  const {
    allProducts,
    categories,
    loading,
    refresh,
    lowStockCount,
    outOfStockCount,
  } = useProducts();
  const [search, setSearch] = useState("");
  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("restock");

  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjust = async (productId: string) => {
    try {
      const product = allProducts.find((p) => p.id === productId);
      if (!product) return;

      const newStock = Math.max(0, product.current_stock + adjustQty);
      await pb.collection("products").update(productId, { current_stock: newStock });
      await pb.collection("inventory_movements").create({
        product: productId,
        type: adjustReason,
        quantity: adjustQty,
        notes: `Manual adjustment by ${user?.name || "staff"}`,
      });

      toast.success("Stock adjusted");
      setShowAdjust(null);
      setAdjustQty(0);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
          <h1 className="font-serif font-bold text-lg">Inventory</h1>
        </div>
        <div className="flex gap-2">
          {outOfStockCount > 0 && (
            <Badge variant="destructive">{outOfStockCount} Out</Badge>
          )}
          {lowStockCount > 0 && (
            <Badge variant="outline" className="border-warning text-warning">
              {lowStockCount} Low
            </Badge>
          )}
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{product.sku}</TableCell>
                    <TableCell className="text-right">{product.current_stock}</TableCell>
                    <TableCell className="text-right">Nu. {product.mrp}</TableCell>
                    <TableCell>
                      {product.current_stock <= 0 ? (
                        <Badge variant="destructive" className="text-xs">Out</Badge>
                      ) : product.current_stock <= product.reorder_point ? (
                        <Badge variant="outline" className="text-xs border-warning text-warning">Low</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {showAdjust === product.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <Input
                            type="number"
                            className="w-20 h-8"
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)}
                            placeholder="Qty"
                          />
                          <select
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            className="h-8 text-xs rounded-md border border-border bg-background px-2"
                          >
                            <option value="restock">Restock</option>
                            <option value="adjustment">Adjustment</option>
                            <option value="loss">Loss</option>
                            <option value="damaged">Damaged</option>
                          </select>
                          <Button size="sm" className="h-8" onClick={() => handleAdjust(product.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowAdjust(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowAdjust(product.id);
                            setAdjustQty(0);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Adjust
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
