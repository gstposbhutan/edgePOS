"use client"

import { useState } from "react"
import { Minus, Plus, Trash2, ShoppingCart, CreditCard, Tag, Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

const PAYMENT_METHODS = [
  { id: 'MBOB',   label: 'mBoB',   color: 'bg-blue-600' },
  { id: 'MPAY',   label: 'mPay',   color: 'bg-emerald-600' },
  { id: 'CASH',   label: 'Cash',   color: 'bg-amber-600' },
  { id: 'RTGS',   label: 'RTGS',   color: 'bg-purple-600' },
  { id: 'CREDIT', label: 'Credit', color: 'bg-tibetan' },
]

/**
 * @param {{
 *   items: object[],
 *   subtotal: number,
 *   discountTotal: number,
 *   taxableSubtotal: number,
 *   gstTotal: number,
 *   grandTotal: number,
 *   customer: object|null,
 *   paymentMethod: string|null,
 *   userSubRole: string,
 *   onUpdateQty: (id, qty) => void,
 *   onRemoveItem: (id) => void,
 *   onApplyDiscount: (id, amount) => void,
 *   onOverridePrice: (id, price) => void,
 *   onSelectPayment: (method) => void,
 *   onCheckout: () => void,
 *   checkoutLoading: boolean,
 * }} props
 */
export function CartPanel({
  items, subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal,
  customer, paymentMethod, userSubRole = 'CASHIER',
  onUpdateQty, onRemoveItem, onApplyDiscount, onOverridePrice,
  onSelectPayment, onCheckout, checkoutLoading,
}) {
  const hasItems    = items.length > 0
  const canCheckout = hasItems && !!paymentMethod
  const canDiscount = ['MANAGER', 'OWNER', 'ADMIN'].includes(userSubRole)

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Cart header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Cart</span>
          {hasItems && <Badge className="bg-primary text-xs">{items.length}</Badge>}
        </div>
        {hasItems && (
          <span className="text-xs text-muted-foreground">{items.reduce((s,i) => s + i.quantity, 0)} items</span>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 opacity-20" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs text-center">Select products from the left to add them</p>
          </div>
        ) : (
          items.map(item => (
            <CartItem
              key={item.id}
              item={item}
              canDiscount={canDiscount}
              onUpdateQty={qty  => onUpdateQty(item.id, qty)}
              onRemove={()      => onRemoveItem(item.id)}
              onApplyDiscount={amt  => onApplyDiscount(item.id, amt)}
              onOverridePrice={price => onOverridePrice(item.id, price)}
            />
          ))
        )}
      </div>

      {/* Totals + payment + checkout */}
      {hasItems && (
        <div className="shrink-0 space-y-3 pt-3 border-t border-border">
          {/* GST breakdown — shows discounted taxable base */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal (pre-discount)</span>
              <span>Nu. {subtotal.toFixed(2)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>− Nu. {discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable amount</span>
              <span>Nu. {taxableSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST @ 5% (on taxable)</span>
              <span>Nu. {gstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1 border-t border-border text-foreground">
              <span>Total</span>
              <span className="text-primary">Nu. {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Payment Method</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map(method => (
                <button
                  key={method.id}
                  onClick={() => onSelectPayment(method.id)}
                  className={`
                    py-1.5 px-2 rounded-lg text-xs font-medium border transition-all
                    ${paymentMethod === method.id
                      ? `${method.color} text-white border-transparent`
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-card'
                    }
                  `}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Checkout */}
          <Button
            onClick={onCheckout}
            disabled={!canCheckout || checkoutLoading}
            className="w-full bg-primary hover:bg-primary/90 h-11 text-base font-semibold"
          >
            <CreditCard className="mr-2 h-5 w-5" />
            {checkoutLoading ? 'Processing...'
              : !paymentMethod ? 'Select Payment Method'
              : `Charge Nu. ${grandTotal.toFixed(2)}`
            }
          </Button>

          {!customer && (
            <p className="text-xs text-amber-600 text-center">
              ⚠ Customer ID required before checkout
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cart line item ──────────────────────────────────────────────────────────

const PKG_TYPE_COLORS = {
  BULK:   'text-blue-600',
  BUNDLE: 'text-purple-600',
  MIXED:  'text-amber-600',
  PALLET: 'text-emerald-600',
}

function CartItem({ item, canDiscount, onUpdateQty, onRemove, onApplyDiscount, onOverridePrice }) {
  const [editMode,        setEditMode]        = useState(null)
  const [inputValue,      setInputValue]      = useState('')
  const [showComponents,  setShowComponents]  = useState(false)

  const unitPrice    = parseFloat(item.unit_price)
  const discount     = parseFloat(item.discount ?? 0)
  const hasDiscount  = discount > 0
  const isPackage    = !!item.package_id
  const pkgDef       = item.package_def
  const components   = pkgDef?.package_items ?? []
  const pkgTypeColor = PKG_TYPE_COLORS[pkgDef?.package_type] ?? 'text-muted-foreground'

  function handleEditConfirm() {
    const val = parseFloat(inputValue)
    if (isNaN(val) || val < 0) { setEditMode(null); return }
    if (editMode === 'discount') onApplyDiscount(val)
    if (editMode === 'price')    onOverridePrice(val)
    setEditMode(null)
    setInputValue('')
  }

  function openEdit(mode) {
    setInputValue(mode === 'discount' ? String(discount) : String(unitPrice))
    setEditMode(mode)
  }

  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-border bg-card">
      {/* Top row — name + remove */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
            {isPackage && pkgDef?.package_type && (
              <span className={`text-[9px] font-semibold shrink-0 ${pkgTypeColor}`}>
                {pkgDef.package_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Nu. {unitPrice.toFixed(2)}
            </span>
            {hasDiscount && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] px-1 py-0">
                −Nu.{discount.toFixed(2)} off
              </Badge>
            )}
            {/* Toggle component breakdown for packages */}
            {isPackage && components.length > 0 && (
              <button
                onClick={() => setShowComponents(v => !v)}
                className="text-[10px] text-primary hover:underline"
              >
                {showComponents ? '▲ hide' : `▼ ${components.length} items`}
              </button>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-tibetan transition-colors mt-0.5">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline edit row */}
      {editMode && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">
            {editMode === 'discount' ? 'Discount (Nu):' : 'New price (Nu):'}
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleEditConfirm(); if (e.key === 'Escape') setEditMode(null) }}
            className="h-6 text-xs px-2 flex-1"
            autoFocus
          />
          <button onClick={handleEditConfirm} className="text-emerald-600 hover:text-emerald-700">
            <span className="text-xs font-medium">OK</span>
          </button>
          <button onClick={() => setEditMode(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bottom row — qty controls + actions + total */}
      <div className="flex items-center gap-2">
        {/* Qty */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdateQty(item.quantity - 1)}
            className="h-6 w-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-sm font-medium w-6 text-center tabular-nums">{item.quantity}</span>
          <button
            onClick={() => onUpdateQty(item.quantity + 1)}
            className="h-6 w-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Manager actions */}
        {canDiscount && !editMode && (
          <div className="flex gap-1 ml-1">
            <button
              onClick={() => openEdit('discount')}
              title="Apply discount"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Tag className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => openEdit('price')}
              title="Override price"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Item total */}
        <span className="text-xs font-semibold text-primary ml-auto tabular-nums">
          Nu. {parseFloat(item.total).toFixed(2)}
        </span>
      </div>

      {/* Package component breakdown */}
      {isPackage && showComponents && components.length > 0 && (
        <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
          {components.map((c, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">
              {c.quantity * item.quantity}× {c.product?.name ?? '—'}
              <span className="opacity-60"> ({c.quantity} per pkg)</span>
            </p>
          ))}
        </div>
      )}

      {/* GST breakdown per item */}
      <p className="text-[10px] text-muted-foreground">
        GST: Nu. {parseFloat(item.gst_5).toFixed(2)} · Taxable: Nu. {(Math.max(0, unitPrice - discount) * item.quantity).toFixed(2)}
      </p>
    </div>
  )
}
