"use client";

import { useMemo, useState } from "react";
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
import { Search, Plus, Minus, Trash2, ShoppingCart, AlertTriangle } from "lucide-react";
import type { Product } from "@/hooks/use-products";
import type { PurchaseItem, WholesalerConnection } from "@/hooks/use-purchases";

interface RestockBuilderProps {
  products: Product[];
  connections: WholesalerConnection[];
  gstRate: number;
  onCreateDraft: (
    connection: WholesalerConnection,
    items: PurchaseItem[],
    notes: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export function RestockBuilder({ products, connections, gstRate, onCreateDraft }: RestockBuilderProps) {
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [cart, setCart] = useState<Record<string, PurchaseItem>>({});
  const [connectionId, setConnectionId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchesLow = !onlyLow || p.current_stock <= p.reorder_point;
      return matchesSearch && matchesLow && p.is_active;
    });
  }, [products, search, onlyLow]);

  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
  const gstTotal = +(subtotal * (gstRate / 100)).toFixed(2);
  const grandTotal = +(subtotal + gstTotal).toFixed(2);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev[p.id];
      const quantity = (existing?.quantity || 0) + 1;
      const unit_cost = existing?.unit_cost ?? (p.wholesale_price || p.cost_price || 0);
      return {
        ...prev,
        [p.id]: {
          product: p.id,
          name: p.name,
          sku: p.sku,
          quantity,
          unit_cost,
          total: +(quantity * unit_cost).toFixed(2),
        },
      };
    });
  };

  const setQty = (productId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      const item = prev[productId];
      if (!item) return prev;
      return {
        ...prev,
        [productId]: { ...item, quantity, total: +(quantity * item.unit_cost).toFixed(2) },
      };
    });
  };

  const setCost = (productId: string, unit_cost: number) => {
    setCart((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      return {
        ...prev,
        [productId]: { ...item, unit_cost, total: +(item.quantity * unit_cost).toFixed(2) },
      };
    });
  };

  const suggestedQty = (p: Product) => {
    const target = Math.max(p.reorder_point * 2, p.reorder_point + 1);
    return Math.max(1, target - p.current_stock);
  };

  const fillSuggested = () => {
    setCart((prev) => {
      const next = { ...prev };
      filtered
        .filter((p) => p.current_stock <= p.reorder_point)
        .forEach((p) => {
          const quantity = suggestedQty(p);
          const unit_cost = p.wholesale_price || p.cost_price || 0;
          next[p.id] = {
            product: p.id,
            name: p.name,
            sku: p.sku,
            quantity,
            unit_cost,
            total: +(quantity * unit_cost).toFixed(2),
          };
        });
      return next;
    });
  };

  const handleCreate = async () => {
    setError("");
    const connection = connections.find((c) => c.id === connectionId);
    if (!connection) {
      setError("Select a wholesaler");
      return;
    }
    if (cartItems.length === 0) {
      setError("Add at least one product");
      return;
    }
    setSaving(true);
    const result = await onCreateDraft(connection, cartItems, notes.trim());
    setSaving(false);
    if (result.success) {
      setCart({});
      setNotes("");
      setConnectionId("");
    } else {
      setError(result.error || "Failed to create draft");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Catalog */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products to restock..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={onlyLow ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyLow((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Low stock
          </Button>
          <Button variant="outline" size="sm" onClick={fillSuggested}>
            Auto-fill
          </Button>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Wholesale</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.current_stock <= p.reorder_point ? (
                      <Badge variant="outline" className="text-xs border-warning text-warning">
                        {p.current_stock}
                      </Badge>
                    ) : (
                      <span className="tabular-nums">{p.current_stock}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    Nu. {(p.wholesale_price || p.cost_price || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => addToCart(p)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    No products
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Restock cart */}
      <div className="space-y-3">
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <ShoppingCart className="h-4 w-4" />
            Restock Order
            {cartItems.length > 0 && <Badge variant="secondary">{cartItems.length}</Badge>}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Wholesaler</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Select wholesaler...</option>
              {connections
                .filter((c) => c.status !== "SUSPENDED")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.wholesaler_name}
                  </option>
                ))}
            </select>
            {connections.length === 0 && (
              <p className="text-xs text-warning">Add a wholesaler first.</p>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {cartItems.map((item) => (
              <div key={item.product} className="p-2 rounded-md bg-muted/40 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{item.name}</p>
                  <button
                    onClick={() => setQty(item.product, 0)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(item.product, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => setQty(item.product, parseInt(e.target.value) || 0)}
                      className="h-7 w-14 text-center"
                    />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(item.product, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_cost}
                    onChange={(e) => setCost(item.product, parseFloat(e.target.value) || 0)}
                    className="h-7 flex-1"
                  />
                </div>
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  Nu. {item.total.toFixed(2)}
                </p>
              </div>
            ))}
            {cartItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Add products from the catalog
              </p>
            )}
          </div>

          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-9"
          />

          <div className="space-y-1 text-sm border-t border-border pt-2">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">Nu. {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({gstRate}%)</span>
              <span className="tabular-nums">Nu. {gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="tabular-nums">Nu. {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={saving || cartItems.length === 0 || !connectionId}
          >
            {saving ? "Saving..." : "Create Draft PO"}
          </Button>
        </div>
      </div>
    </div>
  );
}
