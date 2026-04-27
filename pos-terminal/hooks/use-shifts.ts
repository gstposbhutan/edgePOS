"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

export interface Shift {
  id: string;
  opened_by: string;
  closed_by?: string;
  opening_float: number;
  closing_count?: number;
  expected_total?: number;
  discrepancy?: number;
  status: "active" | "closing" | "closed";
  opened_at: string;
  closed_at?: string;
  cash_sales: number;
  digital_sales: number;
  credit_sales: number;
  refund_total: number;
  transaction_count: number;
  expand?: {
    opened_by?: { id: string; name: string };
    closed_by?: { id: string; name: string };
  };
}

export function useShifts() {
  const pb = getPB();
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActiveShift = useCallback(async () => {
    try {
      const records = await pb.collection("shifts").getFullList<Shift>({
        filter: 'status = "active"',
        sort: "-opened_at",
        limit: 1,
        expand: "opened_by",
        requestKey: null,
      });
      setActiveShift(records[0] || null);
    } catch {
      setActiveShift(null);
    }
  }, [pb]);

  const fetchShiftHistory = useCallback(async (date?: string) => {
    setLoading(true);
    try {
      let filter = 'status = "closed"';
      if (date) {
        filter += ` && opened_at >= "${date} 00:00:00" && opened_at <= "${date} 23:59:59"`;
      }
      const records = await pb.collection("shifts").getFullList<Shift>({
        filter,
        sort: "-opened_at",
        limit: 50,
        expand: "opened_by,closed_by",
        requestKey: null,
      });
      setShiftHistory(records);
    } catch (err) {
      console.error("Shift history error:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    fetchActiveShift();
    fetchShiftHistory();

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchActiveShift();
        fetchShiftHistory();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchActiveShift, fetchShiftHistory, pb]);

  const openShift = useCallback(
    async (userId: string, openingFloat: number) => {
      try {
        // Close any stale active shifts first
        const stale = await pb.collection("shifts").getFullList<Shift>({
          filter: 'status = "active"',
        });
        for (const s of stale) {
          await pb.collection("shifts").update(s.id, { status: "closed", closed_at: new Date().toISOString() });
        }

        const record = await pb.collection("shifts").create({
          opened_by: userId,
          opening_float: openingFloat,
          status: "active",
          opened_at: new Date().toISOString(),
        });
        await fetchActiveShift();
        return { success: true, shift: record as unknown as Shift };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchActiveShift]
  );

  const closeShift = useCallback(
    async (shiftId: string, userId: string, closingCount: number) => {
      try {
        // Calculate expected from orders during shift
        const shift = await pb.collection("shifts").getOne<Shift>(shiftId);
        const orders = await pb.collection("orders").getFullList({
          filter: `created_at >= "${shift.opened_at}" && status = "CONFIRMED"`,
          requestKey: null,
        });

        let cashSales = 0;
        let digitalSales = 0;
        let creditSales = 0;
        let refundTotal = 0;

        for (const o of orders) {
          if (o.payment_method === "cash") cashSales += o.grand_total;
          else if (o.payment_method === "credit") creditSales += o.grand_total;
          else digitalSales += o.grand_total;
          if (o.refund_amount) refundTotal += o.refund_amount;
        }

        const expectedTotal = shift.opening_float + cashSales - refundTotal;
        const discrepancy = closingCount - expectedTotal;

        await pb.collection("shifts").update(shiftId, {
          status: "closed",
          closed_by: userId,
          closing_count: closingCount,
          expected_total: expectedTotal,
          discrepancy,
          closed_at: new Date().toISOString(),
          cash_sales: cashSales,
          digital_sales: digitalSales,
          credit_sales: creditSales,
          refund_total: refundTotal,
          transaction_count: orders.length,
        });

        await fetchActiveShift();
        await fetchShiftHistory();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchActiveShift, fetchShiftHistory]
  );

  const getZReport = useCallback(
    async (date?: string) => {
      const targetDate = date || new Date().toISOString().split("T")[0];
      try {
        const orders = await pb.collection("orders").getFullList({
          filter: `created_at >= "${targetDate} 00:00:00" && created_at <= "${targetDate} 23:59:59" && status = "CONFIRMED"`,
          requestKey: null,
        });

        const cancelled = await pb.collection("orders").getFullList({
          filter: `created_at >= "${targetDate} 00:00:00" && created_at <= "${targetDate} 23:59:59" && status = "CANCELLED"`,
          requestKey: null,
        });

        const refunded = await pb.collection("orders").getFullList({
          filter: `created_at >= "${targetDate} 00:00:00" && created_at <= "${targetDate} 23:59:59" && status = "REFUNDED"`,
          requestKey: null,
        });

        const report = {
          date: targetDate,
          totalOrders: orders.length,
          totalCancelled: cancelled.length,
          totalRefunded: refunded.length,
          grossSales: orders.reduce((s, o) => s + o.grand_total, 0),
          subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
          gstTotal: orders.reduce((s, o) => s + o.gst_total, 0),
          refundTotal: refunded.reduce((s, o) => s + (o.refund_amount || 0), 0),
          cashSales: orders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.grand_total, 0),
          digitalSales: orders.filter((o) => ["mbob", "mpay", "rtgs"].includes(o.payment_method)).reduce((s, o) => s + o.grand_total, 0),
          creditSales: orders.filter((o) => o.payment_method === "credit").reduce((s, o) => s + o.grand_total, 0),
        };

        return report;
      } catch (err) {
        console.error("Z-Report error:", err);
        return null;
      }
    },
    [pb]
  );

  return {
    activeShift,
    shiftHistory,
    loading,
    openShift,
    closeShift,
    getZReport,
    refresh: fetchActiveShift,
  };
}
