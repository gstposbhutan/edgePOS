"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTerminalMode } from "@/hooks/use-terminal-mode";
import { useSettings } from "@/hooks/use-settings";
import { useHeldCarts } from "@/hooks/use-held-carts";
import { useUndo } from "@/hooks/use-undo";
import { usePosShortcuts } from "@/hooks/use-pos-shortcuts";
import { useCheckout } from "@/hooks/use-checkout";
import { useProducts, type Product } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useOnlineOrders } from "@/hooks/use-online-orders";
import { useCustomers } from "@/hooks/use-customers";
import type { Customer } from "@/hooks/use-customers";
import { getPB } from "@/lib/pb-client";
import { peekNextOrderNo } from "@/lib/invoice-header";
import { PRICE_LIST_ORDER, PRICE_LIST_LABEL, priceFor, parsePriceListMode, type PriceListMode } from "@/lib/price-list";
import { SCREEN_LG, CART_WIDTH } from "@/lib/constants";
import { ProductGrid } from "@/components/pos/product-grid";
import { CartPanel } from "@/components/pos/cart-panel";
import { CartTable, type EditField } from "@/components/pos/keyboard/cart-table";
import { ProductSearchModal } from "@/components/pos/keyboard/product-search-modal";
import { ListingFooter } from "@/components/pos/keyboard/listing-footer";
import { BarcodeRow, BARCODE_INPUT_ID } from "@/components/pos/keyboard/barcode-row";
import { TillBar } from "@/components/pos/keyboard/till-bar";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { PaymentModal } from "@/components/pos/payment-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { InvoiceSearchModal } from "@/components/pos/invoice-search-modal";
import { SalespersonPickerModal } from "@/components/pos/salesperson-picker-modal";
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
import { AmountPromptModal, type AmountPromptRequest } from "@/components/pos/amount-prompt-modal";
import { UnitSheet } from "@/components/pos/keyboard/unit-sheet";
import { DatePromptModal, type DatePromptRequest } from "@/components/pos/date-prompt-modal";
import { TextPromptModal, type TextPromptRequest } from "@/components/pos/text-prompt-modal";
import { unitLadder, hasUnitChoice, lineFactor, type UnitLevel } from "@/lib/units";
import { printLabel } from "@/lib/print-label";
import { loadLabelConfig } from "@/lib/label-config";
import { useShifts } from "@/hooks/use-shifts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  LogOut,
  Wifi,
  WifiOff,
  DoorOpen,
  DoorClosed,
  FileBarChart,
  Clock,
  ShoppingCart,
  ShoppingBag,
  ArrowRight,
  FilePlus,
  CalendarClock,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const LoginFallback = dynamic(() => import("@/app/login/page"), { ssr: false });

export default function PosPage() {
  const { user, isAuthenticated, signOut, switchUser, isManager, isOwner, loading: authLoading } = useAuth();
  const terminalMode = useTerminalMode();
  const router = useRouter();

  // A BACK_OFFICE terminal never rings a cash sale — it's a stock + online-orders terminal. Managers
  // land on Stock (which is manager-gated); cashiers land on online orders (avoids a redirect loop
  // against Stock's own manager gate).
  const canManage = isManager || isOwner;
  useEffect(() => {
    if (isAuthenticated && terminalMode === "BACK_OFFICE") router.replace(canManage ? "/stock" : "/online-orders");
  }, [isAuthenticated, terminalMode, canManage, router]);

  if (authLoading) {
    return <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!isAuthenticated) return <LoginFallback />;

  if (terminalMode === "BACK_OFFICE") {
    return <div className="flex-1 min-h-0 flex items-center justify-center"><p className="text-muted-foreground">Back-office terminal — opening stock…</p></div>;
  }

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

  const {
    items, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal, billDiscount,
    taxExempt, setTaxExempt,
    gstIncluded, setGstIncluded,
    subtotalExTax, gstTotalExempt, grandTotalExempt,
    addItem, updateQty, applyDiscount, applyBillDiscount, overridePrice, removeItem, clearCart,
    setLineSalesperson, setLineUnit, setLineRemark,
    setCustomer: setCartCustomer,
  } = useCart("RETAIL");
  const { customers, createCustomer } = useCustomers();
  const { settings } = useSettings();
  const { activeShift, openShift, closeShift, getReconciliation, loading: shiftLoading } = useShifts();
  const { favorites, toggleFavorite, isFavorite } = useFavorites(user?.id);
  const { heldCarts, loadHeld, holdCart, recallCart, discardHeld } = useHeldCarts();
  const undoStack = useUndo();

  const { orders: onlineOrders } = useOnlineOrders();

  // Toast on a new online order (the native OS notification is fired by the main process).
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { onlineOrders?: { onNew?: (cb: (d: { count?: number }) => void) => () => void } } }).electronAPI;
    return api?.onlineOrders?.onNew?.((d) => {
      const n = d?.count || 1;
      toast(n === 1 ? "New online order" : `${n} new online orders`, { description: "Open Online Orders to manage." });
    });
  }, []);

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
  // Alt+P — the tier the ticket prices at. Persisted so a wholesale counter does not have to
  // re-pick it every morning.
  const [priceListMode, setPriceListMode] = useState<PriceListMode>("RETAIL");
  // Replaces window.prompt, which throws in Electron and so broke both discount shortcuts.
  const [amountPrompt, setAmountPrompt] = useState<AmountPromptRequest | null>(null);
  useEffect(() => {
    setPriceListMode(parsePriceListMode(localStorage.getItem("pos_price_list")));
  }, []);
  const [weighProduct, setWeighProduct] = useState<Product | null>(null);
  const [reconData, setReconData] = useState<ShiftReconciliation | null>(null);
  const [online, setOnline] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [showSalesperson, setShowSalesperson] = useState(false);
  const [salespeopleById, setSalespeopleById] = useState<Record<string, string>>({}); // id → name, labels each cart line's salesperson (#3)
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
  const [inputMode] = useState<"listing" | "grid">("listing");
  // The header toggle that set this is gone (web parity: the web till is keyboard-listing only),
  // so the stored preference is deliberately NOT restored — a station left in "grid" would have
  // no way back to the listing. The grid code path is kept for when a key is given to it; the
  // stale key is cleared so nothing silently re-enters a mode with no exit.
  useEffect(() => {
    try { localStorage.removeItem("pos_input_mode"); } catch { /* no localStorage — nothing to clear */ }
  }, []);

  // Load the local sales team once, to label each cart line's salesperson (per-line #3).
  useEffect(() => {
    pb.collection("users")
      .getFullList<{ id: string; name?: string; email?: string }>({ sort: "name", requestKey: null })
      .then((us) => setSalespeopleById(Object.fromEntries(us.map((u) => [u.id, u.name || u.email || "Salesperson"]))))
      .catch(() => { /* offline / no users — labels just fall back to "Salesperson" */ });
  }, [pb]);


  // Listing-mode cart row selection + inline-qty-edit handle (mirrors web's
  // selectedRow + editRowRef). Unused in grid mode.
  const [selectedRow, setSelectedRow] = useState(0);
  const editRowRef = useRef<((index: number, field?: EditField) => void) | null>(null);
  // Alt+U / the Enter cycle's middle step. Keyed by cart-line ID, not row index — the ticket
  // can re-sync from PocketBase while the sheet is open and rows would shift under it.
  // `resumeRate` marks the sheet as part of an Enter cycle, which continues into the rate step.
  const [unitSheet, setUnitSheet] = useState<{ itemId: string; resumeRate: boolean } | null>(null);
  const [datePrompt, setDatePrompt] = useState<DatePromptRequest | null>(null);
  const [textPrompt, setTextPrompt] = useState<TextPromptRequest | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");

  const anyModalOpen =
    showScanner || showPayment || showCustomer || showReceipt || showZReport ||
    showShiftModal !== null || showHandover || showHeldCarts || showHelp || showSearch ||
    amountPrompt !== null || unitSheet !== null || datePrompt !== null || textPrompt !== null;

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
    salespersonId: null, // salesperson is per-line now (carried in each item's salesperson_id snapshot)
    deliveryAddress,
    complimentaryReason,
  });

  // Shifts are optional (parity with the web) — do NOT force the shift modal open on load. The
  // cashier opens a shift only if they want cash-drawer reconciliation.
  const [hasPromptedShift, setHasPromptedShift] = useState(false);
  useEffect(() => {
    if (activeShift) setHasPromptedShift(true);
  }, [activeShift]);

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

  // Enter from the always-focused barcode row. A wedge scanner sends 8+ digits, which go
  // straight to the catalog; anything else is a cashier typing a name, so it opens the picker
  // pre-filled rather than reporting "not found".
  const handleBarcodeEntry = useCallback(
    (value: string) => {
      if (/^\d{8,}$/.test(value)) handleScan(value);
      else openSearch(value);
    },
    [handleScan, openSearch]
  );

  const handleAddProduct = useCallback(
    async (product: any, mode?: PriceListMode) => {
      if (product.current_stock <= 0) {
        toast.error("Product is out of stock");
        return;
      }
      if (product.sold_by_weight) {
        setWeighProduct(product);
        return;
      }
      const result = await addItem(product, undefined, mode);
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
    // Shifts are optional (parity with the web) — a cashier can sell without an open shift. An open
    // shift, when present, still tracks the drawer; it's just no longer required to take payment.
    if (validateStock()) {
      setShowPayment(true);
    }
  }, [validateStock]);

  const handlePaymentConfirm = useCallback(
    async (
      method: string,
      channel: string | null,
      ref: string,
      tendered?: number,
      payments?: { method: string; channel: string | null; ref: string; amount: number }[],
    ) => {
      await confirmPayment(method, channel, ref, tendered, (orderPayload, _orderId) => {
        setShowPayment(false);
        setLastOrder(orderPayload);
        setShowReceipt(true);
        refreshInvoiceHeader();
        // Per-sale attachments — clear so they don't leak onto the next sale.
        setComplimentaryReason(null);
        setDeliveryAddress("");
      }, payments);
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

  // Complimentary (Ctrl+C, manager): 100% discount on every line — cart zeroes
  // and the cashier tenders the resulting 0-total sale (F10).
  const handleComplimentary = useCallback(async (reason: string) => {
    if (items.length === 0) { toast.error("Cart is empty"); return; }
    for (const it of items) await applyDiscount(it.id, it.unit_price);
    setComplimentaryReason(reason || "Complimentary");
    toast.success("Complimentary applied — press F10 to tender");
  }, [items, applyDiscount]);

  const handleSaveQuotation = useCallback(async (isQuotation: boolean) => {
    setQuotationSaving(true);
    await saveQuotation(isQuotation);
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

  const cyclePriceList = useCallback(() => {
    const next = PRICE_LIST_ORDER[(PRICE_LIST_ORDER.indexOf(priceListMode) + 1) % PRICE_LIST_ORDER.length];
    setPriceListMode(next);
    try { localStorage.setItem("pos_price_list", next); } catch { /* private mode */ }
    // Existing lines move to the new tier too — a single GST bill priced from two different
    // lists is exactly the kind of thing a cashier cannot spot on the printout.
    let repriced = 0;
    for (const line of items) {
      const product = products.find((pr) => pr.id === line.product);
      if (!product) continue;
      const price = priceFor(product, next);
      if (price > 0 && price !== line.unit_price) { overridePrice(line.id, price); repriced++; }
    }
    toast.success(`Price list: ${PRICE_LIST_LABEL[next]}${repriced ? ` · ${repriced} line${repriced > 1 ? "s" : ""} repriced` : ""}`);
  }, [priceListMode, items, products, overridePrice]);

  // Ctrl+P / PgUp — show the last bill again. Reprinting must not draw a new GST serial, so this
  // reopens the receipt already issued rather than starting anything.
  const reprintLast = useCallback(() => {
    if (!lastOrder) { toast("No bill to reprint"); return; }
    setShowReceipt(true);
  }, [lastOrder]);

  // Alt+T — whether the catalog's rates already contain GST (spec: "GST included toggle").
  //
  // This changes what every price on the ticket MEANS, so it refuses to flip mid-ticket: lines
  // already rung would silently re-split their tax under the cashier, and the bill they quoted
  // would no longer be the bill they take.
  const toggleGstIncluded = useCallback(() => {
    if (items.length > 0) {
      toast("Finish or clear the ticket before changing the GST basis");
      return;
    }
    const next = !gstIncluded;
    setGstIncluded(next);
    toast.success(next ? "Rates now read as GST-inclusive" : "Rates now read as GST-exclusive");
  }, [items.length, gstIncluded, setGstIncluded]);

  // Ctrl+T — a note against the highlighted line (spec: "^T Item remark"). An empty entry
  // clears it, which is why the text prompt passes a blank through instead of cancelling.
  const openRemarkPrompt = useCallback(() => {
    const line = items[selectedRow];
    if (!line) { toast("Select a product line first"); return; }
    setTextPrompt({
      title: "Item remark",
      label: `Note against ${line.name}. Prints on the bill; blank clears it.`,
      placeholder: "e.g. damaged carton — sold as seen",
      initial: line.remark ?? "",
      maxLength: 200,
      onSubmit: async (value) => {
        const result = await setLineRemark(line.id, value);
        if (!result.success) toast.error(result.error || "Could not save the remark");
        else toast.success(value ? "Remark saved" : "Remark cleared");
      },
    });
  }, [items, selectedRow, setLineRemark]);

  // F2 — the bill date (spec: "F2 Date — sets bill date to today"). Owner-only, because
  // checkout only honours an override for an owner; showing it to anyone else would be a field
  // that silently does nothing.
  const openDatePrompt = useCallback(() => {
    if (!isOwner) { toast("Bill date is owner-only"); return; }
    setDatePrompt({
      title: "Bill date",
      label: "Date stamped on the next invoice. Today = use the time of sale.",
      initial: dateOverride,
      onSubmit: (value) => {
        setDateOverride(value);
        toast.success(value ? `Bill date: ${new Date(value).toLocaleString()}` : "Bill date: today");
      },
    });
  }, [isOwner, dateOverride]);

  // Ctrl+B — print a barcode label for the highlighted line's product (spec WF-02 "B Barcode
  // Prn"). Reuses the label pipeline the weighed-goods flow already prints through, so the
  // symbology and label size come from this terminal's own printer config.
  const printBarcodeLabel = useCallback(() => {
    const line = items[selectedRow];
    if (!line) { toast("Select a product line first"); return; }
    const product = products.find((p) => p.id === line.product) ?? line.expand?.product;
    if (!product) { toast.error("Product not found in the catalog"); return; }
    const config = loadLabelConfig();
    setAmountPrompt({
      title: "Print barcode labels",
      label: `How many labels for ${product.name}?`,
      suffix: "labels",
      initial: String(config.copies ?? 1),
      onSubmit: (value) => {
        // Clamp rather than trust: a mistyped 500 sends a roll of labels through the printer
        // with no way to stop it, and the sheet gives no other confirmation step.
        const copies = Math.min(50, Math.max(1, Math.round(value) || 1));
        const ok = printLabel({
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          mrp: product.mrp,
          unit: product.unit,
        }, config, copies);
        if (ok) toast.success(`Printing ${copies} label${copies > 1 ? "s" : ""}`);
        else toast.error("Could not open the label print window");
      },
    });
  }, [items, selectedRow, products]);

  // Alt+U — the unit sheet for the highlighted line (spec: "Pcs / Pack / Case. ^v Enter Esc").
  //
  // Refuses out loud in the two cases where a sheet would be a lie: a line that is not selected,
  // and an item whose master carries no pack or case size. The second is the reason this key sat
  // reserved — a sheet offering Pack/Case for an item nobody configured would invent a quantity
  // and mis-deduct stock. Returns whether it actually opened, so the Enter cycle knows whether
  // to hand off or fall straight through to the rate step.
  const openUnitSheet = useCallback((index: number, resumeRate = false): boolean => {
    const line = items[index];
    if (!line) { toast("Select a product line first"); return false; }
    const product = products.find((p) => p.id === line.product) ?? line.expand?.product;
    if (!hasUnitChoice(product)) {
      toast(`${line.name} is sold in ${line.unit_label || "Pcs"} only — no pack size set`);
      return false;
    }
    setUnitSheet({ itemId: line.id, resumeRate });
    return true;
  }, [items, products]);

  // Close the sheet, and continue an Enter cycle into the rate step when that is where it came
  // from. Resolving the row by ID keeps the cycle on the right line if the ticket re-sorted.
  const closeUnitSheet = useCallback((applied: boolean) => {
    setUnitSheet((sheet) => {
      if (sheet?.resumeRate) {
        const row = items.findIndex((i) => i.id === sheet.itemId);
        if (row >= 0) setTimeout(() => editRowRef.current?.(row, "rate"), applied ? 60 : 0);
      }
      return null;
    });
  }, [items]);

  const applyUnitLevel = useCallback(async (level: UnitLevel) => {
    const itemId = unitSheet?.itemId;
    closeUnitSheet(true);
    if (!itemId) return;
    const result = await setLineUnit(itemId, level);
    if (!result.success) toast.error(result.error || "Could not change the unit");
    else toast.success(`Unit: ${level.label}${level.factor > 1 ? ` (x ${level.factor})` : ""}`);
  }, [unitSheet, closeUnitSheet, setLineUnit]);

  const handleNewSale = useCallback(() => {
    setShowReceipt(false);
    setLastOrder(null);
  }, []);

  // The counter carries no letter strip (single letters belong to the barcode row), so Alt+O and
  // the Office button both land on the Stock Register — the letter strip takes over from there
  // and every module is one letter away.
  const officeRouter = useRouter();
  const openOffice = () => officeRouter.push("/stock");

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
    isManager,
    setShowSalesperson,
    setShowComplimentary,
    setShowExchange,
    setShowPostMarket,
    setShowQuotation,
    setShowDeliveryAddress,
    setShowShiftModal,
    storeName: settings?.store_name,
    onPriceList: cyclePriceList,
    onOffice: openOffice,
    onReprintLast: reprintLast,
    // The line-scoped keys need a selected row, which only the listing layout has. Left
    // undefined in grid mode, where they report that instead.
    onFocusSearch: inputMode === "listing" ? () => openSearch("") : undefined,
    onChangeQty: inputMode === "listing" ? () => editRowRef.current?.(selectedRow) : undefined,
    onRateChange: inputMode === "listing" ? () => editRowRef.current?.(selectedRow, "rate") : undefined,
    onUnitSheet: inputMode === "listing" ? () => { openUnitSheet(selectedRow); } : undefined,
    onBarcodePrint: inputMode === "listing" ? printBarcodeLabel : undefined,
    onBillDate: openDatePrompt,
    onItemRemark: inputMode === "listing" ? openRemarkPrompt : undefined,
    onGstIncluded: toggleGstIncluded,
    onQtyDelta: inputMode === "listing"
      ? (delta: number) => {
          const line = items[selectedRow];
          if (!line) { toast("Select a product line first"); return; }
          const next = line.quantity + delta;
          // Stepping below 1 removes the line — what a cashier walking back a mis-scan expects.
          if (next < 1) removeItem(line.id);
          else updateQty(line.id, next);
        }
      : undefined,
    askAmount: setAmountPrompt,
    onItemDiscount: inputMode === "listing"
      ? () => {
          const line = items[selectedRow];
          if (!line) { toast("Select a product line first"); return; }
          setAmountPrompt({
            title: "Item discount",
            label: `Discount per unit on ${line.name}`,
            suffix: "Nu.",
            initial: String(line.discount || ""),
            onSubmit: (v) => applyDiscount(line.id, Math.max(0, v)),
          });
        }
      : undefined,
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
      // The barcode row holds focus continuously (spec WF-01), so it is a deliberate
      // exception: navigation keys still reach the ticket from inside it. Every other field
      // (the inline qty editor) keeps its keys to itself.
      const inBarcode = target.id === BARCODE_INPUT_ID;
      if (!inBarcode && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const barcodeHasText = inBarcode && (target as HTMLInputElement).value.length > 0;
      // While there is text in the barcode row, Enter submits it and Delete edits that text —
      // both belong to the field, not the ticket.
      if (barcodeHasText && (e.key === "Enter" || e.key === "Delete")) return;

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

      // Typing goes to the barcode row, which already has the caret — that is the whole point
      // of keeping it focused, and it is what stops a wedge scan losing its first characters.
      // Only when focus is elsewhere does a printable char fall back to opening the picker.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (inBarcode) return;
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

  // The Std/Cpt/Full toggle is gone (web parity), so the split is the standard one. A stored
  // "fullcart" used to HIDE the product grid — with no control left to undo it that would
  // have stranded the till, so the preset is not read back at all.
  const cartColumnWidth = CART_WIDTH.STANDARD;

  // flex-1, NOT h-screen: layout.tsx stacks UpdateBanner + SyncNudge + OfficeChrome ABOVE this,
  // so a full viewport here means banner-height + 100vh — and a scrollbar on the till.
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background overflow-hidden">
      {/* Top bar = ACTIONS only, mirroring the web till. The counter is full-screen — it is a till,
          not a console — so page navigation is the Office menu (Alt+O), not a row of links. The
          left half is standing facts that shrink and clip; the right half is actions that never do. */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-3 shrink-0 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/branding/pelbu-icon.png" alt="Pelbu" className="w-7 h-7 rounded-lg shrink-0" />
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-heading font-bold leading-none truncate">{settings?.store_name || "Pelbu"}</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate">POS Terminal</p>
          </div>
          <button
            onDoubleClick={() => setShowInvoiceSearch(true)}
            title="Next invoice number — double-click to search past invoices"
            className="hidden md:inline text-[11px] font-mono text-muted-foreground border border-border bg-muted/30 px-2 py-0.5 rounded-full shrink-0 cursor-pointer hover:bg-muted"
          >
            Inv: {nextInvoiceNo || "—"}
          </button>
          <span className="hidden lg:inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground border border-border bg-muted/30 px-2 py-0.5 rounded-full shrink-0">
            <Clock className="h-3 w-3" />
            {currentTime}
          </span>
          {isOwner && (
            <div
              className="hidden xl:flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
              title="Override the invoice date for the next sale (F2, owner only). Blank = now."
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <input
                type="datetime-local"
                value={dateOverride ?? ""}
                onChange={(e) => setDateOverride(e.target.value || null)}
                className="h-6 bg-transparent border border-border rounded px-1 text-[10px] text-foreground"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            title="Office — back office [Alt+O]"
            onClick={openOffice}
            className="text-muted-foreground hover:text-foreground"
          >
            <LayoutDashboard className="h-5 w-5 mr-1.5" />
            Office
          </Button>
          {/* Online orders stay on the bar as a NOTIFICATION, not navigation: a waiting order is
              time-sensitive and a cashier must see the count without opening a menu. */}
          <Link href="/online-orders">
            <Button variant="ghost" size="sm" title="Online orders" className="text-muted-foreground hover:text-foreground">
              <ShoppingBag className="h-5 w-5" />
              {onlineOrders.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold h-4 min-w-4 px-1">
                  {onlineOrders.length}
                </span>
              )}
            </Button>
          </Link>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={handleNewTransaction} title="New Sale [Ctrl+D]">
            <FilePlus className="h-5 w-5" />
          </Button>
          {!activeShift ? (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("open")} title="Open Shift [F11]" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              <DoorOpen className="h-5 w-5 mr-1.5" />
              Open Shift
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowShiftModal("close")} title="Close Shift [F11]" className="border-warning/30 text-warning hover:bg-warning/10">
              <DoorClosed className="h-5 w-5 mr-1.5" />
              Close Shift
            </Button>
          )}
          <Button variant="ghost" size="sm" title="Z-Report" className="text-muted-foreground hover:text-foreground" onClick={() => setShowZReport(true)}>
            <FileBarChart className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Sign out"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => { if (activeShift) setShowHandover(true); else signOut(); }}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      {inputMode === "listing" ? (
        /* Keyboard listing layout: barcode row, cart table filling the screen, totals +
           shortcuts below (spec WF-01). */
        <div className="flex-1 flex flex-col overflow-hidden">
          <TillBar
            title="Counter"
            buyer={selectedCustomer?.debtor_name}
            taxExempt={taxExempt}
            gstIncluded={gstIncluded}
            priceList={PRICE_LIST_LABEL[priceListMode]}
            hint="F11 Day"
          />
          <BarcodeRow
            disabled={anyModalOpen}
            onSubmit={handleBarcodeEntry}
          />
          <CartTable
            items={items}
            products={products}
            selectedRow={selectedRow}
            onSelectRow={setSelectedRow}
            onUpdateQty={(itemId, qty) => updateQty(itemId, qty)}
            onRemoveItem={removeItem}
            onOverridePrice={(itemId, price) => overridePrice(itemId, price)}
            onEditEnd={() => document.getElementById(BARCODE_INPUT_ID)?.focus()}
            onEditRequest={editRowRef}
            onUnitStep={(index) => openUnitSheet(index, true)}
            salespeopleById={salespeopleById}
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
          <div className="flex-1 min-w-0">
            <ProductGrid
              onAddProduct={handleAddProduct}
              onScan={() => setShowScanner(true)}
              highlightedIndex={highlightedIndex}
              setHighlightedIndex={setHighlightedIndex}
            />
          </div>

          {/* Cart Panel — always visible on lg+, slide-over on md */}
          {(showCart || screenWidth >= SCREEN_LG) && (
            <div className={`${cartColumnWidth} shrink-0 hidden md:block`}>
            <CartPanel
              customer={selectedCustomer}
              isManager={isManager}
              onCheckout={handleCheckout}
              onSelectCustomer={() => setShowCustomer(true)}
              onClearCustomer={() => setSelectedCustomer(null)}
              onNewSale={handleNewTransaction}
              noShift={false}
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
                  noShift={false}
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
        onAdd={(product, mode) => {
          // Move the listing selection to the appended line (weighed goods open the
          // weight modal first, but the cart still grows by one row on confirm).
          setSelectedRow(items.length);
          handleAddProduct(product, mode);
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

      <SalespersonPickerModal open={showSalesperson} onClose={() => setShowSalesperson(false)} onSelect={(u) => {
        setShowSalesperson(false);
        const line = items[selectedRow];
        if (!line) { toast.error("Select a product line first"); return; }
        setSalespeopleById((prev) => ({ ...prev, [u.id]: u.name || u.email || "Salesperson" }));
        setLineSalesperson(line.id, u.id);
        toast.success(`${line.name}: ${u.name || u.email || "Salesperson"}`);
      }} />
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

      <AmountPromptModal request={amountPrompt} onClose={() => setAmountPrompt(null)} />
      <DatePromptModal request={datePrompt} onClose={() => setDatePrompt(null)} />
      <TextPromptModal request={textPrompt} onClose={() => setTextPrompt(null)} />
      {(() => {
        // Resolve the line by ID at render time: an incoming cart re-sync must not point the
        // sheet at a different product than the one the cashier opened it on.
        const line = unitSheet ? items.find((i) => i.id === unitSheet.itemId) : null;
        if (!unitSheet || !line) return null;
        const product = products.find((p) => p.id === line.product) ?? line.expand?.product;
        return (
          <UnitSheet
            open
            levels={unitLadder(product)}
            currentFactor={lineFactor(line)}
            productName={line.name}
            pieceStock={typeof product?.current_stock === "number" ? product.current_stock : null}
            onSelect={applyUnitLevel}
            onClose={() => closeUnitSheet(false)}
          />
        );
      })()}

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
