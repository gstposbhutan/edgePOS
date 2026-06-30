"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirms saving the cart as a DRAFT quotation (no payment, no stock move). */
export function QuotationConfirmModal({
  open,
  onClose,
  onConfirm,
  itemCount,
  grandTotal,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemCount: number;
  grandTotal: number;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as Quotation?</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p>
            {itemCount} item(s) — grand total{" "}
            <span className="font-semibold tabular-nums">Nu. {grandTotal.toFixed(2)}</span>.
          </p>
          <p className="text-muted-foreground">
            Saved as a DRAFT (SALES_ORDER) — no payment is taken and no stock is moved. Convert it to a sale later.
          </p>
        </div>
        <div className="flex gap-2 pt-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={saving || itemCount === 0}>
            {saving ? "Saving…" : "Save Quotation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
