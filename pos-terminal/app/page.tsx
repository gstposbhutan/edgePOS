"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useCustomers } from "@/hooks/use-customers";
import type { Customer } from "@/hooks/use-customers";
import { useSettings } from "@/hooks/use-settings";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeldCarts } from "@/hooks/use-held-carts";
import { useKeyboardRegistry } from "@/hooks/use-keyboard-registry";
import { useUndo } from "@/hooks/use-undo";
import { useLayoutPreset } from "@/hooks/use-layout-preset";
import { usePosShortcuts } from "@/hooks/use-pos-shortcuts";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { generateOrderNo, generateOrderSignature } from "@/lib/gst";
import { todayCompact } from "@/lib/date-utils";
import { LAYOUT_PRESETS, LS_KEYS, SCREEN_LG, CART_WIDTH, MAX_UNDO_STACK, MOVEMENT_TYPE, KHATA_TXN } from "@/lib/constants";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { PaymentModal, type PaymentMethod } from "@/components/pos/payment-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ZReportModal } from "@/components/pos/z-report-modal";
import { ShiftModal } from "@/components/pos/shift-modal";
import { HeldCartsModal } from "@/components/pos/held-carts-modal";
import { HelpOverlay } from "@/components/pos/help-overlay";
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
  Wifi,
  WifiOff,
  DoorOpen,
  DoorClosed,
  FileBarChart,
  Clock,
  ShoppingCart,
  ArrowRight,
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
    selectedLetter,
    setSelectedLetter,
    availableLetters,
    stockFilter,
    setStockFilter,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    findByBarcode,
    refresh: refreshProducts,
    lowStockCount,
    outOfStockCount,
  } = useProducts();
  const {
    items,
    loading: cartLoading,
    subtotal,
    discountTotal,
    taxableSubtotal,
    gstTotal,
    grandTotal,
    taxExempt,
    setTaxExempt,
    subtotalExTax,
    gstTotalExempt,
    grandTotalExempt,
    addItem,
    updateQty,
    applyDiscount,
    overridePrice,
    removeItem,
    clearCart,
    setCustomer: setCartCustomer,
  } = useCart();
  const { customers, createCustomer } = useCustomers();
  const { settings } = useSettings();
  const { activeShift, openShift, closeShift } = useShifts();
  const { favorites, toggleFavorite, isFavorite } = useFavorites(user?.id);
  const { heldCarts, loadHeld, holdCart, recallCart, discardHeld } = useHeldCarts();
  const { registerShortcut } = useKeyboardRegistry();
  const undoStack = useUndo();
  const { layoutPreset, setLayout } = useLayoutPreset();

  const [showScanner, setShowScanner] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showZReport, setShowZReport] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState<"open" | "close" | null>(null);
  const [showHeldCarts, setShowHeldCarts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTabletCart, setShowTabletCart] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [online, setOnline] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [screenWidth, setScreenWidth] = useState(typeof window !== "undefined" ? window.innerWidth : SCREEN_LG);
  const [showCart, setShowCart] = useState(true);
  const anyModalOpen =
    showScanner || showPayment || showCustomer || showReceipt || showZReport ||
    showShiftModal !== null || showHeldCarts || showHelp;

  // Clock
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load held carts on mount
  useEffect(() => { loadHeld(); }, [loadHeld]);

  // Screen width tracking
  useEffect(() => {
    const handler = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Undo stack
  const undoStackRef = useRef<Array<() => void>>([]);
  const pushUndo = useCallback((undo: () => void) => {
    undoStackRef.current.push(undo);
    if (undoStackRef.current.length > MAX_UNDO_STACK) undoStackRef.current.shift();
  }, []);

  // Ref to avoid stale closure in handleRecallCart
  const itemsRefForRecall = useRef(items);
  itemsRefForRecall.current = items;

  const handleUndo = useCallback(async () => {
    const undo = undoStackRef.current.pop();
    if (undo) {
      try {
        await undo();
        toast.success("Undone");
      } catch {
        toast.error("Undo failed");
      }
    } else {
      toast("Nothing to undo");
    }
  }, []);

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
      pushUndo(() => removeItem(product.id));
    },
    [addItem, removeItem, pushUndo]
  );

  const handleVoidLast = useCallback(async () => {
    if (items.length === 0) {
      toast("Cart is empty");
      return;
    }
    const lastItem = items[items.length - 1];
    const originalProduct = products.find((p) => p.id === lastItem.product);
    await removeItem(lastItem.id);
    toast.success(`Voided ${lastItem.name}`);
    if (originalProduct) {
      pushUndo(() => addItem(originalProduct));
    }
  }, [items, products, removeItem, addItem, pushUndo]);

  const handleCheckout = useCallback(async () => {
    if (items.length === 0) return;

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
        const today = todayCompact();
        const count = await pb.collection("orders").getList(1, 1, {
          filter: `order_no ~ "POS-${today}-"`,
          sort: "-created_at",
          requestKey: null,
        });
        const orderNo = generateOrderNo(today, (count.totalItems || 0) + 1);

        const digitalSignature = await generateOrderSignature(
          orderNo,
          taxExempt ? grandTotalExempt : grandTotal,
          settings?.tpn_gstin || "",
          new Date().toISOString()
        );

        const effectiveGstTotal = taxExempt ? 0 : gstTotal;
        const effectiveGrandTotal = taxExempt ? grandTotalExempt : grandTotal;

        const orderPayload = {
          order_type: "POS_SALE",
          order_no: orderNo,
          status: "CONFIRMED",
          items: items.map((i) => ({
            id: i.id,
            product: i.product,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            gst_5: taxExempt ? 0 : i.gst_5,
            total: i.total,
          })),
          subtotal,
          gst_total: effectiveGstTotal,
          grand_total: effectiveGrandTotal,
          payment_method: method,
          payment_ref: ref || "",
          customer_name: selectedCustomer?.debtor_name || "",
          customer_phone: selectedCustomer?.debtor_phone || "",
          created_by: user.id,
          digital_signature: digitalSignature,
        };

        const result = await pb.collection("orders").create(orderPayload, PB_REQ);

        for (const item of items) {
          const product = products.find((p) => p.id === item.product);
          if (!product) continue;
          const newStock = product.current_stock - item.quantity;
          await pb.collection("products").update(product.id, { current_stock: newStock }, PB_REQ);
          await pb.collection("inventory_movements").create({
            product: product.id,
            movement_type: MOVEMENT_TYPE.SALE,
            quantity: -item.quantity,
            reference_id: result.id,
            notes: `Sale: ${orderNo}`,
          }, PB_REQ);
        }

        if (method === "credit" && selectedCustomer) {
          const newBalance = selectedCustomer.outstanding_balance + effectiveGrandTotal;
          await pb.collection("khata_accounts").update(selectedCustomer.id, { outstanding_balance: newBalance }, PB_REQ);
          await pb.collection("khata_transactions").create({
            khata_account: selectedCustomer.id,
            transaction_type: KHATA_TXN.DEBIT,
            amount: effectiveGrandTotal,
            reference_id: result.id,
            notes: `Purchase on credit — ${orderNo}`,
          }, PB_REQ);
        }

        await clearCart();
        await refreshProducts();

        setShowPayment(false);
        setLastOrder({ ...orderPayload, id: result.id, created_at: result.created_at });
        setShowReceipt(true);
        undoStackRef.current = [];
        toast.success(`Order ${orderNo} confirmed`);
      } catch (err: any) {
        console.error("Checkout error:", err);
        toast.error(err.message || "Checkout failed");
      }
    },
    [user, items, products, subtotal, gstTotal, grandTotal, subtotalExTax, gstTotalExempt, grandTotalExempt, taxExempt, settings, pb, clearCart, refreshProducts, selectedCustomer]
  );

  const handleSelectCustomer = useCallback(
    async (customer: any) => {
      setCartCustomer(customer.id);
      setSelectedCustomer(customer);
    },
    [setCartCustomer]
  );

  const handleCreateCustomer = useCallback(
    async (data: { debtor_name: string; debtor_phone: string }) => {
      const result = await createCustomer(data);
      if (result.success && result.record) {
        setCartCustomer(result.record.id);
        setSelectedCustomer(result.record);
        toast.success("Customer added");
      }
    },
    [createCustomer, setCartCustomer]
  );

  const handleNewTransaction = useCallback(async () => {
    if (items.length === 0) return;
    const confirmed = window.confirm("Clear cart and start new transaction?");
    if (confirmed) {
      await clearCart();
      undoStackRef.current = [];
      toast.success("New transaction started");
    }
  }, [items, clearCart]);

  const handleHoldCart = useCallback(async () => {
    if (items.length === 0) {
      toast("Cart is empty");
      return;
    }
    const label = `Cart ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    const result = await holdCart(items, label);
    if (result.success) {
      await clearCart();
      toast.success(`Cart held: ${label}`);
    } else {
      toast.error(result.error || "Failed to hold cart");
    }
  }, [items, holdCart, clearCart]);

  const handleRecallCart = useCallback(
    async (cartId: string) => {
      const cart = recallCart(cartId);
      if (!cart) return;

      try {
        await clearCart();
        for (const item of cart.items) {
          const fullProduct = products.find((p) => p.id === item.product);
          if (!fullProduct) continue;

          try {
            // addItem handles duplicate detection — if product already in cart, it increments
            await addItem(fullProduct);
            // After addItem, we need to set the exact quantity from the held cart
            // addItem defaults to qty=1 (or increments existing). Force the exact qty.
            if (item.quantity > 1) {
              // Brief delay to let React state settle after addItem
              await new Promise((r) => setTimeout(r, 50));
              // Find the item that was just added by matching product ID
              const cartItem = itemsRefForRecall.current.find(
                (ci: { product: string }) => ci.product === item.product
              );
              if (cartItem && cartItem.quantity !== item.quantity) {
                await updateQty(cartItem.id, item.quantity);
              }
            }
          } catch {
            /* continue to next item */
          }
        }
        setShowHeldCarts(false);
        toast.success(`Recalled: ${cart.label}`);
      } catch {
        toast.error("Failed to recall cart");
      }
    },
    [recallCart, clearCart, addItem, updateQty, products]
  );

  const handleNewSale = useCallback(() => {
    setShowReceipt(false);
    setLastOrder(null);
  }, []);

  // Keyboard shortcuts
  const setupShortcuts = usePosShortcuts({
    items,
    lastOrder,
    showPayment,
    showHeldCarts,
    showCustomer,
    setShowPayment,
    setShowHeldCarts,
    showHelpToggle: () => setShowHelp((prev) => !prev),
    setShowCustomer,
    setShowReceipt,
    setSearchQuery,
    handleNewTransaction,
    handleHoldCart,
    handleCheckout,
    handleVoidLast,
    handleUndo,
    applyDiscount,
    removeItem,
    setLayout,
  });
  useEffect(() => setupShortcuts(), [setupShortcuts]);

  // Type-to-search: capture keystrokes when no modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Arrow keys for product grid navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, products.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < products.length) {
        e.preventDefault();
        handleAddProduct(products[highlightedIndex]);
        return;
      }

      // Backspace: remove last character from search
      if (e.key === "Backspace") {
        e.preventDefault();
        setSearchQuery((prev) => prev.slice(0, -1));
        searchInputRef.current?.focus();
        return;
      }

      // Escape: clear search
      if (e.key === "Escape") {
        setSearchQuery("");
        searchInputRef.current?.focus();
        return;
      }

      // Any alphanumeric: append to search
      if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSearchQuery((prev) => prev + e.key);
        setHighlightedIndex(0);
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [anyModalOpen, products, highlightedIndex, setSearchQuery, handleAddProduct]);

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const cartColumnWidth = layoutPreset === "fullcart" ? CART_WIDTH.FULL : layoutPreset === "compact" ? CART_WIDTH.COMPACT : CART_WIDTH.STANDARD;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-lg">🏔️</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-heading font-bold text-base leading-tight">
                {settings?.store_name || "NEXUS BHUTAN"}
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">POS Terminal</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground border-l border-border pl-4">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{currentTime}</span>
          </div>
          <Badge
            variant={online ? "outline" : "destructive"}
            className={`text-[10px] gap-1 ${online ? "border-emerald-500/30 text-emerald-400" : ""}`}
          >
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          {(lowStockCount > 0 || outOfStockCount > 0) && (
            <Badge variant="outline" className="text-[10px] border-warning/50 text-warning gap-1">
              {outOfStockCount > 0 && (
                <span className="bg-destructive/20 text-destructive rounded px-1 text-[9px]">
                  {outOfStockCount} OUT
                </span>
              )}
              {lowStockCount > 0 && (
                <span className="bg-warning/20 text-warning rounded px-1 text-[9px]">
                  {lowStockCount} LOW
                </span>
              )}
            </Badge>
          )}
          {/* Layout preset toggles */}
          <div className="hidden lg:flex items-center gap-0.5 ml-2">
            <Button
              variant={layoutPreset === LAYOUT_PRESETS.STANDARD ? "default" : "ghost"}
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setLayout(LAYOUT_PRESETS.STANDARD)}
            >
              Std
            </Button>
            <Button
              variant={layoutPreset === LAYOUT_PRESETS.COMPACT ? "default" : "ghost"}
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setLayout(LAYOUT_PRESETS.COMPACT)}
            >
              Cpt
            </Button>
            <Button
              variant={layoutPreset === LAYOUT_PRESETS.FULLCART ? "default" : "ghost"}
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setLayout(LAYOUT_PRESETS.FULLCART)}
            >
              Full
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <div className="hidden md:flex items-center gap-0.5">
            <Link href="/inventory">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Package className="h-4 w-4 mr-1.5" />
                Inventory
              </Button>
            </Link>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <ClipboardList className="h-4 w-4 mr-1.5" />
                Orders
              </Button>
            </Link>
            <Link href="/customers">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Users className="h-4 w-4 mr-1.5" />
                Customers
              </Button>
            </Link>
          </div>
          <div className="hidden md:block w-px h-6 bg-border mx-1" />
          {!activeShift ? (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("open")} className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              <DoorOpen className="h-4 w-4 mr-1.5" />
              Open Shift
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("close")} className="border-warning/30 text-warning hover:bg-warning/10">
              <DoorClosed className="h-4 w-4 mr-1.5" />
              Close Shift
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setShowZReport(true)}>
            <FileBarChart className="h-4 w-4" />
          </Button>
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Product Grid */}
        <div className={`flex-1 min-w-0 ${layoutPreset === "fullcart" && !showCart ? "hidden" : ""}`}>
          <ProductGrid
            products={products}
            categories={categories}
            loading={productsLoading}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedLetter={selectedLetter}
            setSelectedLetter={setSelectedLetter}
            availableLetters={availableLetters}
            stockFilter={stockFilter}
            setStockFilter={setStockFilter}
            priceMin={priceMin}
            setPriceMin={setPriceMin}
            priceMax={priceMax}
            setPriceMax={setPriceMax}
            sortField={sortField}
            setSortField={setSortField}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            onAddProduct={handleAddProduct}
            onScan={() => setShowScanner(true)}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
            isFavorite={isFavorite}
            highlightedIndex={highlightedIndex}
            setHighlightedIndex={setHighlightedIndex}
          />
        </div>

        {/* Cart Panel — always visible on lg+, slide-over on md */}
        {(showCart || screenWidth >= SCREEN_LG) && (
          <div className={`${cartColumnWidth} shrink-0 hidden md:block ${layoutPreset === "fullcart" && !showCart ? "hidden" : ""}`}>
            <CartPanel
              items={items}
              customer={selectedCustomer}
              subtotal={subtotal}
              discountTotal={discountTotal}
              taxableSubtotal={taxableSubtotal}
              gstTotal={gstTotal}
              grandTotal={grandTotal}
              taxExempt={taxExempt}
              setTaxExempt={setTaxExempt}
              grandTotalExempt={grandTotalExempt}
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
        )}

        {/* Tablet Cart Slide-over */}
        {showTabletCart && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowTabletCart(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[85vw]">
              <CartPanel
                items={items}
                customer={selectedCustomer}
                subtotal={subtotal}
                discountTotal={discountTotal}
                taxableSubtotal={taxableSubtotal}
                gstTotal={gstTotal}
                grandTotal={grandTotal}
                taxExempt={taxExempt}
                setTaxExempt={setTaxExempt}
                grandTotalExempt={grandTotalExempt}
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
        )}
      </div>

      {/* Mobile/Tablet Floating Cart Button */}
      <div className="md:hidden fixed bottom-4 right-4 z-50">
        <Button
          size="lg"
          className="rounded-full shadow-lg h-14 w-14 relative"
          onClick={() => setShowTabletCart(!showTabletCart)}
        >
          <ShoppingCart className="h-6 w-6" />
          {totalItemsCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {totalItemsCount}
            </span>
          )}
        </Button>
      </div>

      {/* Quick Checkout bar for md screens */}
      <div className="hidden md:flex lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {totalItemsCount} items
          </span>
          <span className="text-lg font-bold text-primary tabular-nums">
            Nu. {taxExempt ? grandTotalExempt.toFixed(0) : grandTotal.toFixed(0)}
          </span>
        </div>
        <Button onClick={handleCheckout} disabled={items.length === 0}>
          Checkout
          <ArrowRight className="h-4 w-4 ml-2" />
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
        grandTotal={taxExempt ? grandTotalExempt : grandTotal}
        customer={selectedCustomer}
        onConfirm={handlePaymentConfirm}
      />

      <CustomerModal
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        customers={customers}
        selectedCustomer={selectedCustomer}
        onSelect={handleSelectCustomer}
        onCreate={handleCreateCustomer}
      />

      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        onNewSale={handleNewSale}
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

      <HeldCartsModal
        open={showHeldCarts}
        onClose={() => setShowHeldCarts(false)}
        heldCarts={heldCarts}
        onRecall={handleRecallCart}
        onDiscard={discardHeld}
      />

      <HelpOverlay
        open={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}
