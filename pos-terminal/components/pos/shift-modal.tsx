"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DoorOpen, DoorClosed, AlertTriangle } from "lucide-react";

interface ShiftModalProps {
  open: boolean;
  onClose: () => void;
  mode: "open" | "close";
  onConfirm: (amount: number) => Promise<{ success: boolean; error?: string }>;
}

export function ShiftModal({ open, onClose, mode, onConfirm }: ShiftModalProps) {
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
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
              : "Count the cash in the drawer and enter the total (blind close)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-amount">
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
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleConfirm} disabled={submitting || !amount}>
              {submitting ? "Processing..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
