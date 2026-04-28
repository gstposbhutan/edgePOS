"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DoorOpen, DoorClosed, AlertTriangle, Calculator } from "lucide-react";
import { formatCurrency } from "@/lib/gst";

export interface ShiftReconciliation {
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  totalCashIn: number;
  totalCashOut: number;
}

interface ShiftModalProps {
  open: boolean;
  onClose: () => void;
  mode: "open" | "close";
  onConfirm: (amount: number) => Promise<{ success: boolean; error?: string }>;
  reconciliation?: ShiftReconciliation;
}

export function ShiftModal({ open, onClose, mode, onConfirm, reconciliation }: ShiftModalProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setError("");
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      setError("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onConfirm(parsed);
      if (result.success) {
        setAmount("");
        onClose();
      } else {
        setError(result.error || "Operation failed");
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  const expectedTotal = reconciliation
    ? reconciliation.openingFloat + reconciliation.cashSales - reconciliation.cashRefunds
      + reconciliation.totalCashIn - reconciliation.totalCashOut
    : 0;

  const countedAmount = parseFloat(amount) || 0;
  const discrepancy = countedAmount - expectedTotal;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "open" ? (
              <><DoorOpen className="h-5 w-5" /> Open Shift</>
            ) : (
              <><DoorClosed className="h-5 w-5" /> Close Shift</>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "open"
              ? "Enter the opening cash float for this shift."
              : "Review the shift summary and enter the counted cash."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reconciliation Breakdown */}
          {mode === "close" && reconciliation && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Shift Summary
                </span>
              </div>

              <Row label="Opening Float" value={reconciliation.openingFloat} />
              <Row label="Cash Sales" value={reconciliation.cashSales} positive />
              <Row label="Cash Refunds" value={reconciliation.cashRefunds} negative />
              {reconciliation.totalCashIn > 0 && (
                <Row label="Cash In" value={reconciliation.totalCashIn} positive />
              )}
              {reconciliation.totalCashOut > 0 && (
                <Row label="Cash Out" value={reconciliation.totalCashOut} negative />
              )}

              <Separator className="my-1" />

              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Expected Total</span>
                <span className="text-lg font-bold text-primary tabular-nums">
                  {formatCurrency(expectedTotal)}
                </span>
              </div>
            </div>
          )}

          {/* Cash Count Input */}
          <div className="space-y-2">
            <Label htmlFor="shift-amount" className="text-sm">
              {mode === "open" ? "Opening Float (Nu.)" : "Cash Count (Nu.)"}
            </Label>
            <Input
              id="shift-amount"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
              className="h-12 text-lg text-center"
              autoFocus
            />
          </div>

          {/* Discrepancy Preview */}
          {mode === "close" && amount && reconciliation && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              discrepancy === 0
                ? "bg-emerald-500/10 text-emerald-500"
                : discrepancy > 0
                ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive"
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Discrepancy: <strong>{formatCurrency(Math.abs(discrepancy))}</strong>
                {discrepancy === 0
                  ? " (Balanced)"
                  : discrepancy > 0
                  ? " over"
                  : " short"}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1 h-11" onClick={handleConfirm} disabled={submitting || !amount}>
              {submitting ? "Processing..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, positive, negative }: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}) {
  const cls = positive ? "text-emerald-500" : negative ? "text-destructive" : "";
  const prefix = positive ? "+ " : negative ? "- " : "";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${cls}`}>
        {prefix}{formatCurrency(value)}
      </span>
    </div>
  );
}
