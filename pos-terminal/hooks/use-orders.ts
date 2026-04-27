"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

export interface Order {
  id: string;
  order_no: string;
  status: string;
  items: any[];
  subtotal: number;
  gst_total: number;
  grand_total: number;
  payment_method: string;
  payment_ref: string;
  buyer_id: string;
  customer_name: string;
  customer_phone: string;
  created_by: string;
  digital_signature: string;
  created_at: string;
  expand?: { buyer_id?: any; created_by?: any };
}

export function useOrders() {
  const pb = getPB();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, today, confirmed, cancelled, refunded

  const fetchOrders = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let filterStr = "";
      if (filter === "today") {
        const today = new Date().toISOString().split("T")[0];
        filterStr = `created_at >= "${today} 00:00:00"`;
      } else if (filter === "confirmed") {
        filterStr = 'status = "CONFIRMED"';
      } else if (filter === "cancelled") {
        filterStr = 'status = "CANCELLED"';
      } else if (filter === "refunded") {
        filterStr = 'status = "REFUNDED"';
      }

      const records = await pb.collection("orders").getFullList<Order>({
        sort: "-created_at",
        filter: filterStr || undefined,
        expand: "buyer_id,created_by",
        requestKey: null,
      });
      setOrders(records);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [pb, filter]);

  useEffect(() => {
    fetchOrders();

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchOrders();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchOrders, pb]);

  const createOrder = useCallback(
    async (data: Partial<Order>) => {
      try {
        const record = await pb.collection("orders").create(data);
        await fetchOrders();
        return { success: true, order: record as unknown as Order };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchOrders]
  );

  const cancelOrder = useCallback(
    async (orderId: string, reason: string) => {
      try {
        // Get order to restore stock
        const order = await pb.collection("orders").getOne(orderId);
        const items: any[] = order.items || [];

        for (const item of items) {
          if (item.product) {
            // Restore stock
            const product = await pb.collection("products").getOne(item.product).catch(() => null);
            if (product) {
              const restoredStock = (product.current_stock || 0) + (item.quantity || 0);
              await pb.collection("products").update(item.product, { current_stock: restoredStock });
            }
            // Record inventory movement
            await pb.collection("inventory_movements").create({
              product: item.product,
              movement_type: "RETURN",
              quantity: item.quantity || 0,
              reference_id: orderId,
              notes: `Cancelled order ${order.order_no}`,
            });
          }
        }

        await pb.collection("orders").update(orderId, {
          status: "CANCELLED",
          cancellation_reason: reason,
        });
        await fetchOrders();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchOrders]
  );

  const refundOrder = useCallback(
    async (orderId: string, refundItems: { itemId: string; qty: number }[], reason: string) => {
      try {
        const order = await pb.collection("orders").getOne(orderId);
        const items: any[] = order.items || [];

        let refundAmount = 0;
        for (const ri of refundItems) {
          const item = items.find((i: any) => i.id === ri.itemId);
          if (item) {
            const ratio = ri.qty / item.quantity;
            refundAmount += item.total * ratio;

            // Restore stock for refunded items
            if (item.product && ri.qty > 0) {
              const product = await pb.collection("products").getOne(item.product).catch(() => null);
              if (product) {
                const restoredStock = (product.current_stock || 0) + ri.qty;
                await pb.collection("products").update(item.product, { current_stock: restoredStock });
              }
              await pb.collection("inventory_movements").create({
                product: item.product,
                movement_type: "RETURN",
                quantity: ri.qty,
                reference_id: orderId,
                notes: `Refund — ${order.order_no}`,
              });
            }
          }
        }

        await pb.collection("orders").update(orderId, {
          status: "REFUNDED",
          refund_amount: refundAmount,
          refund_reason: reason,
        });

        await fetchOrders();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchOrders]
  );

  return {
    orders,
    loading,
    filter,
    setFilter,
    createOrder,
    cancelOrder,
    refundOrder,
    refresh: fetchOrders,
  };
}
