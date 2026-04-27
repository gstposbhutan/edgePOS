"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

export interface Customer {
  id: string;
  debtor_name: string;
  debtor_phone: string;
  credit_limit: number;
  outstanding_balance: number;
  created_at: string;
}

export function useCustomers() {
  const pb = getPB();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const REQ = { requestKey: null };

  const fetchCustomers = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const records = await pb.collection("khata_accounts").getFullList<Customer>({
        sort: "debtor_name",
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
        const record = await pb.collection("khata_accounts").create({
          credit_limit: 0,
          outstanding_balance: 0,
          ...data,
        }, REQ);
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
        await pb.collection("khata_accounts").update(id, data, REQ);
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
        const record = await pb.collection("khata_accounts").getOne(customerId, REQ);
        const currentBalance = (record as Record<string, unknown>).outstanding_balance as number || 0;
        const newBalance = Math.max(0, currentBalance - amount);
        await pb.collection("khata_accounts").update(customerId, { outstanding_balance: newBalance }, REQ);

        await pb.collection("khata_transactions").create({
          khata_account: customerId,
          transaction_type: "CREDIT",
          amount,
          notes: notes || `Repayment via ${method}`,
        }, REQ);

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
