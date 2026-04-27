"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPB } from "@/lib/pb-client";
import { calcItemTotals, calcCartTotals } from "@/lib/gst";
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

export function useCart() {
  const pb = getPB();
  const [cart, setCart] = useState<Cart | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
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
        // Create new active cart
        const newCart = await pb.collection("carts").create({ status: "ACTIVE" }, { requestKey: null });
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

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchActiveCart();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchActiveCart, pb]);

  const removeItem = useCallback(
    async (itemId: string) => {
      try {
        await pb.collection("cart_items").delete(itemId, { requestKey: null });
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      } catch (err) {
        console.error("Remove item error:", err);
      }
    },
    [pb]
  );

  const updateQty = useCallback(
    async (itemId: string, newQty: number) => {
      if (newQty < 1) return removeItem(itemId);
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;

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
        }, { requestKey: null });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Update qty error:", err);
      }
    },
    [pb, removeItem]
  );

  const addItem = useCallback(
    async (product: Product) => {
      if (!cart) return;
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
        }, { requestKey: null });
        setItems((prev) => [...prev, newItem as unknown as CartItem]);
      } catch (err) {
        console.error("Add item error:", err);
      }
    },
    [cart, updateQty, pb]
  );

  const applyDiscount = useCallback(
    async (itemId: string, discountPerUnit: number) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;
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
        }, { requestKey: null });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Discount error:", err);
      }
    },
    [pb]
  );

  const overridePrice = useCallback(
    async (itemId: string, newUnitPrice: number) => {
      const item = itemsRef.current.find((i) => i.id === itemId);
      if (!item) return;
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
        }, { requestKey: null });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Price override error:", err);
      }
    },
    [pb]
  );

  const clearCart = useCallback(async () => {
    if (!cart) return;
    try {
      const currentItems = itemsRef.current;
      await Promise.all(currentItems.map((item) =>
        pb.collection("cart_items").delete(item.id).catch(() => {})
      ));
      await pb.collection("carts").update(cart.id, { status: "ABANDONED" });
      const newCart = await pb.collection("carts").create({ status: "ACTIVE" });
      setCart(newCart as unknown as Cart);
      setItems([]);
    } catch (err) {
      console.error("Clear cart error:", err);
    }
  }, [cart, pb]);

  const setCustomer = useCallback(
    (customerId: string | null) => {
      setCart((prev) => (prev ? { ...prev } : null));
    },
    []
  );

  const totals = calcCartTotals(
    items.map((i) => ({ unitPrice: i.unit_price, discount: i.discount, quantity: i.quantity }))
  );

  return {
    cart,
    items,
    loading,
    ...totals,
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
