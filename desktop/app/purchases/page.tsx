"use client";

import { useState } from "react";
import Link from "next/link";
import { useRequireRole } from "@/hooks/use-require-role";
import { useProducts } from "@/hooks/use-products";
import { usePurchases } from "@/hooks/use-purchases";
import { useSettings } from "@/hooks/use-settings";
import { RestockBuilder } from "@/components/pos/purchases/restock-builder";
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
import { formatDateTime } from "@/lib/date-utils";
import { PURCHASE_STATUS, DEFAULT_GST_RATE } from "@/lib/constants";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  PackagePlus,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Store,
} from "lucide-react";

type View = "orders" | "restock" | "wholesalers";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "border-muted-foreground/40 text-muted-foreground",
  SUBMITTED: "border-blue-500/40 text-blue-400",
  CONFIRMED: "border-amber-500/40 text-amber-400",
  RECEIVED: "border-emerald-500/40 text-emerald-400",
  CANCELLED: "border-destructive/40 text-destructive",
};

export default function PurchasesPage() {
  useRequireRole(["owner", "manager"] as const);
  const { allProducts } = useProducts();
  const { settings } = useSettings();
  const {
    connections,
    orders,
    loading,
    addConnection,
    removeConnection,
    createDraft,
    submitOrder,
    confirmOrder,
    cancelOrder,
    receiveOrder,
  } = usePurchases();

  const [view, setView] = useState<View>("orders");
  const [newWholesaler, setNewWholesaler] = useState({ name: "", phone: "", tpn: "" });

  const gstRate = settings?.gst_rate ?? DEFAULT_GST_RATE;

  const handleAddWholesaler = async () => {
    if (!newWholesaler.name.trim()) {
      toast.error("Enter a wholesaler name");
      return;
    }
    const result = await addConnection({
      wholesaler_name: newWholesaler.name.trim(),
      wholesaler_phone: newWholesaler.phone.trim(),
      tpn_gstin: newWholesaler.tpn.trim(),
    });
    if (result.success) {
      toast.success("Wholesaler added");
      setNewWholesaler({ name: "", phone: "", tpn: "" });
    } else {
      toast.error(result.error || "Failed to add wholesaler");
    }
  };

  const act = async (label: string, fn: Promise<{ success: boolean; error?: string }>) => {
    const result = await fn;
    if (result.success) toast.success(label);
    else toast.error(result.error || "Action failed");
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
          <h1 className="font-serif font-bold text-lg">Purchasing</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={view === "orders" ? "default" : "ghost"} size="sm" onClick={() => setView("orders")}>
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Orders
          </Button>
          <Button variant={view === "restock" ? "default" : "ghost"} size="sm" onClick={() => setView("restock")}>
            <PackagePlus className="h-4 w-4 mr-1.5" />
            New Restock
          </Button>
          <Button variant={view === "wholesalers" ? "default" : "ghost"} size="sm" onClick={() => setView("wholesalers")}>
            <Store className="h-4 w-4 mr-1.5" />
            Wholesalers
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto space-y-4">
        {view === "restock" && (
          <RestockBuilder
            products={allProducts}
            connections={connections}
            gstRate={gstRate}
            onCreateDraft={async (connection, items, notes) => {
              const result = await createDraft(connection, items, notes);
              if (result.success) {
                toast.success("Draft PO created");
                setView("orders");
              }
              return result;
            }}
          />
        )}

        {view === "wholesalers" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wholesaler</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>TPN/GSTIN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.wholesaler_name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.wholesaler_phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{c.tpn_gstin || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{c.status || "ACTIVE"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => act("Wholesaler removed", removeConnection(c.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {connections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No wholesalers yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3 h-fit">
              <p className="font-medium">Add Wholesaler</p>
              <Input
                placeholder="Business name *"
                value={newWholesaler.name}
                onChange={(e) => setNewWholesaler({ ...newWholesaler, name: e.target.value })}
              />
              <Input
                placeholder="Phone / WhatsApp"
                value={newWholesaler.phone}
                onChange={(e) => setNewWholesaler({ ...newWholesaler, phone: e.target.value })}
              />
              <Input
                placeholder="TPN / GSTIN"
                value={newWholesaler.tpn}
                onChange={(e) => setNewWholesaler({ ...newWholesaler, tpn: e.target.value })}
              />
              <Button className="w-full" onClick={handleAddWholesaler}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>
        )}

        {view === "orders" && (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO No</TableHead>
                  <TableHead>Wholesaler</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading...</TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No purchase orders. Create one from “New Restock”.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.po_no}</TableCell>
                      <TableCell>{o.supplier_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.items?.length || 0}</TableCell>
                      <TableCell className="text-right tabular-nums">Nu. {o.grand_total.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[o.status] || ""}`}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {o.status === PURCHASE_STATUS.DRAFT && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => act("Order submitted", submitOrder(o.id))}>
                                <Send className="h-4 w-4 mr-1" />Submit
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act("Order cancelled", cancelOrder(o.id))}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {o.status === PURCHASE_STATUS.SUBMITTED && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => act("Order confirmed", confirmOrder(o.id))}>
                                <CheckCircle2 className="h-4 w-4 mr-1" />Confirm
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act("Order cancelled", cancelOrder(o.id))}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {o.status === PURCHASE_STATUS.CONFIRMED && (
                            <Button size="sm" onClick={() => act(`Stock received for ${o.po_no}`, receiveOrder(o))}>
                              <PackagePlus className="h-4 w-4 mr-1" />Receive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
