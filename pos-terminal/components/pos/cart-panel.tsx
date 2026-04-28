"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  ShoppingCart,
  User,
  X,
} from "lucide-react";
import { CartItemRow } from "./cart-item-row";
import { CartTotals } from "./cart-totals";
import { useCart } from "@/hooks/use-cart";
import type { CartItem } from "@/hooks/use-cart";
import type { Customer } from "@/hooks/use-customers";

interface CartPanelProps {
  customer: Customer | null;
  isManager: boolean;
  onCheckout: () => void;
  onSelectCustomer: () => void;
  onClearCustomer?: () => void;
  noShift?: boolean;
}

export function CartPanel({
  customer,
  isManager,
  onCheckout,
  onSelectCustomer,
  onClearCustomer,
  noShift = false,
}: CartPanelProps) {
  const { items, loading, subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal, taxExempt, setTaxExempt, grandTotalExempt, updateQty, removeItem, applyDiscount, overridePrice, clearCart } = useCart();
  const totalItems = items.reduce((sum: number, i: CartItem) => sum + i.quantity, 0);

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
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Customer */}
        <Button
          variant="outline"
          onClick={onSelectCustomer}
          className="mt-3 w-full justify-start gap-2 p-2.5 h-auto rounded-lg border-dashed min-h-[3rem] hover:border-primary hover:bg-primary/5 group"
        >
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10">
            <User className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </div>
          {customer ? (
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium truncate">{customer.debtor_name}</p>
                {customer.debtor_phone && (
                  <p className="text-xs text-muted-foreground">{customer.debtor_phone}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => { e.stopPropagation(); onClearCustomer?.(); }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Walk-in Customer</span>
          )}
        </Button>
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
              onUpdateQty={updateQty}
              onRemove={removeItem}
              onApplyDiscount={applyDiscount}
              onOverridePrice={overridePrice}
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
          noShift={noShift}
        />
      )}
    </div>
  );
}
