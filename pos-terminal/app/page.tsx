"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useHeldCarts } from "@/hooks/use-held-carts";
import { useUndo } from "@/hooks/use-undo";
import { usePosShortcuts } from "@/hooks/use-pos-shortcuts";
import { useCheckout } from "@/hooks/use-checkout";
import { useProducts } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useLayoutPreset } from "@/hooks/use-layout-preset";
import { useCustomers } from "@/hooks/use-customers";
import type { Customer } from "@/hooks/use-customers";
import { getPB } from "@/lib/pb-client";
import { LAYOUT_PRESETS, SCREEN_LG, CART_WIDTH } from "@/lib/constants";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { PaymentModal, type PaymentMethod } from "@/components/pos/payment-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ZReportModal } from "@/components/pos/z-report-modal";
import { ShiftModal } from "@/components/pos/shift-modal";
import type { ShiftReconciliation } from "@/components/pos/shift-modal";
import { HeldCartsModal } from "@/components/pos/held-carts-modal";
import { HelpOverlay } from "@/components/pos/help-overlay";
import { useShifts } from "@/hooks/use-shifts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  LogOut,
  Settings,
  Package,
  ClipboardList,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  DoorOpen,
  DoorClosed,
  FileBarChart,
  Clock,
  ShoppingCart,
  ArrowRight,
  Sun,
  Moon,
} from "lucide-react";
import Link from "next/link";

export default function PosPage() {
  const router = useRouter();
  const { user, isAuthenticated, signOut, isManager, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !user) {
      router.push("/login/");
    }
  }, [isAuthenticated, user, authLoading, router]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!isAuthenticated) return null;

  return <PosTerminal user={user} isManager={isManager} signOut={signOut} />;
}

function PosTerminal({ user, isManager, signOut }: { user: any; isManager: boolean; signOut: () => void }) {
  const {
    products,
    loading: productsLoading,
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    selectedLetter, setSelectedLetter,
    availableLetters,
    stockFilter, setStockFilter,
    priceMin, setPriceMin, priceMax, setPriceMax,
    sortField, setSortField, sortOrder, setSortOrder,
    findByBarcode, refresh: refreshProducts,
    lowStockCount, outOfStockCount,
  } = useProducts();
  const {
    items, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal,
    taxExempt, setTaxExempt,
    subtotalExTax, gstTotalExempt, grandTotalExempt,
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart,
    setCustomer: setCartCustomer,
  } = useCart();
  const { customers, createCustomer } = useCustomers();
  const { settings } = useSettings();
  const { activeShift, openShift, closeShift, getReconciliation, loading: shiftLoading } = useShifts();
  const { favorites, toggleFavorite, isFavorite } = useFavorites(user?.id);
  const { heldCarts, loadHeld, holdCart, recallCart, discardHeld } = useHeldCarts();
  const undoStack = useUndo();
  const { layoutPreset, setLayout } = useLayoutPreset();

  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const pb = getPB();

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
  const [reconData, setReconData] = useState<ShiftReconciliation | null>(null);
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

  const { validateStock, confirmPayment } = useCheckout({
    pb,
    user,
    items,
    products,
    subtotal,
    gstTotal,
    grandTotal,
    taxExempt,
    grandTotalExempt,
    settings,
    selectedCustomer,
    clearCart: async () => { await clearCart(); },
    refreshProducts,
    clearUndoStack: () => undoStack.clear(),
  });
    showScanner || showPayment || showCustomer || showReceipt || showZReport ||
    showShiftModal !== null || showHeldCarts || showHelp;

  // Auto-prompt shift open when no active shift (once data loads)
  const [hasPromptedShift, setHasPromptedShift] = useState(false);
  useEffect(() => {
    if (!shiftLoading && !activeShift && !hasPromptedShift && !anyModalOpen) {
      setShowShiftModal("open");
      setHasPromptedShift(true);
    }
    if (activeShift) {
      setHasPromptedShift(true);
    }
  }, [shiftLoading, activeShift, hasPromptedShift, anyModalOpen]);

  // Fetch reconciliation data when closing shift
  useEffect(() => {
    if (showShiftModal === "close" && activeShift) {
      getReconciliation(activeShift.id).then(setReconData);
    } else {
      setReconData(null);
    }
  }, [showShiftModal, activeShift, getReconciliation]);

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

  // Ref to avoid stale closure in handleRecallCart
  const itemsRefForRecall = useRef(items);
  itemsRefForRecall.current = items;

  const handleUndo = useCallback(async () => {
    const result = await undoStack.undo();
    if (result.ok) toast.success("Undone");
    else toast("Nothing to undo");
  }, [undoStack]);

  const handleShiftAction = useCallback(async (amount: number) => {
    if (!user) return { success: false, error: "Not authenticated" };
    if (showShiftModal === "open") {
      return await openShift(user.id, amount);
    } else {
      if (!activeShift) return { success: false, error: "No active shift" };
      return await closeShift(activeShift.id, user.id, amount);
    }
  }, [user, showShiftModal, openShift, activeShift, closeShift]);

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
        const result = await addItem(product);
        if (result.success) toast.success(`Added ${product.name}`);
        else toast.error(result.error || "Failed to add item");
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
      const result = await addItem(product);
      if (result.success) {
        undoStack.push(() => { removeItem(product.id); });
      }
    },
    [addItem, removeItem, undoStack]
  );

  const handleVoidLast = useCallback(async () => {
    if (items.length === 0) {
      toast("Cart is empty");
      return;
    }
    const lastItem = items[items.length - 1];
    const originalProduct = products.find((p) => p.id === lastItem.product);
    const result = await removeItem(lastItem.id);
    if (result.success) {
      toast.success(`Voided ${lastItem.name}`);
      if (originalProduct) {
        undoStack.push(() => { addItem(originalProduct); });
      }
    } else {
      toast.error(result.error || "Failed to void item");
    }
  }, [items, products, removeItem, addItem, undoStack]);

  const handleCheckout = useCallback(async () => {
    if (!activeShift) {
      toast.error("No active shift. Please open a shift first.");
      setShowShiftModal("open");
      return;
    }
    if (validateStock()) {
      setShowPayment(true);
    }
  }, [validateStock, activeShift]);

  const handlePaymentConfirm = useCallback(
    async (method: string, ref: string, tendered?: number) => {
      await confirmPayment(method, ref, tendered, (orderPayload, _orderId) => {
        setShowPayment(false);
        setLastOrder(orderPayload);
        setShowReceipt(true);
      });
    },
    [confirmPayment]
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
      const result = await clearCart();
      if (result.success) {
        undoStack.clear();
        toast.success("New transaction started");
      } else {
        toast.error(result.error || "Failed to clear cart");
      }
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

      const cleared = await clearCart();
      if (!cleared.success) {
        toast.error("Failed to clear current cart");
        return;
      }
      for (const item of cart.items) {
        const fullProduct = products.find((p) => p.id === item.product);
        if (!fullProduct) continue;

        const added = await addItem(fullProduct);
        if (!added.success) continue;
        if (item.quantity > 1) {
          await new Promise((r) => setTimeout(r, 50));
          const cartItem = itemsRefForRecall.current.find(
            (ci: { product: string }) => ci.product === item.product
          );
          if (cartItem && cartItem.quantity !== item.quantity) {
            await updateQty(cartItem.id, item.quantity);
          }
        }
      }
      setShowHeldCarts(false);
      toast.success(`Recalled: ${cart.label}`);
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
        setSearchQuery(searchQuery.slice(0, -1));
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
        setSearchQuery(searchQuery + e.key);
        setHighlightedIndex(0);
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [anyModalOpen, products, highlightedIndex, setSearchQuery, handleAddProduct]);

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
            <Link href="/adjustments">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Wallet className="h-4 w-4 mr-1.5" />
                Cash
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
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
            onAddProduct={handleAddProduct}
            onScan={() => setShowScanner(true)}
            highlightedIndex={highlightedIndex}
            setHighlightedIndex={setHighlightedIndex}
          />
        </div>

        {/* Cart Panel — always visible on lg+, slide-over on md */}
        {(showCart || screenWidth >= SCREEN_LG) && (
          <div className={`${cartColumnWidth} shrink-0 hidden md:block ${layoutPreset === "fullcart" && !showCart ? "hidden" : ""}`}>
          <CartPanel
            customer={selectedCustomer}
            isManager={isManager}
            onCheckout={handleCheckout}
            onSelectCustomer={() => setShowCustomer(true)}
            noShift={!activeShift}
          />
          </div>
        )}

        {/* Tablet Cart Slide-over */}
        {showTabletCart && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowTabletCart(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[85vw]">
              <CartPanel
                customer={selectedCustomer}
                isManager={isManager}
                onCheckout={handleCheckout}
                onSelectCustomer={() => setShowCustomer(true)}
                noShift={!activeShift}
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
        reconciliation={reconData || undefined}
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
