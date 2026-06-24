"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Trash2 } from "lucide-react"

/**
 * Full-width cart table for keyboard POS.
 * Row selection via ↑↓. Qty editing by pressing Enter on selected row.
 *
 * Edit input uses `defaultValue` (uncontrolled) so cart re-syncs from the
 * server can't clobber what the cashier is typing. Commit reads the current
 * DOM value at the moment Enter / Tab is pressed.
 */
export function CartTable({ items, onUpdateQty, onRemoveItem, selectedRow, onSelectRow, onEditRequest }) {
  const [editingRow, setEditingRow]   = useState(null)
  const editInputRef                  = useRef(null)
  const committedRef                  = useRef(false)
  const itemsRef                      = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const startEdit = useCallback((index) => {
    if (itemsRef.current[index] == null) return
    committedRef.current = false
    setEditingRow(index)
    setTimeout(() => editInputRef.current?.select(), 20)
  }, [])

  const confirmEdit = useCallback((index) => {
    if (committedRef.current) return
    committedRef.current = true
    const qty = parseInt(editInputRef.current?.value, 10)
    const item = itemsRef.current[index]
    if (item && !isNaN(qty) && qty > 0) {
      onUpdateQty(item.id, qty)
    }
    setEditingRow(null)
  }, [onUpdateQty])

  const cancelEdit = useCallback(() => {
    committedRef.current = true
    setEditingRow(null)
  }, [])

  // Expose the imperative edit-start handle. Done in an effect so we never
  // mutate the ref during render, which avoids React 19 Strict Mode issues.
  useEffect(() => {
    if (!onEditRequest) return
    onEditRequest.current = startEdit
    return () => { if (onEditRequest.current === startEdit) onEditRequest.current = null }
  }, [onEditRequest, startEdit])

  function handleEditKeyDown(e, index) {
    // Stop the event reaching the parent's document-level keydown listener
    // (app/pos/page.jsx), which would otherwise re-trigger edit mode for
    // Enter (or switch cart for Tab). React synthetic stopPropagation alone
    // doesn't stop NATIVE document listeners — need stopImmediatePropagation
    // on the underlying nativeEvent.
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
    }
    if (e.key === 'Enter') confirmEdit(index)
    if (e.key === 'Tab')   confirmEdit(index)
    if (e.key === 'Escape') cancelEdit()
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-sm">Cart is empty</p>
          <p className="text-xs">Press F3 or start typing to add products</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/40 border-b border-border">
          <tr className="text-xs text-muted-foreground">
            <th className="text-left px-4 py-2 w-8">#</th>
            <th className="text-center px-2 py-2 w-20">Qty</th>
            <th className="text-left px-4 py-2">Product</th>
            <th className="text-left px-4 py-2 w-32">Batch</th>
            <th className="text-right px-4 py-2 w-20">Stock</th>
            <th className="text-right px-4 py-2 w-28">Unit Price</th>
            <th className="text-right px-4 py-2 w-24">Discount</th>
            <th className="text-right px-4 py-2 w-28">Total</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const isSelected = selectedRow === i
            const isEditing  = editingRow  === i
            const unitPrice = parseFloat(item.unit_price)
            const discount  = parseFloat(item.discount ?? 0)
            const finalRate = Math.max(0, unitPrice - discount)             // post-discount unit price (Final Rate)
            const total     = parseFloat(item.total ?? (finalRate * item.quantity * 1.05))

            return (
              <tr
                key={item.id}
                onClick={() => { onSelectRow(i); if (isSelected) startEdit(i) }}
                className={`border-b border-border cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/20'
                }`}
              >
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {isSelected ? <span className="text-primary">►</span> : i + 1}
                </td>
                <td className="px-2 py-2 text-center">
                  {isEditing ? (
                    <input
                      // Keyed so React re-mounts the input whenever editing
                      // moves to a different row, ensuring defaultValue reads
                      // fresh. Uncontrolled — DOM owns the value during edit.
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
                      className={`inline-block w-12 text-center px-2 py-0.5 rounded ${
                        isSelected ? 'border border-primary/50 bg-background' : ''
                      }`}
                    >
                      {item.quantity}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <p className="truncate max-w-xs">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {(item.batch?.batch_number ?? item.batch_number)
                    ? <>
                        <p className="text-blue-600 font-medium">{item.batch?.batch_number ?? item.batch_number}</p>
                        {(item.batch?.expires_at ?? item.expires_at) && (
                          <p className="text-[10px] text-muted-foreground">exp {new Date(item.batch?.expires_at ?? item.expires_at).toLocaleDateString()}</p>
                        )}
                      </>
                    : <span className="text-muted-foreground">—</span>
                  }
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground/60">
                  {item.available_stock != null ? item.available_stock : (item.batch?.available_qty != null ? item.batch.available_qty : '—')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={discount > 0 ? 'line-through text-muted-foreground/60 text-xs' : ''}>
                    Nu. {unitPrice.toFixed(2)}
                  </span>
                  {discount > 0 && (
                    <span className="block text-emerald-600 font-medium">→ Nu. {finalRate.toFixed(2)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {parseFloat(item.discount) > 0 ? (
                    <span className="text-emerald-600 text-xs font-medium">
                      {item.discount_type === 'PERCENTAGE'
                        ? `${item.discount_value}%`
                        : `Nu.${parseFloat(item.discount).toFixed(2)}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">
                  Nu. {total.toFixed(2)}
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
