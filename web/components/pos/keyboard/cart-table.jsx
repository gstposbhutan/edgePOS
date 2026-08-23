"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Trash2 } from "lucide-react"
import { baseUnitLabel, lineFactor } from "@/lib/pos/units"

/**
 * The ticket, in the RanceLab column order (spec WF-01) — Srl, Product Name, Product Code,
 * Stock, Qty, Unit, Sale Tax Price Name, Amount — so a cashier trained on RanceLab reads each
 * line where they expect to. The mirror of desktop/components/pos/keyboard/cart-table.tsx;
 * keep the two in step.
 *
 * Row selection via ↑↓. Enter on the selected row walks the line: qty → unit → rate → back to
 * the barcode row. The unit step is a modal the page owns, so this hands control over and the
 * page resumes the cycle at rate when the sheet closes.
 *
 * The edit input is uncontrolled (`defaultValue`) so a cart re-sync from the server can't
 * clobber what the cashier is typing; commit reads the live DOM value when Enter / Tab is hit.
 */
export function CartTable({
  items,
  onUpdateQty,
  onOverridePrice,
  onRemoveItem,
  onChangeBatch,
  selectedRow,
  onSelectRow,
  onEditRequest,
  onEditEnd,
  onUnitStep,
  salespeopleById = {},
}) {
  const [editingRow, setEditingRow] = useState(null)
  const [editField,  setEditField]  = useState('qty')
  const editInputRef = useRef(null)
  const committedRef = useRef(false)
  const itemsRef     = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const startEdit = useCallback((index, field = 'qty') => {
    if (itemsRef.current[index] == null) return
    committedRef.current = false
    setEditField(field)
    setEditingRow(index)
    setTimeout(() => editInputRef.current?.select(), 20)
  }, [])

  const commit = useCallback((index) => {
    const raw  = editInputRef.current?.value ?? ''
    const item = itemsRef.current[index]
    if (!item) return
    if (editField === 'qty') {
      const qty = parseFloat(raw)
      if (!isNaN(qty) && qty > 0) onUpdateQty(item.id, qty)
    } else {
      const rate = parseFloat(raw)
      // A rate of 0 is a giveaway, which goes through Complimentary so it is logged — a silent
      // zero here would bypass that.
      if (!isNaN(rate) && rate > 0) onOverridePrice?.(item.id, rate)
    }
  }, [editField, onUpdateQty, onOverridePrice])

  const confirmEdit = useCallback((index) => {
    if (committedRef.current) return
    committedRef.current = true
    commit(index)
    setEditingRow(null)
    onEditEnd?.()
  }, [commit, onEditEnd])

  // Enter walks the line: qty, then unit, then rate, then back to the barcode row (WF-05).
  const advanceEdit = useCallback((index) => {
    if (committedRef.current) return
    committedRef.current = true
    commit(index)
    if (editField === 'qty') {
      // The sheet only opens for an item that actually has levels to choose; false falls
      // straight through to rate so the cycle never stalls on a piece-only item.
      if (onUnitStep?.(index)) { setEditingRow(null); return }
      if (onOverridePrice) { startEdit(index, 'rate'); return }
    }
    setEditingRow(null)
    onEditEnd?.()
  }, [commit, editField, onOverridePrice, onUnitStep, startEdit, onEditEnd])

  const cancelEdit = useCallback(() => {
    committedRef.current = true
    setEditingRow(null)
    onEditEnd?.()
  }, [onEditEnd])

  // Expose the imperative edit-start handle. Done in an effect so we never mutate the ref
  // during render, which avoids React 19 Strict Mode issues.
  useEffect(() => {
    if (!onEditRequest) return
    onEditRequest.current = startEdit
    return () => { if (onEditRequest.current === startEdit) onEditRequest.current = null }
  }, [onEditRequest, startEdit])

  function handleEditKeyDown(e, index) {
    // Stop the event reaching the page's document-level keydown listener, which would otherwise
    // re-trigger edit mode for Enter (or switch cart for Tab). React's synthetic
    // stopPropagation alone doesn't stop NATIVE document listeners — need
    // stopImmediatePropagation on the underlying nativeEvent.
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
    }
    if (e.key === 'Enter')  advanceEdit(index)   // qty → unit → rate → done
    if (e.key === 'Tab')    confirmEdit(index)   // commit and leave the line
    if (e.key === 'Escape') cancelEdit()
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-sm">Cart is empty</p>
          <p className="text-xs">Scan a barcode or start typing to add products</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/40 border-b border-border z-10">
          <tr className="text-xs text-muted-foreground">
            <th className="text-right px-3 py-2 w-12">Srl</th>
            <th className="text-left  px-4 py-2">Product Name</th>
            <th className="text-left  px-3 py-2 w-32">Product Code</th>
            <th className="text-right px-3 py-2 w-20">Stock</th>
            <th className="text-center px-2 py-2 w-20">Qty</th>
            <th className="text-center px-2 py-2 w-20">Unit</th>
            <th className="text-left  px-3 py-2 w-32">Sale Tax Price Name</th>
            <th className="text-right px-4 py-2 w-32">Amount</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const isSelected = selectedRow === i
            const isEditing  = editingRow  === i
            const unitPrice  = parseFloat(item.unit_price)
            const discount   = parseFloat(item.discount ?? 0)
            const finalRate  = Math.max(0, unitPrice - discount)   // post-discount unit price
            const total      = parseFloat(item.total ?? (finalRate * item.quantity * 1.05))

            // Stock is held in PIECES; a line rung in cartons says how many cartons that covers.
            const pieceStock = item.available_stock != null
              ? item.available_stock
              : (item.batch?.available_qty != null ? item.batch.available_qty : item.product?.current_stock)
            const factor = lineFactor(item)
            const stock  = typeof pieceStock === 'number' ? Math.floor(pieceStock / factor) : null
            // The unit this line is rung at (Alt+U). Falls back to the product's own unit for
            // lines written before the ladder existed, which are pieces by definition.
            const unit    = item.unit_label || baseUnitLabel(item.product)
            const taxName = item.product?.gst_exempt ? 'Exempt' : 'GST 5%'

            // Under the product name: batch no (trailing 10) and expiry, where the line has one.
            const batchNumber = item.batch?.batch_number ?? item.batch_number
            const batchTrailing = batchNumber
              ? (batchNumber.length > 10 ? '…' + batchNumber.slice(-10) : batchNumber)
              : null
            const expiresAt = item.batch?.expires_at ?? item.expires_at
            const subParts = [
              batchTrailing,
              expiresAt ? `exp ${new Date(expiresAt).toLocaleDateString()}` : null,
            ].filter(Boolean)

            return (
              <tr
                key={item.id}
                onClick={() => { onSelectRow(i); if (isSelected) startEdit(i) }}
                className={`border-b border-border cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/20'
                }`}
              >
                <td className="px-3 py-2.5 text-right text-muted-foreground text-xs">
                  {isSelected ? <span className="text-primary">►</span> : i + 1}
                </td>
                <td className="px-4 py-2.5">
                  <p className="truncate max-w-xs">{item.name}</p>
                  {subParts.length > 0 && (
                    <p className="text-[10px] font-mono text-muted-foreground">{subParts.join(' · ')}</p>
                  )}
                  {item.batch_id && onChangeBatch && (
                    <button
                      onClick={e => { e.stopPropagation(); onChangeBatch(item) }}
                      className="text-[10px] text-primary hover:underline"
                    >
                      ⇄ change batch
                    </button>
                  )}
                  {item.salesperson_id && (
                    <p className="text-[10px] font-medium text-gold">
                      👤 {salespeopleById[item.salesperson_id] || 'Salesperson'}
                    </p>
                  )}
                  {item.remark && (
                    <p className="text-[10px] italic text-muted-foreground truncate max-w-xs" title={item.remark}>
                      ✎ {item.remark}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  {item.sku || '—'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold">
                  {stock != null ? stock : '—'}
                </td>
                <td className="px-2 py-2 text-center">
                  {isEditing && editField === 'qty' ? (
                    <input
                      // Keyed so React re-mounts the input whenever editing moves to a different
                      // row, ensuring defaultValue reads fresh. Uncontrolled — the DOM owns the
                      // value during the edit.
                      key={`qty-edit-${item.id}`}
                      ref={editInputRef}
                      type="number"
                      min="1"
                      defaultValue={item.quantity}
                      onKeyDown={e => handleEditKeyDown(e, i)}
                      onBlur={() => { if (!committedRef.current) confirmEdit(i) }}
                      className="w-16 px-1 py-0.5 text-sm text-center border border-primary rounded bg-background outline-none"
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`inline-block w-12 text-center px-2 py-0.5 rounded tabular-nums ${
                        isSelected ? 'border border-primary/50 bg-background' : ''
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
                  {isEditing && editField === 'rate' ? (
                    <input
                      key={`rate-edit-${item.id}`}
                      ref={editInputRef}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={unitPrice}
                      onKeyDown={e => handleEditKeyDown(e, i)}
                      onBlur={() => { if (!committedRef.current) confirmEdit(i) }}
                      className="w-24 px-1 py-0.5 text-sm text-right border border-primary rounded bg-background outline-none"
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="font-semibold text-primary">Nu. {total.toFixed(2)}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {discount > 0 && (
                          <span className="line-through mr-1">Nu. {unitPrice.toFixed(2)}</span>
                        )}
                        <span className={discount > 0 ? 'text-emerald-600 font-medium' : ''}>
                          @ Nu. {finalRate.toFixed(2)}
                        </span>
                      </span>
                    </>
                  )}
                </td>
                <td className="px-2 py-2">
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveItem(item.id) }}
                    className="text-muted-foreground hover:text-tibetan transition-colors"
                    tabIndex={-1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
