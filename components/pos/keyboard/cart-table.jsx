"use client"

import { useState, useRef } from "react"
import { Trash2 } from "lucide-react"

/**
 * Full-width cart table for keyboard POS.
 * Row selection via ↑↓. Qty editing by pressing Enter on selected row.
 *
 * @param {{ items: object[], onUpdateQty: fn, onRemoveItem: fn, selectedRow: number, onSelectRow: fn }} props
 */
export function CartTable({ items, onUpdateQty, onRemoveItem, selectedRow, onSelectRow, onEditRequest }) {
  const [editingRow, setEditingRow]   = useState(null)
  const [editQty,    setEditQty]      = useState('')
  const editInputRef                  = useRef(null)

  // Called by parent keyboard handler (Enter key) to start editing the selected row
  if (onEditRequest) onEditRequest.current = (index) => {
    if (items[index] != null) startEdit(index)
  }

  function startEdit(index) {
    setEditingRow(index)
    setEditQty(String(items[index].quantity))
    setTimeout(() => editInputRef.current?.select(), 20)
  }

  function confirmEdit(index) {
    const qty = parseInt(editQty, 10)
    if (!isNaN(qty) && qty > 0) {
      onUpdateQty(items[index].id, qty)
    }
    setEditingRow(null)
    setEditQty('')
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditQty('')
  }

  function handleEditKeyDown(e, index) {
    if (e.key === 'Enter')  { e.preventDefault(); confirmEdit(index) }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
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
            <th className="text-right px-4 py-2 w-28">Total</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const isSelected = selectedRow === i
            const isEditing  = editingRow  === i
            const total = parseFloat(item.total ?? (item.unit_price * item.quantity * 1.05))

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
                      ref={editInputRef}
                      type="number"
                      min="1"
                      value={editQty}
                      onChange={e => setEditQty(e.target.value)}
                      onKeyDown={e => handleEditKeyDown(e, i)}
                      onBlur={() => confirmEdit(i)}
                      className="w-16 px-1 py-0.5 text-sm text-center border border-primary rounded bg-background outline-none"
                      onClick={e => e.stopPropagation()}
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
                  Nu. {parseFloat(item.unit_price).toFixed(2)}
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
