"use client";

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { Trash2 } from "lucide-react";
import type { CartItem } from "@/hooks/use-cart";
import { baseUnitLabel, lineFactor } from "@/lib/units";
import type { Product } from "@/hooks/use-products";

/** Which cell the inline editor is sitting on. The spec's Enter cycle walks qty → unit →
 *  rate; the unit step is a modal the page owns, not an inline edit field. */
export type EditField = "qty" | "rate";

interface CartTableProps {
  items: CartItem[];
  /** Live products list — used to resolve each line's current_stock for the Stock column. */
  products: Product[];
  selectedRow: number;
  onSelectRow: (index: number) => void;
  onUpdateQty: (itemId: string, qty: number) => void;
  /** F5 / the Enter cycle's second step — set a per-line rate. */
  onOverridePrice?: (itemId: string, unitPrice: number) => void;
  onRemoveItem: (itemId: string) => void;
  /** Editing finished — the screen puts the caret back in the barcode row. */
  onEditEnd?: () => void;
  /**
   * Imperative handle the page keyboard handler calls to start inline editing on a row
   * (Enter / F9 for qty, F5 for rate). Set in an effect so we never mutate the ref
   * during render.
   */
  onEditRequest?: MutableRefObject<((index: number, field?: EditField) => void) | null>;
  /**
   * The Enter cycle's middle step (spec WF-05): open the Pcs/Pack/Case sheet for this row.
   * Returns whether it opened — false (no pack size configured, no line) falls straight through
   * to the rate step, so the cycle never stalls on an item with nothing to choose. The page
   * owns the sheet and resumes the cycle at rate when it closes.
   */
  onUnitStep?: (index: number) => boolean;
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
  onOverridePrice,
  onRemoveItem,
  onEditEnd,
  onEditRequest,
  onUnitStep,
  salespeopleById = {},
}: CartTableProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>("qty");
  const editInputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const startEdit = useCallback((index: number, field: EditField = "qty") => {
    if (itemsRef.current[index] == null) return;
    committedRef.current = false;
    setEditField(field);
    setEditingRow(index);
    setTimeout(() => editInputRef.current?.select(), 20);
  }, []);

  const commit = useCallback((index: number) => {
    const raw = editInputRef.current?.value ?? "";
    const item = itemsRef.current[index];
    if (!item) return;
    if (editField === "qty") {
      const qty = parseInt(raw, 10);
      if (!isNaN(qty) && qty > 0) onUpdateQty(item.id, qty);
    } else {
      const rate = parseFloat(raw);
      // A rate of 0 is a giveaway, which goes through Complimentary so it is logged — a
      // silent zero here would bypass that.
      if (!isNaN(rate) && rate > 0) onOverridePrice?.(item.id, rate);
    }
  }, [editField, onUpdateQty, onOverridePrice]);

  const confirmEdit = useCallback((index: number) => {
    if (committedRef.current) return;
    committedRef.current = true;
    commit(index);
    setEditingRow(null);
    onEditEnd?.();
  }, [commit, onEditEnd]);

  // Enter walks the line: qty, then unit, then rate, then back to the barcode row (WF-05).
  // The unit step is a modal, so we hand control to the page and it resumes at rate.
  const advanceEdit = useCallback((index: number) => {
    if (committedRef.current) return;
    committedRef.current = true;
    commit(index);
    if (editField === "qty") {
      if (onUnitStep?.(index)) { setEditingRow(null); return; }
      if (onOverridePrice) { startEdit(index, "rate"); return; }
    }
    setEditingRow(null);
    onEditEnd?.();
  }, [commit, editField, onOverridePrice, onUnitStep, startEdit, onEditEnd]);

  const cancelEdit = useCallback(() => {
    committedRef.current = true;
    setEditingRow(null);
    onEditEnd?.();
  }, [onEditEnd]);

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
    if (e.key === "Enter") advanceEdit(index);   // qty → rate → done
    if (e.key === "Tab") confirmEdit(index);     // commit and leave the line
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
          {/* Column order is the counter ticket (spec WF-01), so a cashier reads the line
              where they expect to. */}
          <tr className="text-xs text-muted-foreground">
            <th className="text-right px-3 py-2 w-12">Srl</th>
            <th className="text-left px-4 py-2">Product Name</th>
            <th className="text-left px-3 py-2 w-32">Product Code</th>
            <th className="text-right px-3 py-2 w-20">Stock</th>
            <th className="text-center px-2 py-2 w-20">Qty</th>
            <th className="text-center px-2 py-2 w-20">Unit</th>
            <th className="text-left px-3 py-2 w-32">Sale Tax Price Name</th>
            <th className="text-right px-4 py-2 w-32">Amount</th>
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
            // The unit this line is rung at (Alt+U). Falls back to the product's own unit for
            // lines written before the ladder existed, which are pieces by definition.
            const unit = item.unit_label || baseUnitLabel(item.expand?.product);
            const factor = lineFactor(item);
            const taxName = item.gst_exempt ? "Exempt" : "GST 5%";

            return (
              <tr
                key={item.id}
                onClick={() => { onSelectRow(i); if (isSelected) startEdit(i); }}
                className={`border-b border-border cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 font-medium" : "hover:bg-muted/20"
                }`}
              >
                <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">
                  {isSelected ? <span className="text-primary">►</span> : i + 1}
                </td>
                <td className="px-4 py-2.5">
                  <p className="truncate max-w-xs">{item.name}</p>
                  {item.salesperson_id && (
                    <p className="text-[10px] font-medium text-gold">
                      👤 {salespeopleById[item.salesperson_id] || "Salesperson"}
                    </p>
                  )}
                  {item.remark && (
                    <p className="text-[10px] italic text-muted-foreground truncate max-w-xs" title={item.remark}>
                      &#9998; {item.remark}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  {item.sku || "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold">
                  {stock != null ? stock : "—"}
                </td>
                <td className="px-2 py-2 text-center">
                  {isEditing && editField === "qty" ? (
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
                <td className="px-2 py-2.5 text-center text-xs text-muted-foreground">
                  {unit}
                  {factor > 1 && (
                    // A carton line and a piece line otherwise look identical at a glance, and
                    // the amount is the only tell. Say the factor out loud.
                    <span className="block text-[10px] text-primary tabular-nums">x {factor}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{taxName}</td>
                {/* Amount carries the rate underneath, and the pre-discount rate struck through
                    when a line discount applies — the spec has no separate Disc column. */}
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {isEditing && editField === "rate" ? (
                    <input
                      key={`rate-edit-${item.id}`}
                      ref={editInputRef}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={item.unit_price}
                      onKeyDown={(e) => handleEditKeyDown(e, i)}
                      onBlur={() => { if (!committedRef.current) confirmEdit(i); }}
                      className="w-24 px-1 py-0.5 text-sm text-right border border-primary rounded bg-background outline-none"
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="font-semibold text-primary">Nu. {item.total.toFixed(2)}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {item.discount > 0 && (
                          <span className="line-through mr-1">Nu. {item.unit_price.toFixed(2)}</span>
                        )}
                        <span className={item.discount > 0 ? "text-emerald-600 font-medium" : ""}>
                          @ Nu. {finalRate.toFixed(2)}
                        </span>
                      </span>
                    </>
                  )}
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
