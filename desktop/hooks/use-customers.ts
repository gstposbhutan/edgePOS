"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { KHATA_TXN, KHATA_STATUS } from "@/lib/constants";

export interface Customer {
  id: string;
  debtor_name: string;
  debtor_phone: string;
  credit_limit: number;
  outstanding_balance: number;
  status?: string;
  created_at: string;
}

async function fetchCustomers(): Promise<Customer[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  return pb.collection("khata_accounts").getFullList<Customer>({
    sort: "debtor_name",
    requestKey: null,
  });
}

export function useCustomers() {
  const pb = getPB();
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Customer>) => {
      return pb.collection("khata_accounts").create({
        credit_limit: 0,
        outstanding_balance: 0,
        ...data,
      }, PB_REQ) as unknown as Customer;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const createCustomer = useCallback(
    async (data: Partial<Customer>) => {
      try {
        const record = await createMutation.mutateAsync(data);
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [createMutation]
  );

  const updateCustomer = useCallback(
    async (id: string, data: Partial<Customer>) => {
      try {
        await pb.collection("khata_accounts").update(id, data, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, queryClient]
  );

  const recordRepayment = useCallback(
    async (customerId: string, amount: number, method: string, notes?: string) => {
      try {
        const record = await pb.collection("khata_accounts").getOne(customerId, PB_REQ);
        const currentBalance = (record as Record<string, unknown>).outstanding_balance as number || 0;
        const newBalance = Math.max(0, currentBalance - amount);
        await pb.collection("khata_accounts").update(customerId, { outstanding_balance: newBalance }, PB_REQ);
        await pb.collection("khata_transactions").create({
          khata_account: customerId,
          transaction_type: "CREDIT",
          amount,
          notes: notes || `Repayment via ${method}`,
        }, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Repayment failed";
        return { success: false, error: msg };
      }
    },
    [pb, queryClient]
  );

  // Manual balance correction (opening balance, write-off, dispute). Positive
  // increases what the customer owes, negative decreases it. Logs an ADJUSTMENT
  // ledger row.
  const adjustBalance = useCallback(
    async (customerId: string, amount: number, reason: string) => {
      try {
        const record = await pb.collection("khata_accounts").getOne(customerId, PB_REQ);
        const currentBalance = (record as Record<string, unknown>).outstanding_balance as number || 0;
        const newBalance = Math.max(0, currentBalance + amount);
        await pb.collection("khata_accounts").update(customerId, { outstanding_balance: newBalance }, PB_REQ);
        await pb.collection("khata_transactions").create({
          khata_account: customerId,
          transaction_type: KHATA_TXN.ADJUSTMENT,
          amount,
          notes: reason || "Manual balance adjustment",
        }, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        return { success: true, balance: newBalance };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Adjustment failed";
        return { success: false, error: msg };
      }
    },
    [pb, queryClient]
  );

  // Freeze / unfreeze. Frozen accounts are blocked from new credit sales at
  // checkout (see use-checkout).
  const setAccountStatus = useCallback(
    async (customerId: string, status: string) => {
      try {
        await pb.collection("khata_accounts").update(customerId, { status }, PB_REQ);
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Status update failed";
        return { success: false, error: msg };
      }
    },
    [pb, queryClient]
  );

  const toggleFreeze = useCallback(
    (customer: Customer) =>
      setAccountStatus(
        customer.id,
        customer.status === KHATA_STATUS.FROZEN ? KHATA_STATUS.ACTIVE : KHATA_STATUS.FROZEN
      ),
    [setAccountStatus]
  );

  return {
    customers,
    loading: isLoading,
    createCustomer,
    updateCustomer,
    recordRepayment,
    adjustBalance,
    setAccountStatus,
    toggleFreeze,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  };
}
