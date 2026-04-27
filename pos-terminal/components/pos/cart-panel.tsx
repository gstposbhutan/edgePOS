"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  ShoppingCart,
  User,
} from "lucide-react";
import { CartItemRow } from "./cart-item-row";
import { CartTotals } from "./cart-totals";
import type { CartItem } from "@/hooks/use-cart";
import type { Customer } from "@/hooks/use-customers";

interface CartPanelProps {
  items: CartItem[];
  customer: Customer | null;
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  gstTotal: number;
  grandTotal: number;
  taxExempt: boolean;
  setTaxExempt: (v: boolean) => void;
  grandTotalExempt: number;
  loading: boolean;
  isManager: boolean;
  onUpdateQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onApplyDiscount: (itemId: string, discount: number) => void;
  onOverridePrice: (itemId: string, price: number) => void;
  onClear: () => void;
  onCheckout: () => void;
  onSelectCustomer: () => void;
}

export function CartPanel({
  items,
  customer,
  subtotal,
  discountTotal,
  taxableSubtotal,
  gstTotal,
  grandTotal,
  taxExempt,
  setTaxExempt,
  grandTotalExempt,
  loading,
  isManager,
  onUpdateQty,
  onRemove,
  onApplyDiscount,
  onOverridePrice,
  onClear,
  onCheckout,
  onSelectCustomer,
}: CartPanelProps) {
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Cart
            {items.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {items.length} · {totalItems}
              </Badge>
            )}
          </h2>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Customer */}
        <button
          onClick={onSelectCustomer}
          className="mt-3 w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all text-left group min-h-[3rem]"
        >
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
            <User className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </div>
          {customer ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{customer.debtor_name}</p>
              {customer.debtor_phone && (
                <p className="text-xs text-muted-foreground">{customer.debtor_phone}</p>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Walk-in Customer</span>
          )}
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
              <ShoppingCart className="h-8 w-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs mt-1">Tap products to add</p>
          </div>
        ) : (
          items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              isManager={isManager}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
              onApplyDiscount={onApplyDiscount}
              onOverridePrice={onOverridePrice}
            />
          ))
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <CartTotals
          subtotal={subtotal}
          discountTotal={discountTotal}
          taxableSubtotal={taxableSubtotal}
          gstTotal={gstTotal}
          grandTotal={grandTotal}
          taxExempt={taxExempt}
          setTaxExempt={setTaxExempt}
          grandTotalExempt={grandTotalExempt}
          loading={loading}
          hasItems={items.length > 0}
          onCheckout={onCheckout}
        />
      )}
    </div>
  );
}
