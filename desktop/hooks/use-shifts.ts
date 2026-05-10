"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { pbNow } from "@/lib/date-utils";

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

async function fetchActiveShift(): Promise<Shift | null> {
  const pb = getPB();
  const records = await pb.collection("shifts").getFullList<Shift>({
    filter: 'status = "active"',
    sort: "-opened_at",
    limit: 1,
    expand: "opened_by",
    requestKey: null,
  });
  return records[0] || null;
}

async function fetchShiftHistory(date?: string): Promise<Shift[]> {
  const pb = getPB();
  let filter = 'status = "closed"';
  if (date) {
    filter += ` && opened_at >= "${date} 00:00:00" && opened_at <= "${date} 23:59:59"`;
  }
  return pb.collection("shifts").getFullList<Shift>({
    filter,
    sort: "-opened_at",
    limit: 50,
    expand: "opened_by,closed_by",
    requestKey: null,
  });
}

export function useShifts() {
  const pb = getPB();
  const queryClient = useQueryClient();

  const { data: activeShift = null } = useQuery({
    queryKey: ["shifts", "active"],
    queryFn: fetchActiveShift,
    staleTime: 30 * 1000,
  });

  const { data: shiftHistory = [], isLoading } = useQuery({
    queryKey: ["shifts", "history"],
    queryFn: () => fetchShiftHistory(),
    staleTime: 30 * 1000,
  });

  const openShiftMutation = useMutation({
    mutationFn: async ({ userId, openingFloat }: { userId: string; openingFloat: number }) => {
      const stale = await pb.collection("shifts").getFullList<Shift>({ filter: 'status = "active"' });
      for (const s of stale) {
        await pb.collection("shifts").update(s.id, { status: "closed", closed_at: pbNow() }, PB_REQ);
      }
      const record = await pb.collection("shifts").create({
        opened_by: userId,
        opening_float: openingFloat,
        status: "active",
        opened_at: pbNow(),
      }, PB_REQ);
      return record as unknown as Shift;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });

  const openShift = useCallback(
    async (userId: string, openingFloat: number) => {
      try {
        const shift = await openShiftMutation.mutateAsync({ userId, openingFloat });
        return { success: true, shift };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [openShiftMutation]
  );

  const closeShiftMutation = useMutation({
    mutationFn: async ({ shiftId, userId, closingCount }: { shiftId: string; userId: string; closingCount: number }) => {
      const shift = await pb.collection("shifts").getOne<Shift>(shiftId, PB_REQ);
      const orders = await pb.collection("orders").getFullList({
        filter: `created_at >= "${shift.opened_at}" && status = "CONFIRMED"`,
        requestKey: null,
      });

      // Fetch cash adjustments for this shift
      const adjustments = await pb.collection("cash_adjustments").getFullList<{ amount: number; type: string }>({
        filter: `shift = "${shiftId}"`,
        requestKey: null,
      }).catch(() => []);

      const totalCashIn = adjustments
        .filter((a) => a.type === "CASH_IN")
        .reduce((sum, a) => sum + a.amount, 0);
      const totalCashOut = adjustments
        .filter((a) => a.type === "CASH_OUT")
        .reduce((sum, a) => sum + a.amount, 0);

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

      // Expected = opening_float + cash_sales - refunds + cash_ins - cash_outs
      const expectedTotal = shift.opening_float + cashSales - refundTotal + totalCashIn - totalCashOut;
      const discrepancy = closingCount - expectedTotal;

      return pb.collection("shifts").update(shiftId, {
        status: "closed", closed_by: userId, closing_count: closingCount,
        expected_total: expectedTotal, discrepancy, closed_at: pbNow(),
        cash_sales: cashSales, digital_sales: digitalSales, credit_sales: creditSales,
        refund_total: refundTotal, transaction_count: orders.length,
      }, PB_REQ);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
    },
  });

  const closeShift = useCallback(
    async (shiftId: string, userId: string, closingCount: number) => {
      try {
        await closeShiftMutation.mutateAsync({ shiftId, userId, closingCount });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [closeShiftMutation]
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

        return {
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
      } catch (err) {
        console.error("Z-Report error:", err);
        return null;
      }
    },
    [pb]
  );

  const getReconciliation = useCallback(
    async (shiftId: string): Promise<{
      openingFloat: number;
      cashSales: number;
      cashRefunds: number;
      totalCashIn: number;
      totalCashOut: number;
    } | null> => {
      try {
        const shift = await pb.collection("shifts").getOne<Shift>(shiftId, PB_REQ);
        const orders = await pb.collection("orders").getFullList({
          filter: `created_at >= "${shift.opened_at}" && status = "CONFIRMED"`,
          requestKey: null,
        });

        let cashSales = 0;
        let cashRefunds = 0;
        for (const o of orders) {
          if (o.payment_method === "cash") cashSales += o.grand_total;
          if (o.refund_amount && o.payment_method === "cash") cashRefunds += o.refund_amount;
        }

        const adjustments = await pb.collection("cash_adjustments").getFullList<{ amount: number; type: string }>({
          filter: `shift = "${shiftId}"`,
          requestKey: null,
        }).catch(() => []);

        const totalCashIn = adjustments.filter((a) => a.type === "CASH_IN").reduce((s, a) => s + a.amount, 0);
        const totalCashOut = adjustments.filter((a) => a.type === "CASH_OUT").reduce((s, a) => s + a.amount, 0);

        return {
          openingFloat: shift.opening_float,
          cashSales,
          cashRefunds,
          totalCashIn,
          totalCashOut,
        };
      } catch {
        return null;
      }
    },
    [pb]
  );

  return {
    activeShift,
    shiftHistory,
    loading: isLoading,
    openShift,
    closeShift,
    getZReport,
    getReconciliation,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  };
}
