"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  Smartphone,
  CreditCard,
  Landmark,
  AlertTriangle,
} from "lucide-react";
import type { Customer } from "@/hooks/use-cart";

export type PaymentMethod = "cash" | "mbob" | "mpay" | "credit" | "rtgs";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  grandTotal: number;
  customer: Customer | null;
  onConfirm: (method: PaymentMethod, ref: string, tendered?: number) => void;
}

const METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "cash", label: "Cash", icon: <Banknote className="h-5 w-5" /> },
  { id: "mbob", label: "mBoB", icon: <Smartphone className="h-5 w-5" /> },
  { id: "mpay", label: "mPay", icon: <Smartphone className="h-5 w-5" /> },
  { id: "rtgs", label: "RTGS", icon: <Landmark className="h-5 w-5" /> },
  { id: "credit", label: "Khata / Credit", icon: <CreditCard className="h-5 w-5" /> },
];

export function PaymentModal({ open, onClose, grandTotal, customer, onConfirm }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState<number>(grandTotal);
  const [error, setError] = useState("");

  const change = method === "cash" ? Math.max(0, tendered - grandTotal) : 0;

  const handleConfirm = () => {
    setError("");

    if (method === "credit") {
      if (!customer) {
        setError("Customer is required for credit payment");
        return;
      }
      if (customer.credit_balance + grandTotal > customer.credit_limit) {
        setError(
          `Credit limit exceeded. Outstanding: Nu. ${customer.credit_balance.toFixed(2)}, Limit: Nu. ${customer.credit_limit.toFixed(2)}`
        );
        return;
      }
    }

    if (method === "cash" && tendered < grandTotal) {
      setError("Tendered amount is less than total");
      return;
    }

    onConfirm(method, reference, method === "cash" ? tendered : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total */}
          <div className="text-center p-4 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-3xl font-bold text-primary">Nu. {grandTotal.toFixed(2)}</p>
          </div>

          {/* Method selection */}
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                  method === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {m.icon}
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Cash tendered */}
          {method === "cash" && (
            <div className="space-y-2">
              <Label>Tendered Amount</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={tendered}
                onChange={(e) => setTendered(parseFloat(e.target.value) || 0)}
              />
              {change > 0 && (
                <p className="text-sm text-emerald-500 font-medium">
                  Change: Nu. {change.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Reference for digital payments */}
          {method !== "cash" && (
            <div className="space-y-2">
              <Label>Reference / Journal No</Label>
              <Input
                placeholder={
                  method === "credit" ? "Optional note" : "Enter transaction reference"
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}

          {/* Credit warning */}
          {method === "credit" && customer && (
            <div className="p-3 rounded-md bg-warning/10 border border-warning/20 text-sm">
              <div className="flex items-center gap-2 text-warning mb-1">
                <CreditCard className="h-4 w-4" />
                <span className="font-medium">Credit Account</span>
              </div>
              <p>Customer: {customer.name}</p>
              <p>
                Limit: Nu. {customer.credit_limit.toFixed(2)} | Outstanding: Nu.{" "}
                {customer.credit_balance.toFixed(2)}
              </p>
              <p>
                After this: Nu. {(customer.credit_balance + grandTotal).toFixed(2)}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              Confirm Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
