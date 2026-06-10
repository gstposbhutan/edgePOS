"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRequireRole } from "@/hooks/use-require-role";
import { getPB } from "@/lib/pb-client";
import { formatDateTime } from "@/lib/date-utils";
import { MOVEMENT_TYPE } from "@/lib/constants";
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
import { ArrowLeft, History, Search } from "lucide-react";

interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string;
  created: string;
  expand?: { product?: { name: string; sku: string } };
}

const TYPE_CLASS: Record<string, string> = {
  SALE: "border-blue-500/40 text-blue-400",
  RESTOCK: "border-emerald-500/40 text-emerald-400",
  RETURN: "border-amber-500/40 text-amber-400",
  LOSS: "border-destructive/40 text-destructive",
  DAMAGED: "border-destructive/40 text-destructive",
  TRANSFER: "border-muted-foreground/40 text-muted-foreground",
};

const FILTERS = ["all", ...Object.values(MOVEMENT_TYPE)] as const;

export default function MovementsPage() {
  useRequireRole(["owner", "manager"] as const);
  const pb = getPB();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const filter = typeFilter === "all" ? "" : `movement_type = "${typeFilter}"`;
      const records = await pb.collection("inventory_movements").getList<Movement>(1, 200, {
        sort: "-created",
        expand: "product",
        ...(filter ? { filter } : {}),
        requestKey: null,
      });
      setMovements(records.items);
    } catch {
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [pb, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = movements.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const p = m.expand?.product;
    return (p?.name || "").toLowerCase().includes(q) || (p?.sku || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button>
          </Link>
          <h1 className="font-serif font-bold text-lg flex items-center gap-2"><History className="h-5 w-5" />Stock Movements</h1>
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Button key={f} variant={typeFilter === f ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(f)}>
              {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading...</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{formatDateTime(m.created)}</TableCell>
                    <TableCell className="font-medium">
                      {m.expand?.product?.name || "—"}
                      {m.expand?.product?.sku && <span className="text-muted-foreground text-xs ml-1">({m.expand.product.sku})</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${TYPE_CLASS[m.movement_type] || ""}`}>{m.movement_type}</Badge>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${m.quantity < 0 ? "text-destructive" : "text-emerald-400"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.notes}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No movements</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
