"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useCustomers } from "@/hooks/use-customers";
import { useOrders } from "@/hooks/use-orders";
import { useSettings } from "@/hooks/use-settings";
import { getPB } from "@/lib/pb-client";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { PaymentModal, type PaymentMethod } from "@/components/pos/payment-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ZReportModal } from "@/components/pos/z-report-modal";
import { ShiftModal } from "@/components/pos/shift-modal";
import { useShifts } from "@/hooks/use-shifts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LogOut,
  Settings,
  Package,
  ClipboardList,
  Users,
  ScanLine,
  Wifi,
  WifiOff,
  DoorOpen,
  DoorClosed,
  FileBarChart,
} from "lucide-react";
import Link from "next/link";

export default function PosPage() {
  const router = useRouter();
  const pb = getPB();
  const { user, isAuthenticated, signOut, isManager, loading: authLoading } = useAuth();
  const {
    products,
    categories,
    loading: productsLoading,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    findByBarcode,
    refresh: refreshProducts,
    lowStockCount,
    outOfStockCount,
  } = useProducts();
  const {
    cart,
    items,
    loading: cartLoading,
    subtotal,
    discountTotal,
    taxableSubtotal,
    gstTotal,
    grandTotal,
    addItem,
    updateQty,
    applyDiscount,
    overridePrice,
    removeItem,
    clearCart,
    setCustomer: setCartCustomer,
  } = useCart();
  const { customers, createCustomer } = useCustomers();
  const { createOrder } = useOrders();
  const { settings } = useSettings();
  const { activeShift, openShift, closeShift } = useShifts();

  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showZReport, setShowZReport] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState<"open" | "close" | null>(null);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [online, setOnline] = useState(true);

  const handleShiftAction = useCallback(async (amount: number) => {
    if (!user) return { success: false, error: "Not authenticated" };
    if (showShiftModal === "open") {
      return await openShift(user.id, amount);
    } else {
      if (!activeShift) return { success: false, error: "No active shift" };
      return await closeShift(activeShift.id, user.id, amount);
    }
  }, [user, showShiftModal, openShift, activeShift, closeShift]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !user) {
      router.push("/login");
    }
  }, [isAuthenticated, user, authLoading, router]);

  // Hooks now listen to pb.authStore.onChange and auto-refresh when auth
  // becomes valid — no manual refresh trigger needed.

  // Online status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleScan = useCallback(
    async (barcode: string) => {
      const product = await findByBarcode(barcode);
      if (product) {
        if (product.current_stock <= 0) {
          toast.error(`${product.name} is out of stock`);
          return;
        }
        await addItem(product);
        toast.success(`Added ${product.name}`);
      } else {
        toast.error(`Product not found for barcode: ${barcode}`);
      }
    },
    [findByBarcode, addItem]
  );

  const handleAddProduct = useCallback(
    async (product: any) => {
      if (product.current_stock <= 0) {
        toast.error("Product is out of stock");
        return;
      }
      await addItem(product);
    },
    [addItem]
  );

  const handleCheckout = useCallback(async () => {
    if (items.length === 0) return;

    // Stock validation
    for (const item of items) {
      const product = products.find((p) => p.id === item.product);
      if (!product) continue;
      if (product.current_stock < item.quantity) {
        toast.error(`Insufficient stock for ${item.name}. Available: ${product.current_stock}`);
        return;
      }
    }

    setShowPayment(true);
  }, [items, products]);

  const handlePaymentConfirm = useCallback(
    async (method: PaymentMethod, ref: string, tendered?: number) => {
      if (!user) return;

      try {
        const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const count = await pb.collection("orders").getList(1, 1, {
          filter: `order_no ~ "POS-${today}-"`,
          sort: "-created",
        });
        const seq = (count.totalItems || 0) + 1;
        const orderNo = `POS-${today}-${String(seq).padStart(4, "0")}`;

        const customer = cart?.expand?.customer;
        const timestamp = new Date().toISOString();
        const sigPayload = `${orderNo}:${grandTotal}:${settings?.tpn_gstin || ""}:${timestamp}`;
        const sigBytes = new TextEncoder().encode(sigPayload);
        const hashBuffer = await crypto.subtle.digest("SHA-256", sigBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const digitalSignature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

        // Build order payload
        const orderPayload = {
          order_no: orderNo,
          status: "confirmed",
          items: items.map((i) => ({
            id: i.id,
            product: i.product,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            gst_amount: i.gst_amount,
            total: i.total,
          })),
          subtotal,
          gst_total: gstTotal,
          grand_total: grandTotal,
          payment_method: method,
          payment_ref: ref || "",
          customer: customer?.id || null,
          customer_name: customer?.name || "",
          customer_phone: customer?.phone || "",
          cashier: user.id,
          digital_signature: digitalSignature,
        };

        // Create order
        const result = await pb.collection("orders").create(orderPayload);

        // Deduct stock
        for (const item of items) {
          const product = products.find((p) => p.id === item.product);
          if (!product) continue;
          const newStock = product.current_stock - item.quantity;
          await pb.collection("products").update(product.id, { current_stock: newStock });
          await pb.collection("inventory_movements").create({
            product: product.id,
            type: "sale",
            quantity: -item.quantity,
            order: result.id,
            notes: `Sale: ${orderNo}`,
          });
        }

        // Credit / Khata handling
        if (method === "credit" && customer) {
          const newBalance = customer.credit_balance + grandTotal;
          await pb.collection("customers").update(customer.id, { credit_balance: newBalance });
          await pb.collection("khata_transactions").create({
            customer: customer.id,
            type: "debit",
            amount: grandTotal,
            order: result.id,
            notes: `Purchase on credit — ${orderNo}`,
          });
        }

        // Clear cart
        await clearCart();
        await refreshProducts();

        setShowPayment(false);
        setLastOrder({ ...orderPayload, id: result.id, created: result.created });
        setShowReceipt(true);
        toast.success(`Order ${orderNo} confirmed`);
      } catch (err: any) {
        console.error("Checkout error:", err);
        toast.error(err.message || "Checkout failed");
      }
    },
    [user, cart, items, products, subtotal, gstTotal, grandTotal, settings, pb, clearCart, refreshProducts]
  );

  const handleSelectCustomer = useCallback(
    async (customer: any) => {
      await setCartCustomer(customer.id);
    },
    [setCartCustomer]
  );

  const handleCreateCustomer = useCallback(
    async (data: { name: string; phone: string }) => {
      const result = await createCustomer(data);
      if (result.success && result.record) {
        await setCartCustomer(result.record.id);
        toast.success("Customer added");
      }
    },
    [createCustomer, setCartCustomer]
  );

  // Wait for auth initialization before deciding what to render
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Not authenticated — redirect handled by useEffect above
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏔️</span>
            <h1 className="font-serif font-bold text-lg hidden sm:block">NEXUS BHUTAN</h1>
          </div>
          <Badge variant={online ? "outline" : "destructive"} className="text-xs">
            {online ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {online ? "Online" : "Offline"}
          </Badge>
          {(lowStockCount > 0 || outOfStockCount > 0) && (
            <Badge variant="outline" className="text-xs border-warning text-warning">
              {outOfStockCount > 0 && `${outOfStockCount} out`}
              {outOfStockCount > 0 && lowStockCount > 0 && ", "}
              {lowStockCount > 0 && `${lowStockCount} low`}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Link href="/inventory">
            <Button variant="ghost" size="sm">
              <Package className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Inventory</span>
            </Button>
          </Link>
          <Link href="/orders">
            <Button variant="ghost" size="sm">
              <ClipboardList className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Orders</span>
            </Button>
          </Link>
          <Link href="/customers">
            <Button variant="ghost" size="sm">
              <Users className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Customers</span>
            </Button>
          </Link>
          {!activeShift ? (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("open")}>
              <DoorOpen className="h-4 w-4 mr-1" />
              Open Shift
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("close")}>
              <DoorClosed className="h-4 w-4 mr-1" />
              Close Shift
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowZReport(true)}>
            <FileBarChart className="h-4 w-4" />
          </Button>
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          <ProductGrid
            products={products}
            categories={categories}
            loading={productsLoading}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            onAddProduct={handleAddProduct}
            onScan={() => setShowScanner(true)}
          />
        </div>

        {/* Cart Panel */}
        <div className="w-[380px] shrink-0 hidden lg:block">
          <CartPanel
            items={items}
            customer={cart?.expand?.customer || null}
            subtotal={subtotal}
            discountTotal={discountTotal}
            taxableSubtotal={taxableSubtotal}
            gstTotal={gstTotal}
            grandTotal={grandTotal}
            loading={cartLoading}
            isManager={isManager}
            onUpdateQty={updateQty}
            onRemove={removeItem}
            onApplyDiscount={applyDiscount}
            onOverridePrice={overridePrice}
            onClear={clearCart}
            onCheckout={handleCheckout}
            onSelectCustomer={() => setShowCustomer(true)}
          />
        </div>
      </div>

      {/* Mobile Cart Button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Button size="lg" className="rounded-full shadow-lg" onClick={handleCheckout}>
          <ScanLine className="h-5 w-5 mr-2" />
          Checkout Nu. {grandTotal.toFixed(0)}
        </Button>
      </div>

      {/* Modals */}
      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
      />

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        grandTotal={grandTotal}
        customer={cart?.expand?.customer || null}
        onConfirm={handlePaymentConfirm}
      />

      <CustomerModal
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        customers={customers}
        selectedCustomer={cart?.expand?.customer || null}
        onSelect={handleSelectCustomer}
        onCreate={handleCreateCustomer}
      />

      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        order={lastOrder}
        settings={settings}
      />

      <ZReportModal
        open={showZReport}
        onClose={() => setShowZReport(false)}
      />

      <ShiftModal
        open={showShiftModal !== null}
        onClose={() => setShowShiftModal(null)}
        mode={showShiftModal || "open"}
        onConfirm={handleShiftAction}
      />
    </div>
  );
}
