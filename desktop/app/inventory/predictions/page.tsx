"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRequireRole } from "@/hooks/use-require-role";
import { useProducts } from "@/hooks/use-products";
import { getPB } from "@/lib/pb-client";
import { MOVEMENT_TYPE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, TrendingUp } from "lucide-react";

// Window (days) over which sales velocity is averaged.
const WINDOW_DAYS = 30;

interface Row {
  id: string;
  name: string;
  sku: string;
  stock: number;
  reorder: number;
  sold: number;
  perDay: number;
  daysCover: number | null;
  suggest: number;
}

export default function PredictionsPage() {
  useRequireRole(["owner", "manager"] as const);
  const pb = getPB();
  const { allProducts } = useProducts();
  const [sales, setSales] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Sum SALE quantity (stored negative) per product over the window.
      const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().replace("T", " ");
      const recs = await pb.collection("inventory_movements").getFullList<{ product: string; quantity: number }>({
        filter: `movement_type = "${MOVEMENT_TYPE.SALE}" && created >= "${since}"`,
        requestKey: null,
      });
      const map: Record<string, number> = {};
      for (const r of recs) {
        map[r.product] = (map[r.product] || 0) + Math.abs(r.quantity || 0);
      }
      setSales(map);
    } catch {
      setSales({});
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    return allProducts
      .map((p) => {
        const sold = sales[p.id] || 0;
        const perDay = sold / WINDOW_DAYS;
        const daysCover = perDay > 0 ? p.current_stock / perDay : null;
        // Suggest enough to cover the window again, topped to 2× reorder point.
        const target = Math.max(p.reorder_point * 2, Math.ceil(perDay * WINDOW_DAYS));
        const suggest = Math.max(0, target - p.current_stock);
        return {
          id: p.id, name: p.name, sku: p.sku,
          stock: p.current_stock, reorder: p.reorder_point,
          sold, perDay, daysCover, suggest,
        };
      })
      // Only items with sales history or that are low — and that need topping up.
      .filter((r) => (r.sold > 0 || r.stock <= r.reorder) && r.suggest > 0)
      .sort((a, b) => {
        const ad = a.daysCover ?? Infinity;
        const bd = b.daysCover ?? Infinity;
        return ad - bd;
      });
  }, [allProducts, sales]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button>
          </Link>
          <h1 className="font-serif font-bold text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Reorder Suggestions</h1>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">
          Heuristic from the last {WINDOW_DAYS} days of sales velocity (not ML) — days of cover = current stock ÷ average daily sales.
          Suggested order tops stock up to cover another {WINDOW_DAYS} days (min 2× reorder point).
        </p>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nothing needs reordering.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Sold/{WINDOW_DAYS}d</TableHead>
                  <TableHead className="text-right">Days cover</TableHead>
                  <TableHead className="text-right">Suggest order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.sku && <span className="text-muted-foreground text-xs ml-1">({r.sku})</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sold}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.daysCover === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline" className={`text-xs ${r.daysCover <= 7 ? "border-destructive text-destructive" : r.daysCover <= 14 ? "border-warning text-warning" : ""}`}>
                          {r.daysCover.toFixed(1)}d
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.suggest}</TableCell>
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
