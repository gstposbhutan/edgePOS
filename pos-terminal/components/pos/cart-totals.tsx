"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/gst";
import { Receipt, ArrowRight, ShieldX } from "lucide-react";

interface CartTotalsProps {
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  gstTotal: number;
  grandTotal: number;
  taxExempt: boolean;
  setTaxExempt: (v: boolean) => void;
  grandTotalExempt: number;
  loading: boolean;
  hasItems: boolean;
  onCheckout: () => void;
}

export function CartTotals({
  subtotal,
  discountTotal,
  taxableSubtotal,
  gstTotal,
  grandTotal,
  taxExempt,
  setTaxExempt,
  grandTotalExempt,
  loading,
  hasItems,
  onCheckout,
}: CartTotalsProps) {
  return (
    <div className="p-4 border-t border-border space-y-2 shrink-0">
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>Discount</span>
            <span className="tabular-nums">−{formatCurrency(discountTotal)}</span>
          </div>
        )}

        {/* GST Toggle */}
        <div className="flex items-center justify-between py-0.5">
          <button
            onClick={() => setTaxExempt(!taxExempt)}
            className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 transition-colors ${
              taxExempt
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldX className="h-3 w-3" />
            {taxExempt ? "GST Exempt" : "Tax Exempt?"}
          </button>
          {!taxExempt ? (
            <span className="text-muted-foreground tabular-nums">
              GST: {formatCurrency(gstTotal)}
            </span>
          ) : (
            <span className="text-destructive text-xs">No GST applied</span>
          )}
        </div>

        {!taxExempt && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Taxable</span>
            <span className="tabular-nums">{formatCurrency(taxableSubtotal)}</span>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-between items-end">
        <div>
          <span className="text-sm text-muted-foreground">Total</span>
          {taxExempt && <p className="text-[10px] text-destructive">Tax exempt</p>}
        </div>
        <span className="text-2xl font-bold text-primary tabular-nums">
          {taxExempt ? formatCurrency(grandTotalExempt) : formatCurrency(grandTotal)}
        </span>
      </div>

      <Button
        className={`w-full mt-2 h-12 text-base ${hasItems ? "animate-pulse-subtle" : ""}`}
        onClick={onCheckout}
        disabled={loading || !hasItems}
      >
        <Receipt className="h-5 w-5 mr-2" />
        Pay Nu. {(taxExempt ? grandTotalExempt : grandTotal).toFixed(0)}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
