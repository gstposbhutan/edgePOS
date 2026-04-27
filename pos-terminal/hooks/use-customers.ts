"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  credit_limit: number;
  credit_balance: number;
  created: string;
}

export function useCustomers() {
  const pb = getPB();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await pb.collection("customers").getFullList<Customer>({
        sort: "name",
        requestKey: null,
      });
      setCustomers(records);
    } catch (err) {
      console.error("Customers fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  useEffect(() => {
    fetchCustomers();

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchCustomers();
      }
    });

    return () => unsubscribeAuth();
  }, [fetchCustomers, pb]);

  const createCustomer = useCallback(
    async (data: Partial<Customer>) => {
      try {
        const record = await pb.collection("customers").create({
          credit_limit: 0,
          credit_balance: 0,
          ...data,
        }, { requestKey: null });
        await fetchCustomers();
        return { success: true, record: record as unknown as Customer };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchCustomers]
  );

  const updateCustomer = useCallback(
    async (id: string, data: Partial<Customer>) => {
      try {
        await pb.collection("customers").update(id, data, { requestKey: null });
        await fetchCustomers();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchCustomers]
  );

  const recordRepayment = useCallback(
    async (customerId: string, amount: number, method: string, notes?: string) => {
      try {
        // Fetch current balance atomically from PocketBase to avoid stale React state
        const record = await pb.collection("customers").getOne(customerId);
        const currentBalance = (record as Record<string, unknown>).credit_balance as number || 0;
        const newBalance = Math.max(0, currentBalance - amount);
        await pb.collection("customers").update(customerId, { credit_balance: newBalance });

        await pb.collection("khata_transactions").create({
          customer: customerId,
          type: "credit",
          amount,
          notes: notes || `Repayment via ${method}`,
        });

        await fetchCustomers();
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Repayment failed";
        return { success: false, error: msg };
      }
    },
    [pb, fetchCustomers]
  );

  return {
    customers,
    loading,
    createCustomer,
    updateCustomer,
    recordRepayment,
    refresh: fetchCustomers,
  };
}
