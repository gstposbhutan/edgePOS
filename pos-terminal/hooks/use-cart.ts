"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { calcItemTotals, calcCartTotals } from "@/lib/gst";
import { CART_STATUS } from "@/lib/constants";
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

export function useCart() {
  const pb = getPB();
  const [cart, setCart] = useState<Cart | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxExempt, setTaxExempt] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const fetchActiveCart = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await pb.collection("carts").getFullList<Cart>({
        filter: 'status = "ACTIVE"',
        sort: "-created_at",
        requestKey: null,
      });
      if (records.length > 0) {
        setCart(records[0]);
        const itemRecords = await pb.collection("cart_items").getFullList<CartItem>({
          filter: `cart = "${records[0].id}"`,
          expand: "product",
          sort: "created_at",
          requestKey: null,
        });
        setItems(itemRecords);
      } else {
        const newCart = await pb.collection("carts").create({ status: CART_STATUS.ACTIVE }, PB_REQ);
        setCart(newCart as unknown as Cart);
        setItems([]);
      }
    } catch (err) {
      console.error("Cart fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    fetchActiveCart();

    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchActiveCart();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchActiveCart, pb]);

  const removeItem = useCallback(
    async (itemId: string): Promise<OpResult> => {
      try {
        await pb.collection("cart_items").delete(itemId, PB_REQ);
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [pb]
  );

  const updateQty = useCallback(
    async (itemId: string, newQty: number): Promise<OpResult> => {
      if (newQty < 1) return removeItem(itemId);
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return { success: false, error: "Item not found" };

      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price,
        discount: item.discount,
        quantity: newQty,
      });

      try {
        const updated = await pb.collection("cart_items").update(itemId, {
          quantity: newQty,
          gst_5: gstAmount,
          total,
        }, PB_REQ);
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [pb, removeItem]
  );

  const addItem = useCallback(
    async (product: Product): Promise<OpResult> => {
      if (!cart) return { success: false, error: "No active cart" };
      const unitPrice = product.sale_price || product.mrp || 0;
      const existing = itemsRef.current.find((i) => i.product === product.id);

      if (existing) {
        return updateQty(existing.id, existing.quantity + 1);
      }

      const { gstAmount, total } = calcItemTotals({ unitPrice, discount: 0, quantity: 1 });

      try {
        const newItem = await pb.collection("cart_items").create({
          cart: cart.id,
          product: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unit_price: unitPrice,
          discount: 0,
          gst_5: gstAmount,
          total,
        }, PB_REQ);
        setItems((prev) => [...prev, newItem as unknown as CartItem]);
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [cart, updateQty, pb]
  );

  const applyDiscount = useCallback(
    async (itemId: string, discountPerUnit: number): Promise<OpResult> => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return { success: false, error: "Item not found" };
      const clamped = Math.min(Math.max(0, discountPerUnit), item.unit_price);
      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price,
        discount: clamped,
        quantity: item.quantity,
      });

      try {
        const updated = await pb.collection("cart_items").update(itemId, {
          discount: clamped,
          gst_5: gstAmount,
          total,
        }, PB_REQ);
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [pb]
  );

  const overridePrice = useCallback(
    async (itemId: string, newUnitPrice: number): Promise<OpResult> => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return { success: false, error: "Item not found" };
      const price = Math.max(0, newUnitPrice);
      const { gstAmount, total } = calcItemTotals({
        unitPrice: price,
        discount: item.discount,
        quantity: item.quantity,
      });

      try {
        const updated = await pb.collection("cart_items").update(itemId, {
          unit_price: price,
          gst_5: gstAmount,
          total,
        }, PB_REQ);
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [pb]
  );

  const clearCart = useCallback(async (): Promise<OpResult> => {
    if (!cart) return { success: false, error: "No active cart" };
    try {
      const currentItems = itemsRef.current;
      await Promise.all(currentItems.map((item) =>
        pb.collection("cart_items").delete(item.id, PB_REQ).catch(() => {})
      ));
      await pb.collection("carts").update(cart.id, { status: CART_STATUS.ABANDONED }, PB_REQ);
      const newCart = await pb.collection("carts").create({ status: CART_STATUS.ACTIVE }, PB_REQ);
      setCart(newCart as unknown as Cart);
      setItems([]);
      return { success: true };
    } catch (err) {
      return { success: false, error: errMsg(err) };
    }
  }, [cart, pb]);

  const setCustomer = useCallback(
    async (customerId: string | null): Promise<OpResult> => {
      if (!cart) return { success: false, error: "No active cart" };
      try {
        await pb.collection("carts").update(cart.id, {
          customer_whatsapp: customerId || "",
        }, PB_REQ);
        return { success: true };
      } catch (err) {
        return { success: false, error: errMsg(err) };
      }
    },
    [cart, pb]
  );

  const totals = calcCartTotals(
    items.map((i) => ({ unitPrice: i.unit_price, discount: i.discount, quantity: i.quantity }))
  );

  const subtotalExTax = totals.taxableSubtotal;
  const gstTotalExempt = taxExempt ? 0 : totals.gstTotal;
  const grandTotalExempt = taxExempt ? totals.taxableSubtotal : totals.grandTotal;

  return {
    cart,
    items,
    loading,
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
    refresh: fetchActiveCart,
  };
}
