"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { calcItemTotals, calcCartTotals } from "@/lib/gst";
import { CART_STATUS, DISCOUNT_TYPE } from "@/lib/constants";
import { usePosStore } from "@/stores/pos-store";
import type { Product } from "./use-products";

export interface CartItem {
  id: string;
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  discount: number;
  discount_type?: string;
  gst_5: number;
  total: number;
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

export function useCart() {
  const pb = getPB();
  const queryClient = useQueryClient();
  const taxExempt = usePosStore((s) => s.taxExempt);
  const setTaxExempt = usePosStore((s) => s.setTaxExempt);

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

  const items = itemsQuery.data ?? [];

  const totals = calcCartTotals(
    items.map((i) => ({ unitPrice: i.unit_price, discount: i.discount, quantity: i.quantity, discountType: i.discount_type }))
  );

  const subtotalExTax = totals.taxableSubtotal;
  const gstTotalExempt = taxExempt ? 0 : totals.gstTotal;
  const grandTotalExempt = taxExempt ? totals.taxableSubtotal : totals.grandTotal;

  const refetchItems = () => {
    if (cartId) queryClient.invalidateQueries({ queryKey: ["cart-items", cartId] });
  };

  const addItemMutation = useMutation({
    mutationFn: async (product: Product): Promise<CartItem> => {
      if (!cart) throw new Error("No active cart");
      // Check cache for existing item (reflects latest server state via refetch)
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const existing = current.find((i) => i.product === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        const { gstAmount, total } = calcItemTotals({
          unitPrice: existing.unit_price, discount: existing.discount, quantity: newQty,
        });
        await pb.collection("cart_items").update(existing.id, { quantity: newQty, gst_5: gstAmount, total }, PB_REQ);
        return existing; // onSuccess will refetch, so return value isn't critical
      }
      const unitPrice = product.sale_price || product.mrp || 0;
      const { gstAmount, total } = calcItemTotals({ unitPrice, discount: 0, quantity: 1 });
      return pb.collection("cart_items").create({
        cart: cart.id, product: product.id, name: product.name, sku: product.sku,
        quantity: 1, unit_price: unitPrice, discount: 0, gst_5: gstAmount, total,
      }, PB_REQ) as unknown as CartItem;
    },
    onSuccess: () => refetchItems(),
  });

  const addItem = async (product: Product): Promise<OpResult> => {
    try {
      await addItemMutation.mutateAsync(product);
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
      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price, discount: item.discount, quantity: newQty, discountType: item.discount_type,
      });
      await pb.collection("cart_items").update(itemId, { quantity: newQty, gst_5: gstAmount, total }, PB_REQ);
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
    mutationFn: async ({ itemId, discountPerUnit, discountType }: { itemId: string; discountPerUnit: number; discountType: string }) => {
      const current = queryClient.getQueryData<CartItem[]>(["cart-items", cartId]) ?? [];
      const item = current.find((i) => i.id === itemId);
      if (!item) throw new Error("Item not found");
      let clamped = Math.min(Math.max(0, discountPerUnit), item.unit_price);
      if (discountType === DISCOUNT_TYPE.PERCENTAGE) {
        clamped = Math.min(100, Math.max(0, discountPerUnit));
      }
      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price, discount: clamped, quantity: item.quantity,
      }, undefined, discountType);
      const updateData: Record<string, unknown> = { discount: clamped, gst_5: gstAmount, total };
      try { updateData.discount_type = discountType; } catch { /* PB field may not exist yet */ }
      await pb.collection("cart_items").update(itemId, updateData, PB_REQ);
    },
    onSuccess: () => refetchItems(),
  });

  const applyDiscount = async (itemId: string, discountPerUnit: number, discountType: string = DISCOUNT_TYPE.FLAT): Promise<OpResult> => {
    try {
      await applyDiscountMutation.mutateAsync({ itemId, discountPerUnit, discountType });
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
        unitPrice: price, discount: item.discount, quantity: item.quantity, discountType: item.discount_type,
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
    subtotalExTax,
    gstTotalExempt,
    grandTotalExempt,
    addItem,
    updateQty,
    applyDiscount,
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
