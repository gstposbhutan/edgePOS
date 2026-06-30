"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Manager-gated 100% discount applied to every cart line (GST zeroes on 0). */
export function ComplimentaryConfirmModal({
  open,
  onClose,
  onConfirm,
  itemCount,
  grandTotal,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  itemCount: number;
  grandTotal: number;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Complimentary Sale?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>Apply a 100% discount to all {itemCount} line(s). The bill and GST will zero out.</p>
          <div className="space-y-1">
            <Label className="text-sm">Reason (optional)</Label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. sample, damaged, staff"
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
          </div>
          <p className="text-muted-foreground">Current total: Nu. {grandTotal.toFixed(2)}.</p>
        </div>
        <div className="flex gap-2 pt-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => onConfirm(reason.trim())}>
            Apply 100% Discount
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
