"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  User,
  Tag,
  CreditCard,
  Banknote,
  ArrowRight,
} from "lucide-react";
import type { CartItem, Customer } from "@/hooks/use-cart";

interface CartPanelProps {
  items: CartItem[];
  customer: Customer | null;
  subtotal: number;
  discountTotal: number;
  taxableSubtotal: number;
  gstTotal: number;
  grandTotal: number;
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
  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart
            {items.length > 0 && (
              <Badge variant="secondary">{items.length}</Badge>
            )}
          </h2>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Customer */}
        <button
          onClick={onSelectCustomer}
          className="mt-3 w-full flex items-center gap-2 p-2 rounded-md border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          {customer ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{customer.name}</p>
              {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Add customer (optional)</span>
          )}
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs">Tap products to add</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive shrink-0"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm font-semibold">Nu. {item.total.toFixed(2)}</p>
              </div>

              {isManager && (
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => {
                      const val = prompt("Discount per unit:", String(item.discount));
                      if (val !== null) onApplyDiscount(item.id, parseFloat(val) || 0);
                    }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Tag className="h-3 w-3 inline mr-0.5" />
                    Disc
                  </button>
                  <button
                    onClick={() => {
                      const val = prompt("New unit price:", String(item.unit_price));
                      if (val !== null) onOverridePrice(item.id, parseFloat(val) || 0);
                    }}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <CreditCard className="h-3 w-3 inline mr-0.5" />
                    Price
                  </button>
                </div>
              )}

              {item.discount > 0 && (
                <p className="text-xs text-emerald-500">
                  Discount: Nu. {item.discount.toFixed(2)} / unit
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>Nu. {subtotal.toFixed(2)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-sm text-emerald-500">
              <span>Discount</span>
              <span>-Nu. {discountTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Taxable</span>
            <span>Nu. {taxableSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST @ 5%</span>
            <span>Nu. {gstTotal.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
          </div>
          <Button
            className="w-full mt-2"
            size="lg"
            onClick={onCheckout}
            disabled={loading || items.length === 0}
          >
            <Banknote className="h-5 w-5 mr-2" />
            Checkout
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
