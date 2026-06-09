"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { getRegisterId } from "@/lib/register";
import { PURCHASE_STATUS, CONNECTION_STATUS, MOVEMENT_TYPE, DEFAULT_GST_RATE } from "@/lib/constants";
import { todayCompact } from "@/lib/date-utils";

export interface PurchaseItem {
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  po_no: string;
  status: string;
  supplier: string;
  supplier_name: string;
  items: PurchaseItem[];
  subtotal: number;
  gst_total: number;
  grand_total: number;
  notes: string;
  expected_at: string;
  submitted_at: string;
  confirmed_at: string;
  received_at: string;
  created_at: string;
}

export interface WholesalerConnection {
  id: string;
  wholesaler: string;
  wholesaler_name: string;
  wholesaler_phone: string;
  tpn_gstin: string;
  status: string;
  notes: string;
  created_at: string;
}

function computeTotals(items: PurchaseItem[]) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
  const gst_total = +(subtotal * (DEFAULT_GST_RATE / 100)).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), gst_total, grand_total: +(subtotal + gst_total).toFixed(2) };
}

async function fetchConnections(): Promise<WholesalerConnection[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  return pb.collection("wholesaler_connections").getFullList<WholesalerConnection>({
    sort: "wholesaler_name",
    requestKey: null,
  });
}

async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  return pb.collection("purchase_orders").getFullList<PurchaseOrder>({
    sort: "-created",
    requestKey: null,
  });
}

export function usePurchases() {
  const pb = getPB();
  const queryClient = useQueryClient();

  const connectionsQuery = useQuery({
    queryKey: ["wholesaler_connections"],
    queryFn: fetchConnections,
    staleTime: 60 * 1000,
  });

  const ordersQuery = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: fetchPurchaseOrders,
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
  };

  // ── Wholesaler connections ─────────────────────────────────────────────────
  const addConnection = useCallback(
    async (data: Partial<WholesalerConnection>) => {
      try {
        const record = await pb.collection("wholesaler_connections").create({
          status: CONNECTION_STATUS.ACTIVE,
          ...data,
        }, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["wholesaler_connections"] });
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, queryClient]
  );

  const updateConnection = useCallback(
    async (id: string, data: Partial<WholesalerConnection>) => {
      try {
        await pb.collection("wholesaler_connections").update(id, data, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["wholesaler_connections"] });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, queryClient]
  );

  const removeConnection = useCallback(
    async (id: string) => {
      try {
        await pb.collection("wholesaler_connections").delete(id, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["wholesaler_connections"] });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, queryClient]
  );

  // ── Purchase orders ────────────────────────────────────────────────────────
  const generatePoNo = useCallback(async () => {
    const today = todayCompact();
    const count = await pb.collection("purchase_orders").getList(1, 1, {
      filter: `po_no ~ "PO-${today}-"`,
      requestKey: null,
    });
    const serial = String((count.totalItems || 0) + 1).padStart(3, "0");
    return `PO-${today}-${serial}`;
  }, [pb]);

  const createDraft = useCallback(
    async (connection: WholesalerConnection, items: PurchaseItem[], notes = "") => {
      try {
        if (items.length === 0) throw new Error("Add at least one item");
        const totals = computeTotals(items);
        const po_no = await generatePoNo();
        const record = await pb.collection("purchase_orders").create({
          po_no,
          status: PURCHASE_STATUS.DRAFT,
          supplier: connection.wholesaler || undefined,
          supplier_name: connection.wholesaler_name,
          items,
          ...totals,
          notes,
          is_synced: false,
        }, PB_REQ);
        invalidate();
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, generatePoNo]
  );

  const updateDraft = useCallback(
    async (id: string, items: PurchaseItem[], notes?: string) => {
      try {
        const totals = computeTotals(items);
        await pb.collection("purchase_orders").update(id, {
          items,
          ...totals,
          ...(notes !== undefined ? { notes } : {}),
          is_synced: false,
        }, PB_REQ);
        invalidate();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb]
  );

  const setStatus = useCallback(
    async (id: string, status: string, stampField?: string) => {
      try {
        await pb.collection("purchase_orders").update(id, {
          status,
          ...(stampField ? { [stampField]: new Date().toISOString() } : {}),
          is_synced: false,
        }, PB_REQ);
        invalidate();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb]
  );

  const submitOrder = useCallback((id: string) => setStatus(id, PURCHASE_STATUS.SUBMITTED, "submitted_at"), [setStatus]);
  const confirmOrder = useCallback((id: string) => setStatus(id, PURCHASE_STATUS.CONFIRMED, "confirmed_at"), [setStatus]);
  const cancelOrder = useCallback((id: string) => setStatus(id, PURCHASE_STATUS.CANCELLED), [setStatus]);

  // Receiving a PO adds its items into local stock and records RESTOCK movements,
  // then marks the order RECEIVED.
  const receiveOrder = useCallback(
    async (order: PurchaseOrder) => {
      try {
        const registerId = await getRegisterId();
        for (const item of order.items || []) {
          if (!item.product) continue;
          const product = await pb.collection("products").getOne<{ current_stock: number }>(item.product, PB_REQ);
          const newStock = (product.current_stock || 0) + item.quantity;
          await pb.collection("products").update(item.product, { current_stock: newStock }, PB_REQ);
          // Match the canonical movement shape (register_id + notes); cost and
          // supplier ride in notes so the row syncs through the ingest as-is.
          await pb.collection("inventory_movements").create({
            product: item.product,
            movement_type: MOVEMENT_TYPE.RESTOCK,
            quantity: item.quantity,
            register_id: registerId || "",
            notes: `PO ${order.po_no} from ${order.supplier_name} @ Nu.${item.unit_cost}/unit`,
          }, PB_REQ);
        }
        await pb.collection("purchase_orders").update(order.id, {
          status: PURCHASE_STATUS.RECEIVED,
          received_at: new Date().toISOString(),
          is_synced: false,
        }, PB_REQ);
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["products"] });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, queryClient]
  );

  return {
    connections: connectionsQuery.data ?? [],
    orders: ordersQuery.data ?? [],
    loading: connectionsQuery.isLoading || ordersQuery.isLoading,
    addConnection,
    updateConnection,
    removeConnection,
    createDraft,
    updateDraft,
    submitOrder,
    confirmOrder,
    cancelOrder,
    receiveOrder,
    computeTotals,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesaler_connections"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
    },
  };
}
