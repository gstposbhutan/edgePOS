"use client";

import { useState, useEffect } from "react";
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
  Coins,
} from "lucide-react";
import type { Customer } from "@/hooks/use-customers";

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

const DENOMINATIONS = [10, 50, 100, 500, 1000];

export function PaymentModal({ open, onClose, grandTotal, customer, onConfirm }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState<number>(grandTotal);
  const [error, setError] = useState("");
  const [receivedParts, setReceivedParts] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setTendered(grandTotal);
      setReceivedParts([]);
      setError("");
      setReference("");
    }
  }, [open, grandTotal]);

  const totalReceived = receivedParts.reduce((a, b) => a + b, 0);
  const effectiveTendered = method === "cash" ? (receivedParts.length > 0 ? totalReceived : tendered) : 0;
  const change = method === "cash" ? Math.max(0, effectiveTendered - grandTotal) : 0;

  const addDenomination = (denom: number) => {
    setReceivedParts((prev) => [...prev, denom]);
    setTendered(0);
  };

  const clearReceived = () => {
    setReceivedParts([]);
    setTendered(grandTotal);
  };

  const setExact = () => {
    setReceivedParts([]);
    setTendered(grandTotal);
  };

  const roundUp = () => {
    const rounded = Math.ceil(grandTotal / 5) * 5;
    setReceivedParts([]);
    setTendered(rounded);
  };

  const handleConfirm = () => {
    setError("");

    if (method === "credit") {
      if (!customer) {
        setError("Customer is required for credit payment");
        return;
      }
      if (customer.outstanding_balance + grandTotal > customer.credit_limit) {
        setError(
          `Credit limit exceeded. Outstanding: Nu. ${customer.outstanding_balance.toFixed(2)}, Limit: Nu. ${customer.credit_limit.toFixed(2)}`
        );
        return;
      }
    }

    const finalTendered = method === "cash" ? effectiveTendered : 0;

    if (method === "cash" && finalTendered < grandTotal) {
      setError("Tendered amount is less than total");
      return;
    }

    onConfirm(method, reference, method === "cash" ? finalTendered : undefined);
  };

  const remaining = method === "cash" ? Math.max(0, grandTotal - effectiveTendered) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total */}
          <div className="text-center p-4 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-3xl font-bold text-primary tabular-nums">
              Nu. {grandTotal.toFixed(2)}
            </p>
          </div>

          {/* Method selection */}
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setError(""); }}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all min-h-[4rem] ${
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

          {/* Cash: Denomination Tiles */}
          {method === "cash" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Quick Amounts
                </Label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={setExact}>
                    Exact (E)
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={roundUp}>
                    Round (R)
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {DENOMINATIONS.map((denom) => (
                  <button
                    key={denom}
                    onClick={() => addDenomination(denom)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all min-h-[4rem] active:scale-95"
                  >
                    <Coins className="h-4 w-4 text-primary mb-0.5" />
                    <span className="text-sm font-bold tabular-nums">Nu.{denom}</span>
                  </button>
                ))}
              </div>

              {/* Received / Tendered summary */}
              {(receivedParts.length > 0 || tendered > 0) && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  {receivedParts.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {receivedParts.map((part, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            Nu.{part}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-medium tabular-nums">Nu. {totalReceived.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={clearReceived}
                        className="text-xs text-primary hover:underline"
                      >
                        Clear & enter manually
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs">Tendered Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tendered || ""}
                        onChange={(e) => setTendered(parseFloat(e.target.value) || 0)}
                        className="h-12 text-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Remaining / Change */}
              {remaining > 0 && (
                <p className="text-sm text-destructive font-medium text-center">
                  Remaining: Nu. {remaining.toFixed(2)}
                </p>
              )}
              {change > 0 && (
                <div className="text-center p-2 rounded-md bg-emerald-500/10">
                  <p className="text-sm text-emerald-400">Change Due</p>
                  <p className="text-xl font-bold text-emerald-400 tabular-nums">
                    Nu. {change.toFixed(2)}
                  </p>
                </div>
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
                className="h-11"
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
              <p>Customer: {customer.debtor_name}</p>
              <p>
                Limit: Nu. {customer.credit_limit.toFixed(2)} | Outstanding: Nu.{" "}
                {customer.outstanding_balance.toFixed(2)}
              </p>
              <p>
                After this: Nu. {(customer.outstanding_balance + grandTotal).toFixed(2)}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1 h-12 text-base" onClick={handleConfirm}>
              Confirm Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
