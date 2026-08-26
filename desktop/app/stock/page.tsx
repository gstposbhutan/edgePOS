"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRequireRole } from "@/hooks/use-require-role";
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
import { OfficeShell } from "@/components/office/office-shell";
import { OfficeGrid } from "@/components/office/office-grid";
import { REPORT_KEYS, withHandlers } from "@/lib/office-keys";
import { toast } from "sonner";
import { Plus, Search, PackagePlus } from "lucide-react";
import dynamic from "next/dynamic";

const LoginFallback = dynamic(() => import("@/app/login/page"), { ssr: false });

// Desktop-side stock handling (owner/manager): products (add/edit) + inventory (levels, receive
// stock) + restock (purchase orders to wholesalers), with barcode scanning + label generation.
// Offline against local PocketBase; syncs up. Primary surface for a BACK_OFFICE terminal.
export default function StockPage() {
  const { isAuthenticated, isManager, isOwner, loading: authLoading } = useAuth();
  const canManage = isManager || isOwner;
  useRequireRole(["owner", "manager"] as const); // super_admin bypasses; cashiers redirected

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  if (authLoading) return <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;
  if (!isAuthenticated) return <LoginFallback />;
  if (!canManage) return <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-muted-foreground">Stock is manager/owner only…</p></div>;

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

  // The stock register (spec WF-09) — the terminal's copy of the cloud app's screen, so a
  // shopkeeper crossing between them does not change visual language mid-task.
  const stockRows = filtered.map((p) => {
    const low = p.current_stock > 0 && p.current_stock <= p.reorder_point;
    const out = p.current_stock <= 0;
    return {
      id: p.id,
      _p: p,
      name: p.name,
      sku: p.sku || "—",
      stock: String(p.current_stock ?? 0),
      unit: p.unit || "",
      status: out ? "Out of Stock" : low ? "Low Stock" : "In Stock",
      price: (p.sale_price || p.mrp || 0).toFixed(2),
    };
  });

  const STOCK_COLUMNS = [
    { key: "name",   label: "Product" },
    { key: "sku",    label: "SKU",    width: 130 },
    { key: "stock",  label: "Stock",  width: 90,  align: "right" as const },
    { key: "unit",   label: "Unit",   width: 70 },
    { key: "status", label: "Status", width: 110,
      render: (_v: unknown, row: { status: string }) => (
        <span style={{ color: row.status === "Out of Stock" ? "#B91C1C" : row.status === "Low Stock" ? "#B45309" : "#15803D" }}>
          {row.status}
        </span>
      ) },
    { key: "price",  label: "Price",  width: 110, align: "right" as const },
    { key: "_act",   label: "",       width: 190,
      render: (_v: unknown, row: { _p: Product }) => (
        <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="underline" onClick={() => setReceiveFor(row._p)}>Receive</button>
          <button type="button" className="underline" onClick={() => printProductLabel(row._p)}>Label</button>
          <button type="button" className="underline" onClick={() => openEdit(row._p)}>Edit</button>
        </span>
      ) },
  ];

  return (
    <OfficeShell
      crumb="Warehouse Management"
      title="Stock Register"
      keys={[
        { key: "N", label: "Add Product", onClick: openAdd },
        { key: "S", label: "Scan", onClick: () => setShowScanner(true) },
        ...withHandlers(REPORT_KEYS, {}),
      ]}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
        {([["products", "Products & inventory"], ["restock", "Restock"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className="px-3 py-1 text-[11px] border"
            style={{
              borderColor: "var(--office-line)",
              background: tab === key ? "var(--office-menu-sel)" : "var(--office-panel-bg)",
              color: tab === key ? "#fff" : undefined,
              fontWeight: tab === key ? 700 : 400,
            }}>
            {label}
          </button>
        ))}
        {lowStockCount > 0 && <span className="opacity-75">{lowStockCount} low</span>}
        {outOfStockCount > 0 && <span className="opacity-75">{outOfStockCount} out</span>}
      </div>

      <div>
        {tab === "products" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Search</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, SKU, or barcode"
                  className="px-1.5 py-0.5 border bg-white w-72" style={{ borderColor: "var(--office-line)" }} />
              </label>
              <span className="ml-auto opacity-75">{stockRows.length} product{stockRows.length === 1 ? "" : "s"}</span>
            </div>

            {loading ? (
              <p className="text-[12px] opacity-60 p-4">Loading…</p>
            ) : (
              <OfficeGrid columns={STOCK_COLUMNS} rows={stockRows} empty="No products." />
            )}
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
    </OfficeShell>
  );
}
