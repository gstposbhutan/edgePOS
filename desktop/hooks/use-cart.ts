"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { calcItemTotals, calcCartTotals } from "@/lib/gst";
import { CART_STATUS } from "@/lib/constants";
import { usePosStore } from "@/stores/pos-store";
import { priceFor } from "@/lib/price-list";
import { lineFactor, unitsAvailable, repriceForLevel, baseUnitLabel, type UnitLevel } from "@/lib/units";
import { toast } from "sonner";
import type { PriceListMode } from "@/lib/price-list";
import type { Product } from "./use-products";

export interface CartItem {
  id: string;
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  discount: number;
  gst_5: number;
  total: number;
  gst_exempt?: boolean;
  // Which level of the Pcs/Pack/Case ladder this line was rung at. `quantity` is in THAT unit
  // and `unit_price` is the price of one of it; pieces = quantity * unit_factor. Absent means
  // pieces, which is how every line written before the ladder existed must be read.
  unit_label?: string;
  unit_factor?: number;
  /** Ctrl+T — a cashier note on this line. Copied into the order and printed on the slip. */
  remark?: string;
  salesperson_id?: string | null;
  expand?: { product?: Product };
}

export interface Cart {
  id: string;
  status: string;
}

type OpResult = { success: boolean; error?: string };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Operation failed";
}

// Resolve the live current_stock for a product id. Reads the shared ["products"]
// query cache first (kept fresh by the realtime subscription in useProducts), and
// falls back to the cart item's expanded product if the id isn't in cache. Returns
// null/undefined when the product can't be found or doesn't track stock — callers
// treat that as "untracked" and skip the cap.
function resolveStock(qc: QueryClient, productId: string, fallback?: Product): number | null {
  const products = qc.getQueryData<Product[]>(["products"]);
  const live = products?.find((p) => p.id === productId);
  const stock = live ? live.current_stock : fallback?.current_stock;
  // Only a real number is a tracked cap; anything else is "untracked" (no cap).
  return typeof stock === "number" ? stock : null;
}

// "Only N in stock" has to be said in the unit the cashier is ringing, or a cap on a carton
// line reads as nonsense ("only 25 in stock" when they asked for 3 cartons of 12).
function stockMessage(item: { unit_label?: string; unit_factor?: number }, pieces: number): string {
  const factor = lineFactor(item);
  if (factor <= 1) return `Only ${pieces} in stock`;
  const cap = unitsAvailable(pieces, factor) ?? 0;
  return `Only ${cap} x ${item.unit_label || "Pack"} in stock (${pieces} pcs)`;
}

async function fetchActiveCart(): Promise<Cart> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  const records = await pb.collection("carts").getFullList<Cart>({
    filter: 'status = "ACTIVE"',
    sort: "-created_at",
    requestKey: null,
  });
  if (records.length > 0) return records[0];
  const newCart = await pb.collection("carts").create({ status: CART_STATUS.ACTIVE }, PB_REQ);
  return newCart as unknown as Cart;
}

async function fetchCartItems(cartId: string): Promise<CartItem[]> {
  const pb = getPB();
  return pb.collection("cart_items").getFullList<CartItem>({
    filter: `cart = "${cartId}"`,
    expand: "product",
    sort: "created_at",
    requestKey: null,
  });
}

export function useCart(priceListMode: PriceListMode = "RETAIL") {
  const pb = getPB();
  const queryClient = useQueryClient();
  const taxExempt = usePosStore((s) => s.taxExempt);
  const setTaxExempt = usePosStore((s) => s.setTaxExempt);
  const gstIncluded = usePosStore((s) => s.gstIncluded);
  const setGstIncluded = usePosStore((s) => s.setGstIncluded);

  const cartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: fetchActiveCart,
    staleTime: Infinity,
  });

  const cart = cartQuery.data ?? null;
  const cartId = cart?.id;

  const itemsQuery = useQuery({
    queryKey: ["cart-items", cartId],
    queryFn: () => fetchCartItems(cartId!),
    enabled: !!cartId,
    staleTime: 0,
  });

  const rawItems = itemsQuery.data ?? [];

  // Alt+T re-splits every line: gst_5 and total were written when the line was added, under
  // whichever mode was active then, so a toggle would otherwise leave the ticket showing stale
  // tax. Recomputing on read fixes the cart table, the totals and the receipt preview at once.
  // Writes still read the raw cache, so this stays a display/checkout view.
  const items: CartItem[] = gstIncluded
    ? rawItems.map((i) => {
        const { gstAmount, total } = calcItemTotals(
          { unitPrice: i.unit_price, discount: i.discount, quantity: i.quantity, gstExempt: i.gst_exempt },
          undefined,
          true,
        );
        return { ...i, gst_5: gstAmount, total };
      })
    : rawItems;

  // Invoice/bill-level discount lives on the cart record — a single pre-GST amount off the net
  // subtotal (after per-line discounts), NOT distributed across line items.
  const billDiscount = Math.max(0, Number((cart as { bill_discount?: number } | null)?.bill_discount ?? 0) || 0);

  const totals = calcCartTotals(
    items.map((i) => ({ unitPrice: i.unit_price, discount: i.discount, quantity: i.quantity, gstExempt: !!i.gst_exempt })),
    undefined,
    billDiscount,
    gstIncluded,
  );

  const subtotalExTax = totals.taxableSubtotal;
  const gstTotalExempt = taxExempt ? 0 : totals.gstTotal;
  const grandTotalExempt = taxExempt ? totals.taxableSubtotal : totals.grandTotal;

  const refetchItems = () => {
    if (cartId) queryClient.invalidateQueries({ queryKey: ["cart-items", cartId] });
  };

  // Set the invoice/bill-level discount on the cart (pre-GST, off the net; not distributed).
  const applyBillDiscount = async (amount: number) => {
    if (!cartId) return { success: false, error: "No active cart" };
    const bd = Math.max(0, Number(amount) || 0);
    try {
      await pb.collection("carts").update(cartId, { bill_discount: bd }, PB_REQ);
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const addItemMutation = useMutation({
    mutationFn: async ({ product, weight, mode, salespersonId }: { product: Product; weight?: number; mode?: PriceListMode; salespersonId?: string | null }): Promise<CartItem> => {
      if (!cart) throw new Error("No active cart");
      // Per-line rate: the product-search rate toggle passes a tier for THIS line; else the default.
      const unitPrice = priceFor(product, mode ?? priceListMode);
      // Weighed goods: `weight` is the measured quantity (in product.unit) and unitPrice is
      // the per-unit rate → total = weight × rate. Each weighing is a distinct line, so we
      // don't merge with an existing row (unlike discrete items, which increment qty).
      const isWeighed = !!product.sold_by_weight && weight != null && weight > 0;
      if (!isWeighed) {
        // Check cache for existing item (reflects latest server state via refetch)
        const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
        // Merge only when product + salesperson + RATE match. Rate in the key means the same SKU added
        // at two tiers (wholesale line + retail line) stays as two separate lines in one invoice (#4);
        // salesperson keeps per-staff lines distinct (#3).
        // Merging also requires the same UNIT: 3 Pcs and 3 Cases of the same item are two
        // different lines, and folding them together would silently mis-deduct stock.
        const existing = current.find(
          (i) => i.product === product.id && (i.salesperson_id ?? null) === (salespersonId ?? null) && Number(i.unit_price) === Number(unitPrice) && lineFactor(i) === 1
        );
        if (existing) {
          // Hard cap: never increment past current_stock. If the line is already at
          // (or over) the cap, hold it there and let the cashier know. Untracked
          // stock (null/undefined) increments freely, as before.
          const stock = resolveStock(queryClient, product.id, product);
          // The cap is in the line's OWN unit: stock is pieces, so a carton line can only go as
          // high as the whole cartons those pieces cover.
          const cap = unitsAvailable(stock, lineFactor(existing));
          const wanted = existing.quantity + 1;
          const newQty = cap != null ? Math.min(wanted, Math.max(1, cap)) : wanted;
          if (newQty < wanted) toast.error(stockMessage(existing, stock as number));
          if (newQty === existing.quantity) return existing; // already at the cap — nothing to write
          const { gstAmount, total } = calcItemTotals({
            unitPrice: existing.unit_price, discount: existing.discount, quantity: newQty, gstExempt: existing.gst_exempt,
          });
          await pb.collection("cart_items").update(existing.id, { quantity: newQty, gst_5: gstAmount, total }, PB_REQ);
          return existing; // onSuccess will refetch, so return value isn't critical
        }
      }
      const quantity = isWeighed ? weight! : 1;
      const gstExempt = !!product.gst_exempt;
      const { gstAmount, total } = calcItemTotals({ unitPrice, discount: 0, quantity, gstExempt });
      return pb.collection("cart_items").create({
        cart: cart.id, product: product.id, name: product.name, sku: product.sku,
        quantity, unit_price: unitPrice, discount: 0, gst_5: gstAmount, total,
        gst_exempt: gstExempt,
        // Every line starts at the base of the ladder; Alt+U moves it up.
        unit_label: baseUnitLabel(product), unit_factor: 1,
        salesperson_id: salespersonId ?? null,
      }, PB_REQ) as unknown as CartItem;
    },
    onSuccess: () => refetchItems(),
  });

  // `weight` is only used for sold_by_weight products (the measured amount in product.unit);
  // omit it for normal items, which add/increment by 1.
  const addItem = async (product: Product, weight?: number, mode?: PriceListMode, salespersonId?: string | null): Promise<OpResult> => {
    try {
      await addItemMutation.mutateAsync({ product, weight, mode, salespersonId });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await pb.collection("cart_items").delete(itemId, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const removeItem = async (itemId: string): Promise<OpResult> => {
    try {
      await removeItemMutation.mutateAsync(itemId);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const updateQtyMutation = useMutation({
    mutationFn: async ({ itemId, newQty }: { itemId: string; newQty: number }) => {
      if (newQty < 1) {
        await pb.collection("cart_items").delete(itemId, PB_REQ);
        return null;
      }
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const item = current.find((i) => i.id === itemId);
      if (!item) throw new Error("Item not found");
      // Hard cap: a line can never exceed the product's current_stock. Stock-tracked
      // items clamp to the max (and toast); untracked products (stock null/undefined)
      // pass through unchanged. This is the single chokepoint for the +/- buttons and
      // the qty-numpad commit, so the cap holds no matter how the qty was entered.
      const stock = resolveStock(queryClient, item.product, item.expand?.product);
      // Cap in the line's own unit — stock is pieces, the line may be in cartons.
      const cap = unitsAvailable(stock, lineFactor(item));
      let qty = newQty;
      if (cap != null && newQty > cap) {
        qty = Math.max(1, cap);
        toast.error(stockMessage(item, stock as number));
      }
      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price, discount: item.discount, quantity: qty, gstExempt: item.gst_exempt,
      });
      await pb.collection("cart_items").update(itemId, { quantity: qty, gst_5: gstAmount, total }, PB_REQ);
      return null;
    },
    onSuccess: () => refetchItems(),
  });

  const updateQty = async (itemId: string, newQty: number): Promise<OpResult> => {
    try {
      await updateQtyMutation.mutateAsync({ itemId, newQty });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const applyDiscountMutation = useMutation({
    mutationFn: async ({ itemId, discountPerUnit }: { itemId: string; discountPerUnit: number }) => {
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const item = current.find((i) => i.id === itemId);
      if (!item) throw new Error("Item not found");
      const clamped = Math.min(Math.max(0, discountPerUnit), item.unit_price);
      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price, discount: clamped, quantity: item.quantity, gstExempt: item.gst_exempt,
      });
      await pb.collection("cart_items").update(itemId, { discount: clamped, gst_5: gstAmount, total }, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const applyDiscount = async (itemId: string, discountPerUnit: number): Promise<OpResult> => {
    try {
      await applyDiscountMutation.mutateAsync({ itemId, discountPerUnit });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  // Assign (or clear) the salesperson for a single cart line — per-line attribution (#3).
  const setLineSalespersonMutation = useMutation({
    mutationFn: async ({ itemId, salespersonId }: { itemId: string; salespersonId: string | null }) => {
      await pb.collection("cart_items").update(itemId, { salesperson_id: salespersonId ?? null }, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const setLineSalesperson = async (itemId: string, salespersonId: string | null): Promise<OpResult> => {
    try {
      await setLineSalespersonMutation.mutateAsync({ itemId, salespersonId });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  // Alt+U — move a ticket line to another level of the Pcs/Pack/Case ladder.
  //
  // Rate and per-unit discount both follow the unit (they mean "per one of what we are
  // selling"), so the price PER PIECE is unchanged by the switch — a cashier who moves a line
  // from Pcs to Carton sees the amount stay the same for the same number of pieces, which is
  // the only behaviour that does not look like a pricing bug.
  const setLineUnitMutation = useMutation({
    mutationFn: async ({ itemId, level }: { itemId: string; level: UnitLevel }) => {
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const item = current.find((i) => i.id === itemId);
      if (!item) throw new Error("Item not found");
      const from = lineFactor(item);
      const to = Math.max(1, level.factor);
      if (from === to && (item.unit_label ?? "") === level.label) return;

      // Re-cap against stock IN THE NEW UNIT before writing. Refusing outright when the stock
      // does not cover even one of them is the point: clamping to a quantity of 1 would sell a
      // whole carton out of five loose pieces.
      const stock = resolveStock(queryClient, item.product, item.expand?.product);
      const cap = unitsAvailable(stock, to);
      if (cap != null && cap < 1) {
        throw new Error(`Not enough stock for one ${level.label} — ${stock} pcs on hand`);
      }
      const qty = cap != null ? Math.min(item.quantity, cap) : item.quantity;

      const unitPrice = repriceForLevel(item.unit_price, from, to);
      const discount = item.discount ? repriceForLevel(item.discount, from, to) : 0;
      const { gstAmount, total } = calcItemTotals({
        unitPrice, discount, quantity: qty, gstExempt: item.gst_exempt,
      });
      await pb.collection("cart_items").update(itemId, {
        unit_label: level.label, unit_factor: to,
        unit_price: unitPrice, discount, quantity: qty, gst_5: gstAmount, total,
      }, PB_REQ);
      if (qty < item.quantity) {
        toast.error(`Reduced to ${qty} x ${level.label} — ${stock} pcs on hand`);
      }
    },
    onSuccess: () => refetchItems(),
  });

  const setLineUnit = async (itemId: string, level: UnitLevel): Promise<OpResult> => {
    try {
      await setLineUnitMutation.mutateAsync({ itemId, level });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  // Ctrl+T — the line's remark. Purely descriptive: it moves no stock and changes no total, so
  // it writes on its own without touching the GST maths.
  const setLineRemarkMutation = useMutation({
    mutationFn: async ({ itemId, remark }: { itemId: string; remark: string }) => {
      await pb.collection("cart_items").update(itemId, { remark: remark.slice(0, 200) }, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const setLineRemark = async (itemId: string, remark: string): Promise<OpResult> => {
    try {
      await setLineRemarkMutation.mutateAsync({ itemId, remark });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const overridePriceMutation = useMutation({
    mutationFn: async ({ itemId, newUnitPrice }: { itemId: string; newUnitPrice: number }) => {
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const item = current.find((i) => i.id === itemId);
      if (!item) throw new Error("Item not found");
      const price = Math.max(0, newUnitPrice);
      const { gstAmount, total } = calcItemTotals({
        unitPrice: price, discount: item.discount, quantity: item.quantity, gstExempt: item.gst_exempt,
      });
      await pb.collection("cart_items").update(itemId, { unit_price: price, gst_5: gstAmount, total }, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const overridePrice = async (itemId: string, newUnitPrice: number): Promise<OpResult> => {
    try {
      await overridePriceMutation.mutateAsync({ itemId, newUnitPrice });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const clearCart = async (): Promise<OpResult> => {
    if (!cart) return { success: false, error: "No active cart" };
    try {
      await Promise.all(items.map((item) =>
        pb.collection("cart_items").delete(item.id, PB_REQ).catch(() => {})
      ));
      await pb.collection("carts").update(cart.id, { status: CART_STATUS.ABANDONED }, PB_REQ);
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  const setCustomer = async (customerId: string | null): Promise<OpResult> => {
    if (!cart) return { success: false, error: "No active cart" };
    try {
      await pb.collection("carts").update(cart.id, { customer_whatsapp: customerId || "" }, PB_REQ);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  };

  return {
    cart,
    items,
    loading: cartQuery.isLoading || itemsQuery.isLoading,
    ...totals,
    taxExempt,
    setTaxExempt,
    gstIncluded,
    setGstIncluded,
    subtotalExTax,
    gstTotalExempt,
    grandTotalExempt,
    addItem,
    updateQty,
    applyDiscount,
    applyBillDiscount,
    setLineSalesperson,
    setLineUnit,
    setLineRemark,
    overridePrice,
    removeItem,
    clearCart,
    setCustomer,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      if (cartId) queryClient.invalidateQueries({ queryKey: ["cart-items", cartId] });
    },
  };
}
