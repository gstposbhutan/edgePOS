"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useHeldCarts } from "@/hooks/use-held-carts";
import { useUndo } from "@/hooks/use-undo";
import { usePosShortcuts } from "@/hooks/use-pos-shortcuts";
import { useCheckout } from "@/hooks/use-checkout";
import { useProducts, type Product } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useLayoutPreset } from "@/hooks/use-layout-preset";
import { useCustomers } from "@/hooks/use-customers";
import type { Customer } from "@/hooks/use-customers";
import { getPB } from "@/lib/pb-client";
import { peekNextOrderNo } from "@/lib/invoice-header";
import { priceFor, PRICE_LIST_LABEL, PRICE_LIST_ORDER, parsePriceListMode } from "@/lib/price-list";
import type { PriceListMode } from "@/lib/price-list";
import { LAYOUT_PRESETS, SCREEN_LG, CART_WIDTH } from "@/lib/constants";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { CartTable } from "@/components/pos/keyboard/cart-table";
import { ProductSearchModal } from "@/components/pos/keyboard/product-search-modal";
import { ListingFooter } from "@/components/pos/keyboard/listing-footer";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { PaymentModal } from "@/components/pos/payment-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { InvoiceSearchModal } from "@/components/pos/invoice-search-modal";
import { SalespersonPickerModal, type TeamUser } from "@/components/pos/salesperson-picker-modal";
import { ComplimentaryConfirmModal } from "@/components/pos/complimentary-confirm-modal";
import { QuotationConfirmModal } from "@/components/pos/quotation-confirm-modal";
import { PostMarketModal } from "@/components/pos/post-market-modal";
import { DeliveryAddressModal } from "@/components/pos/delivery-address-modal";
import { ExchangeModal } from "@/components/pos/exchange-modal";
import { ReceiptModal } from "@/components/pos/receipt-modal";
import { ZReportModal } from "@/components/pos/z-report-modal";
import { ShiftModal } from "@/components/pos/shift-modal";
import type { ShiftReconciliation } from "@/components/pos/shift-modal";
import { HandoverModal } from "@/components/pos/handover-modal";
import { HeldCartsModal } from "@/components/pos/held-carts-modal";
import { HelpOverlay } from "@/components/pos/help-overlay";
import { WeightEntryModal } from "@/components/pos/weight-entry-modal";
import { printLabel } from "@/lib/print-label";
import { loadLabelConfig } from "@/lib/label-config";
import { useShifts } from "@/hooks/use-shifts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  LogOut,
  Settings,
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
  FilePlus,
  Hash,
  CalendarClock,
  Tags,
  List,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const LoginFallback = dynamic(() => import("@/app/login/page"), { ssr: false });

export default function PosPage() {
  const { user, isAuthenticated, signOut, switchUser, isManager, isOwner, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!isAuthenticated) return <LoginFallback />;

  return <PosTerminal user={user} isManager={isManager} isOwner={isOwner} signOut={signOut} switchUser={switchUser} />;
}

function PosTerminal({ user, isManager, isOwner, signOut, switchUser }: { user: any; isManager: boolean; isOwner: boolean; signOut: () => void; switchUser: (email: string, password: string) => Promise<{ success: boolean; error: string | null }> }) {
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
  // Declared above useCart() so newly-added lines price at the active tier.
  const [priceListMode, setPriceListMode] = useState<PriceListMode>(() =>
    parsePriceListMode(typeof window !== "undefined" ? localStorage.getItem("pos_price_list") : null)
  );

  const {
    items, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal, billDiscount,
    taxExempt, setTaxExempt,
    subtotalExTax, gstTotalExempt, grandTotalExempt,
    addItem, updateQty, applyDiscount, applyBillDiscount, overridePrice, removeItem, clearCart,
    setCustomer: setCartCustomer,
  } = useCart(priceListMode);
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
  const [showHandover, setShowHandover] = useState(false);
  // Set when the handover modal routes to the close-shift flow: once the close
  // succeeds we sign the cashier out (the act they originally requested).
  const [pendingSignOut, setPendingSignOut] = useState(false);
  const [showHeldCarts, setShowHeldCarts] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTabletCart, setShowTabletCart] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [weighProduct, setWeighProduct] = useState<Product | null>(null);
  const [reconData, setReconData] = useState<ShiftReconciliation | null>(null);
  const [online, setOnline] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [showSalesperson, setShowSalesperson] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<TeamUser | null>(null);
  const [showComplimentary, setShowComplimentary] = useState(false);
  const [showExchange, setShowExchange] = useState(false);
  const [showPostMarket, setShowPostMarket] = useState(false);
  const [showQuotation, setShowQuotation] = useState(false);
  const [quotationSaving, setQuotationSaving] = useState(false);
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [complimentaryReason, setComplimentaryReason] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [screenWidth, setScreenWidth] = useState(typeof window !== "undefined" ? window.innerWidth : SCREEN_LG);
  const [showCart, setShowCart] = useState(true);

  // Input mode: "listing" = keyboard-driven cart table (web parity, default),
  // "grid" = the touch card grid. Persisted per-station; SSR/first-render is
  // guarded so the server and client agree until the effect reads localStorage.
  const [inputMode, setInputMode] = useState<"listing" | "grid">("listing");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pos_input_mode");
      if (saved === "grid" || saved === "listing") setInputMode(saved);
    } catch { /* no localStorage — keep the default */ }
  }, []);
  const changeInputMode = useCallback((mode: "listing" | "grid") => {
    setInputMode(mode);
    try { localStorage.setItem("pos_input_mode", mode); } catch { /* ignore */ }
  }, []);

  // Listing-mode cart row selection + inline-qty-edit handle (mirrors web's
  // selectedRow + editRowRef). Unused in grid mode.
  const [selectedRow, setSelectedRow] = useState(0);
  const editRowRef = useRef<((index: number) => void) | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");

  const anyModalOpen =
    showScanner || showPayment || showCustomer || showReceipt || showZReport ||
    showShiftModal !== null || showHandover || showHeldCarts || showHelp || showSearch;

  const { validateStock, confirmPayment, saveQuotation } = useCheckout({
    pb,
    user,
    items,
    products,
    subtotal,
    gstTotal,
    grandTotal,
    billDiscount,
    taxExempt,
    grandTotalExempt,
    settings,
    selectedCustomer,
    clearCart: async () => { await clearCart(); },
    refreshProducts,
    clearUndoStack: () => undoStack.clear(),
    invoiceDate: dateOverride,
    isOwner,
    salespersonId: selectedSalesperson?.id ?? null,
    deliveryAddress,
    complimentaryReason,
  });

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

  // Live invoice header — peek the next order number for display. Minted at
  // checkout via the same peekNextOrderNo helper, so preview === final in the
  // single-terminal case. Refresh on mount, every 60s, and after each sale.
  const refreshInvoiceHeader = useCallback(async () => {
    try {
      setNextInvoiceNo(await peekNextOrderNo(pb));
    } catch {
      /* offline / empty — keep the last known number */
    }
  }, [pb]);

  useEffect(() => {
    refreshInvoiceHeader();
    const t = setInterval(refreshInvoiceHeader, 60_000);
    return () => clearInterval(t);
  }, [refreshInvoiceHeader]);

  // Load held carts on mount
  useEffect(() => { loadHeld(); }, [loadHeld]);

  // Keep the listing-mode cart selection in range as items come and go.
  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return; }
    setSelectedRow((r) => Math.min(r, items.length - 1));
  }, [items.length]);

  // Open the listing-mode product search, seeded with the char that triggered it.
  const openSearch = useCallback((seed: string) => {
    setSearchSeed(seed);
    setShowSearch(true);
  }, []);

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
      const result = await closeShift(activeShift.id, user.id, amount);
      // If this close came from the sign-out handover prompt, complete the sign-out
      // the cashier asked for once the shift is reconciled and closed.
      if (result.success && pendingSignOut) {
        setPendingSignOut(false);
        signOut();
      }
      return result;
    }
  }, [user, showShiftModal, openShift, activeShift, closeShift, pendingSignOut, signOut]);

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
        if (product.sold_by_weight) {
          setWeighProduct(product);
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
      if (product.sold_by_weight) {
        setWeighProduct(product);
        return;
      }
      const result = await addItem(product);
      if (result.success) {
        undoStack.push(() => { removeItem(product.id); });
      }
    },
    [addItem, removeItem, undoStack]
  );

  // Confirm a weighed item: add it at quantity = weight, unit_price = per-unit rate, and
  // optionally print its barcode label (name + weight + computed price).
  const handleWeighConfirm = useCallback(
    async (weight: number, print: boolean) => {
      const product = weighProduct;
      if (!product) return;
      setWeighProduct(null);
      const result = await addItem(product, weight);
      if (!result.success) {
        toast.error(result.error || "Failed to add item");
        return;
      }
      const unit = product.unit || "kg";
      toast.success(`Added ${weight} ${unit} — ${product.name}`);
      if (print) {
        const rate = product.sale_price || product.mrp || 0;
        printLabel({
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit,
          weight,
          price: weight * rate,
        }, loadLabelConfig(), 1);
      }
    },
    [weighProduct, addItem]
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
    async (method: string, channel: string | null, ref: string, tendered?: number) => {
      await confirmPayment(method, channel, ref, tendered, (orderPayload, _orderId) => {
        setShowPayment(false);
        setLastOrder(orderPayload);
        setShowReceipt(true);
        refreshInvoiceHeader();
        // Per-sale attachments — clear so they don't leak onto the next sale.
        setComplimentaryReason(null);
        setDeliveryAddress("");
      });
    },
    [confirmPayment, refreshInvoiceHeader]
  );

  const handleSelectCustomer = useCallback(
    async (customer: Customer | null) => {
      if (!customer) {
        // Walk-in — clear any attached customer (cash sale).
        setCartCustomer(null);
        setSelectedCustomer(null);
        return;
      }
      setCartCustomer(customer.id);
      setSelectedCustomer(customer);
    },
    [setCartCustomer]
  );

  // Cycle Retail → Wholesale → Distributor (F7 / Alt+A, or click the badge).
  // Persists per terminal and reprices the existing cart via overridePrice
  // (preserves per-line discount), reading fresh tier rates from the products list.
  const cyclePriceList = useCallback(async () => {
    const next = PRICE_LIST_ORDER[(PRICE_LIST_ORDER.indexOf(priceListMode) + 1) % PRICE_LIST_ORDER.length];
    setPriceListMode(next);
    if (typeof window !== "undefined") localStorage.setItem("pos_price_list", next);
    let changed = 0;
    for (const item of items) {
      const prod = products.find((p) => p.id === item.product);
      if (!prod) continue;
      const newPrice = priceFor(prod, next);
      if (Number.isFinite(newPrice) && Math.abs(newPrice - item.unit_price) > 0.001) {
        await overridePrice(item.id, newPrice);
        changed++;
      }
    }
    toast.success(`Price list: ${PRICE_LIST_LABEL[next]}${changed ? ` · ${changed} line(s) repriced` : ""}`);
  }, [priceListMode, items, products, overridePrice]);

  // Complimentary (Ctrl+C, manager): 100% discount on every line — cart zeroes
  // and the cashier tenders the resulting 0-total sale (F10).
  const handleComplimentary = useCallback(async (reason: string) => {
    if (items.length === 0) { toast.error("Cart is empty"); return; }
    for (const it of items) await applyDiscount(it.id, it.unit_price);
    setComplimentaryReason(reason || "Complimentary");
    toast.success("Complimentary applied — press F10 to tender");
  }, [items, applyDiscount]);

  const handleSaveQuotation = useCallback(async () => {
    setQuotationSaving(true);
    await saveQuotation();
    setQuotationSaving(false);
    setShowQuotation(false);
  }, [saveQuotation]);

  // Post to Market (Alt+M): flip visible_on_web on the cart's products.
  const handlePostMarket = useCallback(async () => {
    const ids = Array.from(new Set(items.map((i) => i.product)));
    if (ids.length === 0) return;
    try {
      const batch = pb.createBatch();
      for (const id of ids) batch.collection("products").update(id, { visible_on_web: true, is_synced: false });
      await batch.send();
      toast.success(`Posted ${ids.length} product(s) to market`);
    } catch {
      toast.error("Failed to post to market");
    }
  }, [items, pb]);

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
    if (!validateStock()) {
      toast.error("Resolve the stock shortage first — remove the item or complete the sale");
      return;
    }
    const confirmed = window.confirm("Clear cart and start new transaction?");
    if (confirmed) {
      const result = await clearCart();
      if (result.success) {
        undoStack.clear();
        setSelectedCustomer(null);
        toast.success("New transaction started");
      } else {
        toast.error(result.error || "Failed to clear cart");
      }
    }
  }, [items, clearCart, validateStock]);

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
    showPayment,
    showHeldCarts,
    showCustomer,
    setShowPayment,
    setShowHeldCarts,
    showHelpToggle: () => setShowHelp((prev) => !prev),
    setShowCustomer,
    setSearchQuery,
    handleNewTransaction,
    handleHoldCart,
    handleCheckout,
    handleVoidLast,
    handleUndo,
    applyDiscount,
    applyBillDiscount,
    cyclePriceList,
    isManager,
    setShowSalesperson,
    setShowComplimentary,
    setShowExchange,
    setShowPostMarket,
    setShowQuotation,
    setShowDeliveryAddress,
    // Listing mode reroutes F3 → full-screen search and F9 → inline qty edit on the
    // selected row. In grid mode these are undefined, so the canonical defaults apply
    // (F3 focuses the grid search, F9 shows the change-qty hint).
    onFocusSearch: inputMode === "listing" ? () => openSearch("") : undefined,
    onChangeQty: inputMode === "listing" ? () => editRowRef.current?.(selectedRow) : undefined,
  });
  useEffect(() => setupShortcuts(), [setupShortcuts]);

  // Listing mode: cart-table navigation + type-to-search. ↑↓ move the selected row,
  // Enter edits its qty (via the cart-table handle), Delete removes it, and any single
  // printable char opens the full-screen search modal seeded with that char. F-keys and
  // modifier combos stay owned by usePosShortcuts (the keyboard registry), so this
  // listener only consumes the keys above.
  //
  // Runs in the capture phase and calls stopImmediatePropagation on the keys it owns so
  // the registry's bubble-phase listener can't ALSO act on them — most importantly
  // Delete, which the registry maps to handleVoidLast (would otherwise double-remove).
  useEffect(() => {
    if (inputMode !== "listing") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };

      if (e.key === "ArrowDown") {
        consume();
        if (items.length > 0) setSelectedRow((r) => (r + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        consume();
        if (items.length > 0) setSelectedRow((r) => (r - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter") {
        consume();
        if (items.length > 0) editRowRef.current?.(selectedRow);
        return;
      }
      if (e.key === "Delete") {
        consume();
        const row = items[selectedRow];
        if (row) {
          const prod = products.find((p) => p.id === row.product);
          removeItem(row.id);
          if (prod) undoStack.push(() => { addItem(prod); });
        }
        return;
      }

      // Type-to-search: a single printable char (no modifiers) opens the search modal.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        consume();
        openSearch(e.key);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [inputMode, anyModalOpen, items, selectedRow, products, openSearch, removeItem, addItem, undoStack]);

  // Grid mode: the original type-to-search that drives the product grid filter.
  useEffect(() => {
    if (inputMode !== "grid") return;
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
  }, [inputMode, anyModalOpen, products, highlightedIndex, searchQuery, setSearchQuery, handleAddProduct]);

  const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const cartColumnWidth = layoutPreset === "fullcart" ? CART_WIDTH.FULL : layoutPreset === "compact" ? CART_WIDTH.COMPACT : CART_WIDTH.STANDARD;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/branding/pelbu-icon.png" alt="Pelbu" className="w-8 h-8 rounded-lg" />
            <div className="hidden sm:block">
              <h1 className="font-heading font-bold text-base leading-tight">
                {settings?.store_name || "Pelbu"}
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">POS Terminal</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground border-l border-border pl-4">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{currentTime}</span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] gap-1 font-mono cursor-pointer select-none"
            title="Next invoice number — double-click to look up a past invoice"
            onDoubleClick={() => setShowInvoiceSearch(true)}
          >
            <Hash className="h-3 w-3" />
            {nextInvoiceNo || "—"}
          </Badge>
          <Badge
            variant={priceListMode === "RETAIL" ? "outline" : "default"}
            className="text-[10px] gap-1 cursor-pointer select-none"
            title="Price list — click to cycle (F7 / Alt+A)"
            onClick={cyclePriceList}
          >
            <Tags className="h-3 w-3" />
            {PRICE_LIST_LABEL[priceListMode]}
          </Badge>
          {(isOwner || isManager) && (
            <div
              className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground"
              title="Override the invoice date for the next sale (admin only). Blank = now."
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <input
                type="datetime-local"
                value={dateOverride ?? ""}
                onChange={(e) => setDateOverride(e.target.value || null)}
                className="h-6 bg-transparent border border-border rounded px-1 text-[10px] text-foreground"
              />
              {dateOverride && (
                <button type="button" onClick={() => setDateOverride(null)} className="hover:text-foreground" title="Clear override">
                  ×
                </button>
              )}
            </div>
          )}
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
          {/* Input mode: keyboard listing vs touch grid (persists per station) */}
          <div className="hidden lg:flex items-center border border-border rounded-md overflow-hidden ml-1">
            <Button
              variant="ghost"
              size="sm"
              className={`text-[10px] h-6 px-2 rounded-none gap-1 ${inputMode === "listing" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"}`}
              onClick={() => changeInputMode("listing")}
              title="Keyboard listing layout"
            >
              <List className="h-3 w-3" />
              List
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`text-[10px] h-6 px-2 rounded-none gap-1 ${inputMode === "grid" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"}`}
              onClick={() => changeInputMode("grid")}
              title="Touch card grid"
            >
              <LayoutGrid className="h-3 w-3" />
              Grid
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <div className="hidden md:flex items-center gap-0.5">
            {/* Desktop is strictly the POS register — catalog/inventory/purchasing/order-history
                live in the web back-office. Only counter/till functions remain here: customer +
                khata (cashier) and cash-in/out (manager/owner). */}
            <Link href="/customers">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Users className="h-4 w-4 mr-1.5" />
                Customers
              </Button>
            </Link>
            {isManager && (
            <Link href="/adjustments">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Wallet className="h-4 w-4 mr-1.5" />
                Cash
              </Button>
            </Link>
            )}
          </div>
          <div className="hidden md:block w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleNewTransaction} title="New Sale (F2)">
            <FilePlus className="h-4 w-4" />
          </Button>
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
          {isOwner && (
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => { if (activeShift) setShowHandover(true); else signOut(); }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      {inputMode === "listing" ? (
        /* Keyboard listing layout: cart table fills the screen, totals + shortcuts below */
        <div className="flex-1 flex flex-col overflow-hidden">
          <CartTable
            items={items}
            products={products}
            selectedRow={selectedRow}
            onSelectRow={setSelectedRow}
            onUpdateQty={(itemId, qty) => updateQty(itemId, qty)}
            onRemoveItem={removeItem}
            onEditRequest={editRowRef}
          />
          <ListingFooter
            itemCount={totalItemsCount}
            subtotal={subtotal}
            billDiscount={billDiscount}
            gstTotal={taxExempt ? gstTotalExempt : gstTotal}
            grandTotal={taxExempt ? grandTotalExempt : grandTotal}
          />
        </div>
      ) : (
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
              onClearCustomer={() => setSelectedCustomer(null)}
              onNewSale={handleNewTransaction}
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
                  onClearCustomer={() => setSelectedCustomer(null)}
                  onNewSale={handleNewTransaction}
                  noShift={!activeShift}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile/Tablet touch affordances — grid mode only (the listing layout fills the
          screen with the cart table and shows totals in its footer). */}
      {inputMode === "grid" && (
        <>
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
        </>
      )}

      {/* Modals */}
      <ProductSearchModal
        open={showSearch}
        initialQuery={searchSeed}
        priceListMode={priceListMode}
        onAdd={(product) => {
          // Move the listing selection to the appended line (weighed goods open the
          // weight modal first, but the cart still grows by one row on confirm).
          setSelectedRow(items.length);
          handleAddProduct(product);
        }}
        onScan={handleScan}
        onClose={() => { setShowSearch(false); setSearchSeed(""); }}
      />

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
      />

      <WeightEntryModal
        key={weighProduct?.id ?? "weigh"}
        open={weighProduct !== null}
        product={weighProduct}
        onConfirm={handleWeighConfirm}
        onClose={() => setWeighProduct(null)}
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

      {showInvoiceSearch && <InvoiceSearchModal onClose={() => setShowInvoiceSearch(false)} />}

      <SalespersonPickerModal open={showSalesperson} onClose={() => setShowSalesperson(false)} onSelect={setSelectedSalesperson} />
      <ComplimentaryConfirmModal open={showComplimentary} onClose={() => setShowComplimentary(false)} onConfirm={handleComplimentary} itemCount={items.length} grandTotal={taxExempt ? grandTotalExempt : grandTotal} />
      <QuotationConfirmModal open={showQuotation} onClose={() => setShowQuotation(false)} onConfirm={handleSaveQuotation} itemCount={items.length} grandTotal={taxExempt ? grandTotalExempt : grandTotal} saving={quotationSaving} />
      <PostMarketModal open={showPostMarket} onClose={() => setShowPostMarket(false)} onConfirm={handlePostMarket} productNames={Array.from(new Set(items.map((i) => i.name)))} />
      <DeliveryAddressModal open={showDeliveryAddress} onClose={() => setShowDeliveryAddress(false)} initial={deliveryAddress} onApply={setDeliveryAddress} />
      <ExchangeModal open={showExchange} onClose={() => setShowExchange(false)} />

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
        onClose={() => { setShowShiftModal(null); setPendingSignOut(false); }}
        mode={showShiftModal || "open"}
        onConfirm={handleShiftAction}
        reconciliation={reconData || undefined}
      />

      <HandoverModal
        open={showHandover}
        onClose={() => setShowHandover(false)}
        onCloseShift={() => { setShowHandover(false); setPendingSignOut(true); setShowShiftModal("close"); }}
        switchUser={switchUser}
        currentUserId={user?.id}
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
