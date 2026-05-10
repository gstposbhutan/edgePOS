"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";

export interface Customer {
  id: string;
  debtor_name: string;
  debtor_phone: string;
  credit_limit: number;
  outstanding_balance: number;
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

  return {
    customers,
    loading: isLoading,
    createCustomer,
    updateCustomer,
    recordRepayment,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  };
}
