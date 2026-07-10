"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProducts, type Product } from "@/hooks/use-products";
import { usePurchases, type PurchaseOrder } from "@/hooks/use-purchases";
import { ProductFormModal, type ProductFormData } from "@/components/pos/product-form-modal";
import { ReceiveStockModal } from "@/components/pos/receive-stock-modal";
import { RestockBuilder } from "@/components/pos/purchases/restock-builder";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { printLabel } from "@/lib/print-label";
import { loadLabelConfig } from "@/lib/label-config";
import { DEFAULT_GST_RATE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Boxes, Plus, Search, ScanLine, PackagePlus, Pencil, Tag, Truck } from "lucide-react";
import dynamic from "next/dynamic";

const LoginFallback = dynamic(() => import("@/app/login/page"), { ssr: false });

// Desktop-side stock handling (owner/manager): products (add/edit) + inventory (levels, receive
// stock) + restock (purchase orders to wholesalers), with barcode scanning + label generation.
// Offline against local PocketBase; syncs up. Primary surface for a BACK_OFFICE terminal.
export default function StockPage() {
  const { isAuthenticated, isManager, isOwner, loading: authLoading } = useAuth();
  const router = useRouter();
  const canManage = isManager || isOwner;

  const {
    products, categories, loading,
    createProduct, updateProduct, receiveStock, refresh,
    lowStockCount, outOfStockCount,
  } = useProducts();
  const { connections, orders, createDraft, addConnection, receiveOrder, refresh: refreshPurchases } = usePurchases();

  const [tab, setTab] = useState<"products" | "restock">("products");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [receiveFor, setReceiveFor] = useState<Product | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  // Cashiers can't manage stock — bounce them back to the register.
  useEffect(() => {
    if (!authLoading && isAuthenticated && !canManage) router.replace("/");
  }, [authLoading, isAuthenticated, canManage, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;
  if (!isAuthenticated) return <LoginFallback />;
  if (!canManage) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Stock is manager/owner only…</p></div>;

  const openAdd = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p: Product) => { setEditing(p); setShowForm(true); };

  const handleSave = async (data: ProductFormData) => {
    const res = editing ? await updateProduct(editing.id, data) : await createProduct(data);
    if (res.success) { toast.success(editing ? "Product updated" : "Product added"); setShowForm(false); refresh(); }
    else toast.error(res.error || "Save failed");
    return res;
  };

  const handleScan = (barcode: string) => {
    setShowScanner(false);
    setSearch(barcode);
    const found = products.find((p) => p.barcode === barcode);
    if (found) toast.success(`Found ${found.name}`);
    else toast(`No product with barcode ${barcode}`, { description: "Add it as a new product." });
  };

  const printProductLabel = (p: Product) =>
    printLabel({ name: p.name, sku: p.sku, barcode: p.barcode, unit: p.unit || "pcs", price: p.sale_price || p.mrp || 0 }, loadLabelConfig(), 1);

  const handleAddSupplier = async () => {
    if (!supplierName.trim()) return;
    setAddingSupplier(true);
    const res = await addConnection({ wholesaler_name: supplierName.trim(), wholesaler_phone: supplierPhone.trim() || undefined });
    setAddingSupplier(false);
    if (res.success) { toast.success("Supplier added"); setSupplierName(""); setSupplierPhone(""); refreshPurchases(); }
    else toast.error(res.error || "Could not add supplier");
  };

  const handleReceiveOrder = async (order: PurchaseOrder) => {
    if (!window.confirm(`Receive PO ${order.po_no} into stock? This adds every line's quantity to inventory.`)) return;
    const res = await receiveOrder(order);
    if (res.success) { toast.success(`Received ${order.po_no} into stock`); refreshPurchases(); refresh(); }
    else toast.error(res.error || "Could not receive order");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/"><Button variant="ghost" size="icon-sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Boxes className="h-5 w-5 text-primary" />
          <h1 className="font-serif font-bold">Stock</h1>
          {lowStockCount > 0 && <Badge variant="outline" className="text-amber-600 border-amber-500/30">{lowStockCount} low</Badge>}
          {outOfStockCount > 0 && <Badge variant="outline" className="text-tibetan border-tibetan/30">{outOfStockCount} out</Badge>}
        </div>
        <Link href="/online-orders"><Button variant="ghost" size="sm">Online orders</Button></Link>
        <Link href="/customers"><Button variant="ghost" size="sm">Customers</Button></Link>
      </header>

      <div className="px-4 pt-3 flex gap-1">
        <Button variant={tab === "products" ? "default" : "ghost"} size="sm" onClick={() => setTab("products")}><Boxes className="h-4 w-4 mr-1" />Products &amp; inventory</Button>
        <Button variant={tab === "restock" ? "default" : "ghost"} size="sm" onClick={() => setTab("restock")}><Truck className="h-4 w-4 mr-1" />Restock</Button>
      </div>

      <div className="p-4">
        {tab === "products" ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, or barcode" className="pl-8" />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowScanner(true)}><ScanLine className="h-4 w-4 mr-1" />Scan</Button>
              <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add product</Button>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No products.</TableCell></TableRow>
                  ) : filtered.map((p) => {
                    const low = p.current_stock > 0 && p.current_stock <= p.reorder_point;
                    const out = p.current_stock <= 0;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{p.sku || "—"}</TableCell>
                        <TableCell className="text-right"><span className={out ? "text-tibetan" : low ? "text-amber-600" : ""}>{p.current_stock}</span> <span className="text-xs text-muted-foreground">{p.unit || ""}</span></TableCell>
                        <TableCell className="text-right">Nu. {(p.sale_price || p.mrp || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" title="Receive stock" onClick={() => setReceiveFor(p)}><PackagePlus className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon-sm" title="Print barcode label" onClick={() => printProductLabel(p)}><Tag className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium mb-2">Suppliers ({connections.length})</p>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[10rem]">
                  <label className="text-xs text-muted-foreground">Wholesaler name</label>
                  <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Thimphu Wholesale" className="mt-1" />
                </div>
                <div className="w-40">
                  <label className="text-xs text-muted-foreground">Phone (optional)</label>
                  <Input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="+975…" className="mt-1" />
                </div>
                <Button size="sm" onClick={handleAddSupplier} disabled={addingSupplier || !supplierName.trim()}>
                  <Plus className="h-4 w-4 mr-1" />Add supplier
                </Button>
              </div>
            </div>
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a supplier above to raise a restock order.</p>
            ) : (
              <RestockBuilder products={products} connections={connections} gstRate={DEFAULT_GST_RATE} onCreateDraft={createDraft} />
            )}
            {orders.length > 0 && (
              <div className="rounded-lg border border-border">
                <p className="text-sm font-medium px-3 py-2 border-b border-border">Purchase orders ({orders.length})</p>
                <div className="divide-y divide-border">
                  {orders.map((o) => {
                    const done = o.status === "RECEIVED" || o.status === "CANCELLED";
                    return (
                      <div key={o.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{o.po_no} <span className="text-xs text-muted-foreground">· {o.supplier_name || "—"}</span></p>
                          <p className="text-xs text-muted-foreground">Nu. {Number(o.grand_total || 0).toFixed(2)} · {o.status}</p>
                        </div>
                        {!done && (
                          <Button size="sm" variant="outline" onClick={() => handleReceiveOrder(o)}>
                            <PackagePlus className="h-4 w-4 mr-1" />Receive
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ProductFormModal open={showForm} onClose={() => setShowForm(false)} product={editing} categories={categories} onSave={handleSave} />
      <ReceiveStockModal
        open={!!receiveFor}
        onClose={() => setReceiveFor(null)}
        product={receiveFor}
        onReceive={async (id, qty, opts) => {
          const r = await receiveStock(id, qty, opts);
          if (r.success) { toast.success("Stock received"); setReceiveFor(null); refresh(); }
          else toast.error(r.error);
          return r;
        }}
      />
      <BarcodeScanner open={showScanner} onClose={() => setShowScanner(false)} onScan={handleScan} />
    </div>
  );
}
