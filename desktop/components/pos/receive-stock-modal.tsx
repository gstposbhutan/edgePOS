"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PackagePlus } from "lucide-react";
import type { Product } from "@/hooks/use-products";

interface ReceiveStockModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onReceive: (
    productId: string,
    quantity: number,
    opts: { unitCost?: number; supplierRef?: string; notes?: string; updateCost?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
}

export function ReceiveStockModal({ open, onClose, product, onReceive }: ReceiveStockModalProps) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [notes, setNotes] = useState("");
  const [updateCost, setUpdateCost] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && product) {
      setQuantity("");
      setUnitCost(product.cost_price ? String(product.cost_price) : "");
      setSupplierRef("");
      setNotes("");
      setUpdateCost(false);
      setError("");
    }
  }, [open, product]);

  if (!product) return null;

  const qty = parseFloat(quantity) || 0;
  const cost = parseFloat(unitCost) || 0;
  const newStock = (product.current_stock || 0) + qty;

  const handleSubmit = async () => {
    setError("");
    if (qty <= 0) {
      setError("Enter a quantity greater than zero");
      return;
    }
    setSaving(true);
    const result = await onReceive(product.id, qty, {
      unitCost: cost,
      supplierRef: supplierRef.trim(),
      notes: notes.trim(),
      updateCost,
    });
    setSaving(false);
    if (result.success) {
      onClose();
    } else {
      setError(result.error || "Failed to receive stock");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Receive Stock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">
              Current stock: <span className="tabular-nums">{product.current_stock || 0}</span> {product.unit || "units"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="h-11"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost (Nu.)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Supplier / PO Reference</Label>
            <Input
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder="Invoice or PO number"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="h-11"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={updateCost}
              onChange={(e) => setUpdateCost(e.target.checked)}
              className="h-4 w-4"
            />
            Update product cost price to Nu. {cost.toFixed(2)}
          </label>

          {qty > 0 && (
            <div className="text-sm text-center p-2 rounded-md bg-emerald-500/10 text-emerald-400">
              New stock: <span className="font-bold tabular-nums">{newStock}</span> {product.unit || "units"}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-11" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 h-11" onClick={handleSubmit} disabled={saving || qty <= 0}>
              {saving ? "Receiving..." : "Receive Stock"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
