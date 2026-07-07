"use client";

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { Trash2 } from "lucide-react";
import type { CartItem } from "@/hooks/use-cart";
import type { Product } from "@/hooks/use-products";

interface CartTableProps {
  items: CartItem[];
  /** Live products list — used to resolve each line's current_stock for the Stock column. */
  products: Product[];
  selectedRow: number;
  onSelectRow: (index: number) => void;
  onUpdateQty: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  /**
   * Imperative handle the page keyboard handler calls to start inline qty editing
   * on a row (Enter / F9). Set in an effect so we never mutate the ref during render.
   */
  onEditRequest?: MutableRefObject<((index: number) => void) | null>;
  /** id → name for the sales team, to label each line's salesperson (per-line #3). */
  salespeopleById?: Record<string, string>;
}

/**
 * Full-width cart table for the keyboard (listing) POS layout. Row selection via ↑↓,
 * qty editing by pressing Enter / F9 on the selected row. Mirrors the web keyboard
 * cart-table but renders the desktop `CartItem` shape and resolves stock from the
 * shared products list (same source the qty-cap uses in use-cart).
 *
 * The edit input is uncontrolled (`defaultValue`) so a cart re-sync from PocketBase
 * can't clobber what the cashier is typing; commit reads the live DOM value when
 * Enter / Tab is pressed.
 */
export function CartTable({
  items,
  products,
  selectedRow,
  onSelectRow,
  onUpdateQty,
  onRemoveItem,
  onEditRequest,
  salespeopleById = {},
}: CartTableProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const startEdit = useCallback((index: number) => {
    if (itemsRef.current[index] == null) return;
    committedRef.current = false;
    setEditingRow(index);
    setTimeout(() => editInputRef.current?.select(), 20);
  }, []);

  const confirmEdit = useCallback((index: number) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const qty = parseInt(editInputRef.current?.value ?? "", 10);
    const item = itemsRef.current[index];
    if (item && !isNaN(qty) && qty > 0) {
      onUpdateQty(item.id, qty);
    }
    setEditingRow(null);
  }, [onUpdateQty]);

  const cancelEdit = useCallback(() => {
    committedRef.current = true;
    setEditingRow(null);
  }, []);

  // Expose the imperative edit-start handle. Done in an effect so we never mutate the
  // ref during render, which avoids React 19 Strict Mode issues.
  useEffect(() => {
    if (!onEditRequest) return;
    onEditRequest.current = startEdit;
    return () => { if (onEditRequest.current === startEdit) onEditRequest.current = null; };
  }, [onEditRequest, startEdit]);

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    // Stop the event reaching the page's document-level keydown listener, which would
    // otherwise re-trigger edit mode for Enter. React's synthetic stopPropagation alone
    // doesn't stop NATIVE document listeners — need stopImmediatePropagation on the
    // underlying nativeEvent.
    if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
    if (e.key === "Enter") confirmEdit(index);
    if (e.key === "Tab") confirmEdit(index);
    if (e.key === "Escape") cancelEdit();
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-sm">Cart is empty</p>
          <p className="text-xs">Press F3 or start typing to add products</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/40 border-b border-border z-10">
          <tr className="text-xs text-muted-foreground">
            <th className="text-left px-4 py-2 w-8">#</th>
            <th className="text-center px-2 py-2 w-20">Qty</th>
            <th className="text-left px-4 py-2">Product</th>
            <th className="text-right px-4 py-2 w-20">Stock</th>
            <th className="text-right px-4 py-2 w-28">Price</th>
            <th className="text-right px-4 py-2 w-24">Disc</th>
            <th className="text-right px-4 py-2 w-28">Total</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const isSelected = selectedRow === i;
            const isEditing = editingRow === i;
            const finalRate = Math.max(0, item.unit_price - item.discount); // post-discount unit price
            // Stock: prefer the live products list (kept fresh by the realtime sub),
            // fall back to the expanded product on the cart line; "—" when untracked.
            const liveStock = products.find((p) => p.id === item.product)?.current_stock;
            const stock = typeof liveStock === "number" ? liveStock : item.expand?.product?.current_stock;
            const subParts = [item.sku].filter(Boolean);

            return (
              <tr
                key={item.id}
                onClick={() => { onSelectRow(i); if (isSelected) startEdit(i); }}
                className={`border-b border-border cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 font-medium" : "hover:bg-muted/20"
                }`}
              >
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {isSelected ? <span className="text-primary">►</span> : i + 1}
                </td>
                <td className="px-2 py-2 text-center">
                  {isEditing ? (
                    <input
                      // Keyed so React re-mounts the input whenever editing moves to a
                      // different row, ensuring defaultValue reads fresh. Uncontrolled —
                      // the DOM owns the value during edit.
                      key={`qty-edit-${item.id}`}
                      ref={editInputRef}
                      type="number"
                      min="1"
                      defaultValue={item.quantity}
                      onKeyDown={(e) => handleEditKeyDown(e, i)}
                      onBlur={() => { if (!committedRef.current) confirmEdit(i); }}
                      className="w-16 px-1 py-0.5 text-sm text-center border border-primary rounded bg-background outline-none"
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`inline-block w-12 text-center px-2 py-0.5 rounded tabular-nums ${
                        isSelected ? "border border-primary/50 bg-background" : ""
                      }`}
                    >
                      {item.quantity}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <p className="truncate max-w-xs">{item.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                    {subParts.length ? subParts.join(" · ") : "—"}
                  </p>
                  {item.salesperson_id && (
                    <p className="text-[10px] font-medium text-gold">
                      👤 {salespeopleById[item.salesperson_id] || "Salesperson"}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-bold">
                  {stock != null ? stock : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={item.discount > 0 ? "line-through text-muted-foreground/60 text-xs" : ""}>
                    Nu. {item.unit_price.toFixed(2)}
                  </span>
                  {item.discount > 0 && (
                    <span className="block text-emerald-600 font-medium">→ Nu. {finalRate.toFixed(2)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {item.discount > 0 ? (
                    <span className="text-emerald-600 text-xs font-medium">Nu.{item.discount.toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                  Nu. {item.total.toFixed(2)}
                </td>
                <td className="px-2 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    tabIndex={-1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
