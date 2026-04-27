"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
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
  Receipt,
  ShieldX,
  Delete,
  Hash,
} from "lucide-react";
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
  onToggleFavorite?: (productId: string) => void;
  isFavorite?: (productId: string) => boolean;
}

const NUMPAD_KEYS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [null, 0, "backspace"],
];

function Numpad({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const handleKey = (key: number | string | null) => {
    if (key === null) return;
    if (key === "backspace") {
      onChange(value.slice(0, -1) || "");
    } else {
      const next = value + key;
      if (parseInt(next) <= 999) onChange(next);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {NUMPAD_KEYS.map((row, ri) =>
        row.map((key, ci) => (
          <button
            key={`${ri}-${ci}`}
            onClick={() => handleKey(key)}
            className={`h-10 rounded-md text-sm font-medium transition-colors active:scale-95 ${
              key === null
                ? ""
                : key === "backspace"
                ? "bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                : "bg-muted hover:bg-primary/20 hover:text-primary"
            }`}
          >
            {key === "backspace" ? <Delete className="h-4 w-4 mx-auto" /> : key}
          </button>
        ))
      )}
      <button
        onClick={onCancel}
        className="h-10 rounded-md text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95"
      >
        ✕
      </button>
      <button
        onClick={() => onChange("")}
        className="h-10 rounded-md text-sm font-medium bg-muted hover:bg-muted/80 text-muted-foreground active:scale-95"
      >
        C
      </button>
      <button
        onClick={onConfirm}
        className="h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
      >
        ✓
      </button>
    </div>
  );
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
  const [editDiscount, setEditDiscount] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string | null>(null);
  const [qtyBuffer, setQtyBuffer] = useState("");

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const confirmQty = (itemId: string) => {
    const qty = parseInt(qtyBuffer) || 1;
    onUpdateQty(itemId, qty);
    setEditQty(null);
    setQtyBuffer("");
  };

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
            <div
              key={item.id}
              className="rounded-lg border border-border bg-background/50 p-3 space-y-2 hover:border-primary/30 transition-colors"
              style={
                {
                  borderLeftWidth: "3px",
                  borderLeftColor: "var(--primary)",
                } as React.CSSProperties
              }
            >
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  {item.sku && (
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {item.sku}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Nu. {item.unit_price.toFixed(2)} / unit
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 ml-1"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Quantity: Numpad or +/- */}
              {editQty === item.id ? (
                <div className="space-y-1">
                  <div className="text-center">
                    <span className="text-lg font-bold tabular-nums">{qtyBuffer || "1"}</span>
                  </div>
                  <Numpad
                    value={qtyBuffer}
                    onChange={setQtyBuffer}
                    onConfirm={() => confirmQty(item.id)}
                    onCancel={() => {
                      setEditQty(null);
                      setQtyBuffer("");
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5 bg-muted rounded-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-r-none hover:bg-background"
                      onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <button
                      onClick={() => {
                        setEditQty(item.id);
                        setQtyBuffer("");
                      }}
                      className="w-10 h-9 text-center text-sm font-bold tabular-nums hover:bg-background flex items-center justify-center gap-0.5"
                    >
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      {item.quantity}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-l-none hover:bg-background"
                      onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold tabular-nums">Nu. {item.total.toFixed(2)}</p>
                </div>
              )}

              {/* Discount & Price */}
              {(item.discount > 0 || isManager) && (
                <div className="flex items-center gap-3 text-[11px] border-t border-border/50 pt-2">
                  {editDiscount === item.id ? (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={item.discount}
                      className="h-7 w-20 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onApplyDiscount(item.id, parseFloat((e.target as HTMLInputElement).value) || 0);
                          setEditDiscount(null);
                        }
                        if (e.key === "Escape") setEditDiscount(null);
                      }}
                      onBlur={(e) => {
                        onApplyDiscount(item.id, parseFloat(e.target.value) || 0);
                        setEditDiscount(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditDiscount(item.id)}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-primary min-h-[2rem]"
                    >
                      <Tag className="h-3.5 w-3.5" />
                      {item.discount > 0 ? `Disc Nu.${item.discount.toFixed(2)}` : "Disc"}
                    </button>
                  )}
                  {editPrice === item.id ? (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={item.unit_price}
                      className="h-7 w-20 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onOverridePrice(item.id, parseFloat((e.target as HTMLInputElement).value) || 0);
                          setEditPrice(null);
                        }
                        if (e.key === "Escape") setEditPrice(null);
                      }}
                      onBlur={(e) => {
                        onOverridePrice(item.id, parseFloat(e.target.value) || 0);
                        setEditPrice(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditPrice(item.id)}
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-primary min-h-[2rem]"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Price
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="p-4 border-t border-border space-y-2 shrink-0">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">Nu. {subtotal.toFixed(2)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>Discount</span>
                <span className="tabular-nums">−Nu. {discountTotal.toFixed(2)}</span>
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
                  GST @ 5%: Nu. {gstTotal.toFixed(2)}
                </span>
              ) : (
                <span className="text-destructive text-xs">No GST applied</span>
              )}
            </div>

            {!taxExempt && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Taxable</span>
                <span className="tabular-nums">Nu. {taxableSubtotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex justify-between items-end">
            <div>
              <span className="text-sm text-muted-foreground">Total</span>
              {taxExempt && (
                <p className="text-[10px] text-destructive">Tax exempt</p>
              )}
            </div>
            <span className="text-2xl font-bold text-primary tabular-nums">
              Nu. {taxExempt ? grandTotalExempt.toFixed(2) : grandTotal.toFixed(2)}
            </span>
          </div>

          <Button
            className={`w-full mt-2 h-12 text-base ${items.length > 0 ? "animate-pulse-subtle" : ""}`}
            onClick={onCheckout}
            disabled={loading || items.length === 0}
          >
            <Receipt className="h-5 w-5 mr-2" />
            Pay Nu. {taxExempt ? grandTotalExempt.toFixed(0) : grandTotal.toFixed(0)}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
