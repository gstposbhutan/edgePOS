"use client";

import { useState, useEffect, useCallback } from "react";
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
  gst_amount: number;
  total: number;
  expand?: { product?: Product };
}

export interface Cart {
  id: string;
  status: string;
  customer?: string;
  expand?: { customer?: Customer };
}

import type { Customer } from "./use-customers";
export type { Customer };

export function useCart() {
  const pb = getPB();
  const [cart, setCart] = useState<Cart | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveCart = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pb.collection("carts").getFullList<Cart>({
        filter: 'status = "active"',
        sort: "-created",
        expand: "customer",
        requestKey: null,
      });
      if (records.length > 0) {
        setCart(records[0]);
        const itemRecords = await pb.collection("cart_items").getFullList<CartItem>({
          filter: `cart = "${records[0].id}"`,
          expand: "product",
          sort: "created",
          requestKey: null,
        });
        setItems(itemRecords);
      } else {
        // Create new active cart
        const newCart = await pb.collection("carts").create({ status: "active" });
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
  }, [fetchActiveCart]);

  const addItem = useCallback(
    async (product: Product) => {
      if (!cart) return;
      const unitPrice = product.sale_price || product.mrp || 0;
      const existing = items.find((i) => i.product === product.id);

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
          gst_amount: gstAmount,
          total,
        });
        setItems((prev) => [...prev, newItem as unknown as CartItem]);
      } catch (err) {
        console.error("Add item error:", err);
      }
    },
    [cart, items, pb]
  );

  const updateQty = useCallback(
    async (itemId: string, newQty: number) => {
      if (newQty < 1) return removeItem(itemId);
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const { gstAmount, total } = calcItemTotals({
        unitPrice: item.unit_price,
        discount: item.discount,
        quantity: newQty,
      });

      try {
        const updated = await pb.collection("cart_items").update(itemId, {
          quantity: newQty,
          gst_amount: gstAmount,
          total,
        });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Update qty error:", err);
      }
    },
    [items, pb]
  );

  const applyDiscount = useCallback(
    async (itemId: string, discountPerUnit: number) => {
      const item = items.find((i) => i.id === itemId);
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
          gst_amount: gstAmount,
          total,
        });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Discount error:", err);
      }
    },
    [items, pb]
  );

  const overridePrice = useCallback(
    async (itemId: string, newUnitPrice: number) => {
      const item = items.find((i) => i.id === itemId);
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
          gst_amount: gstAmount,
          total,
        });
        setItems((prev) => prev.map((i) => (i.id === itemId ? (updated as unknown as CartItem) : i)));
      } catch (err) {
        console.error("Price override error:", err);
      }
    },
    [items, pb]
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      try {
        await pb.collection("cart_items").delete(itemId);
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      } catch (err) {
        console.error("Remove item error:", err);
      }
    },
    [pb]
  );

  const clearCart = useCallback(async () => {
    if (!cart) return;
    try {
      // Delete all cart items
      for (const item of items) {
        await pb.collection("cart_items").delete(item.id);
      }
      // Mark cart as abandoned and create new one
      await pb.collection("carts").update(cart.id, { status: "abandoned" });
      const newCart = await pb.collection("carts").create({ status: "active" });
      setCart(newCart as unknown as Cart);
      setItems([]);
    } catch (err) {
      console.error("Clear cart error:", err);
    }
  }, [cart, items, pb]);

  const setCustomer = useCallback(
    async (customerId: string | null) => {
      if (!cart) return;
      try {
        await pb.collection("carts").update(cart.id, { customer: customerId });
        setCart((prev) => (prev ? { ...prev, customer: customerId || undefined } : null));
      } catch (err) {
        console.error("Set customer error:", err);
      }
    },
    [cart, pb]
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
