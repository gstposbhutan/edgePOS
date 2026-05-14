"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Numpad } from "@/components/ui/numpad";
import { DISCOUNT_TYPE } from "@/lib/constants";
import {
  Minus,
  Plus,
  Trash2,
  Tag,
  Percent,
  CreditCard,
  Hash,
} from "lucide-react";
import type { CartItem } from "@/hooks/use-cart";

interface CartItemRowProps {
  item: CartItem;
  isManager: boolean;
  onUpdateQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onApplyDiscount: (itemId: string, discount: number, discountType: string) => void;
  onOverridePrice: (itemId: string, price: number) => void;
}

export function CartItemRow({
  item,
  isManager,
  onUpdateQty,
  onRemove,
  onApplyDiscount,
  onOverridePrice,
}: CartItemRowProps) {
  const [editDiscount, setEditDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<string>(item.discount_type || DISCOUNT_TYPE.FLAT);
  const [editPrice, setEditPrice] = useState(false);
  const [editQty, setEditQty] = useState(false);
  const [qtyBuffer, setQtyBuffer] = useState("");

  const confirmQty = () => {
    const qty = parseInt(qtyBuffer) || 1;
    onUpdateQty(item.id, qty);
    setEditQty(false);
    setQtyBuffer("");
  };

  const applyDiscountValue = (val: number) => {
    onApplyDiscount(item.id, val, discountType);
    setEditDiscount(false);
  };

  const effectiveDiscount =
    discountType === DISCOUNT_TYPE.PERCENTAGE && item.discount > 0
      ? `${item.discount}%`
      : item.discount > 0
        ? `Nu.${item.discount.toFixed(2)}`
        : "";

  return (
    <div
      className="rounded-lg border border-border bg-background/50 p-3 space-y-2 hover:border-primary/30 transition-colors"
      style={{ borderLeftWidth: "3px", borderLeftColor: "var(--primary)" } as React.CSSProperties}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{item.name}</p>
          {item.sku && (
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.sku}</p>
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

      {/* Quantity */}
      {editQty ? (
        <div className="space-y-1">
          <div className="text-center">
            <span className="text-lg font-bold tabular-nums">{qtyBuffer || "1"}</span>
          </div>
          <Numpad
            value={qtyBuffer}
            onChange={setQtyBuffer}
            onConfirm={confirmQty}
            onCancel={() => { setEditQty(false); setQtyBuffer(""); }}
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
              onClick={() => { setEditQty(true); setQtyBuffer(""); }}
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

      {/* Discount & Price override */}
      {(item.discount > 0 || isManager) && (
        <div className="flex items-center gap-3 text-[11px] border-t border-border/50 pt-2">
          {editDiscount ? (
            <div className="flex items-center gap-1.5">
              <div className="flex bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setDiscountType(DISCOUNT_TYPE.FLAT)}
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                    discountType === DISCOUNT_TYPE.FLAT ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Tag className="h-3 w-3 inline mr-0.5" />
                  Nu.
                </button>
                <button
                  onClick={() => setDiscountType(DISCOUNT_TYPE.PERCENTAGE)}
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                    discountType === DISCOUNT_TYPE.PERCENTAGE ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  <Percent className="h-3 w-3 inline mr-0.5" />%
                </button>
              </div>
              <Input
                type="number"
                min={0}
                step={discountType === DISCOUNT_TYPE.PERCENTAGE ? 1 : 0.01}
                max={discountType === DISCOUNT_TYPE.PERCENTAGE ? 100 : undefined}
                defaultValue={item.discount || ""}
                className="h-7 w-20 text-xs"
                autoFocus
                placeholder={discountType === DISCOUNT_TYPE.PERCENTAGE ? "%" : "Nu."}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyDiscountValue(parseFloat((e.target as HTMLInputElement).value) || 0);
                  if (e.key === "Escape") setEditDiscount(false);
                }}
                onBlur={(e) => applyDiscountValue(parseFloat(e.target.value) || 0)}
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setDiscountType(item.discount_type || DISCOUNT_TYPE.FLAT);
                setEditDiscount(true);
              }}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary min-h-[2rem]"
            >
              {item.discount_type === DISCOUNT_TYPE.PERCENTAGE ? (
                <Percent className="h-3.5 w-3.5" />
              ) : (
                <Tag className="h-3.5 w-3.5" />
              )}
              {effectiveDiscount ? `Disc ${effectiveDiscount}` : "Disc"}
            </button>
          )}
          {editPrice ? (
            <Input
              type="number" min={0} step={0.01} defaultValue={item.unit_price}
              className="h-7 w-20 text-xs" autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") { onOverridePrice(item.id, parseFloat((e.target as HTMLInputElement).value) || 0); setEditPrice(false); }
                if (e.key === "Escape") setEditPrice(false);
              }}
              onBlur={(e) => { onOverridePrice(item.id, parseFloat(e.target.value) || 0); setEditPrice(false); }}
            />
          ) : (
            <button onClick={() => setEditPrice(true)} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary min-h-[2rem]">
              <CreditCard className="h-3.5 w-3.5" />
              Price
            </button>
          )}
        </div>
      )}
    </div>
  );
}
