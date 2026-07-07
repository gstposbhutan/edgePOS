"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Save the cart as a DRAFT sell-side document (no payment, no stock move): a committed
 * Sales Order or a non-binding Quotation. Both are SALES_ORDER/DRAFT; the flag distinguishes.
 */
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
  onConfirm: (isQuotation: boolean) => void;
  itemCount: number;
  grandTotal: number;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as draft</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p>
            {itemCount} item(s) — total{" "}
            <span className="font-semibold tabular-nums">Nu. {grandTotal.toFixed(2)}</span>.
          </p>
          <p className="text-muted-foreground">
            Saved as a DRAFT — no payment is taken and no stock is moved. Fulfil it into a sale later.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-3">
          <Button variant="outline" onClick={() => onConfirm(true)} disabled={saving || itemCount === 0}>
            {saving ? "…" : "Quotation"}
          </Button>
          <Button onClick={() => onConfirm(false)} disabled={saving || itemCount === 0}>
            {saving ? "…" : "Sales Order"}
          </Button>
        </div>
        <div className="pt-1">
          <Button variant="ghost" className="w-full" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
