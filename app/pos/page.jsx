"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { CartTable }          from "@/components/pos/keyboard/cart-table"
import { ProductSearchModal } from "@/components/pos/keyboard/product-search-modal"
import { PaymentModal }       from "@/components/pos/keyboard/payment-modal"
import { HelpOverlay }        from "@/components/pos/keyboard/help-overlay"
import { ShortcutBar }        from "@/components/pos/keyboard/shortcut-bar"
import { useCart }            from "@/hooks/use-cart"
import { useKhata }           from "@/hooks/use-khata"
import { getUser, getRoleClaims, signOut } from "@/lib/auth"
import { createClient }       from "@/lib/supabase/client"
import {
  LogOut, ClipboardList, BookOpen, Package,
  Wallet, Hand, X, LayoutDashboard, ShoppingCart
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerOtpModal } from "@/components/pos/customer-otp-modal"

export default function KeyboardPosPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,         setUser]         = useState(null)
  const [entity,       setEntity]       = useState(null)
  const [subRole,      setSubRole]      = useState('CASHIER')
  const [selectedRow,  setSelectedRow]  = useState(0)
  const editRowRef = useRef(null) // callback set by CartTable to trigger inline edit
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [paymentOpen,   setPaymentOpen]   = useState(false)
  const [helpOpen,      setHelpOpen]      = useState(false)
  const [checkoutErr,   setCheckoutErr]   = useState(null)
  const [creditOtpOpen, setCreditOtpOpen] = useState(false)
  const pendingPayment  = useRef(null) // stores { method, received } while OTP is open
  const [lastOrderNo,  setLastOrderNo]  = useState(null)

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId, subRole: sr } = getRoleClaims(currentUser)
      setSubRole(sr ?? 'CASHIER')
      if (!entityId) return
      const { data } = await supabase
        .from('entities')
        .select('id, name, tpn_gstin')
        .eq('id', entityId)
        .single()
      setEntity(data)
    }
    load()
  }, [])

  const {
    cartId, items, customer,
    subtotal, gstTotal, grandTotal,
    carts, activeIndex,
    addItem, updateQty, removeItem, clearCart, setCustomerIdentity,
    holdCart, switchCart, cancelCart,
  } = useCart(entity?.id, user?.id)

  const { lookupAccount, createAccount } = useKhata(entity?.id)

  // Snap selection to last row when items shrink, or to 0 when first item added
  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return }
    if (selectedRow >= items.length) setSelectedRow(items.length - 1)
    else if (items.length === 1) setSelectedRow(0)
  }, [items.length])

  // Global key capture — any printable char opens search
  useEffect(() => {
    function handleKeyDown(e) {
      // Skip if a modal is open or an input has focus
      if (searchOpen || paymentOpen || helpOpen) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return

      if (e.key === 'F1')  { e.preventDefault(); setHelpOpen(true); return }
      if (e.key === 'F2')  { e.preventDefault(); handleNewTransaction(); return }
      if (e.key === 'F3')  { e.preventDefault(); openSearch(''); return }
      if (e.key === 'F4')  { e.preventDefault(); holdCart(); return }           // F4  = new cart (hold current)
      if (e.key === 'F5')  { e.preventDefault(); if (items.length > 0) setPaymentOpen(true); return }
      if (e.key === 'F6')  { e.preventDefault(); cancelCart(activeIndex); return } // F6 = cancel/clear active cart
      if (e.key === 'F7')  { e.preventDefault(); voidSelected(); return }
      if (e.key === 'Tab' && !e.shiftKey) {                                    // Tab = next cart
        e.preventDefault()
        if (carts.length > 1) switchCart((activeIndex + 1) % carts.length)
        return
      }
      if (e.key === 'Tab' && e.shiftKey) {                                     // Shift+Tab = prev cart
        e.preventDefault()
        if (carts.length > 1) switchCart((activeIndex - 1 + carts.length) % carts.length)
        return
      }
      if (e.key === 'F9')  { e.preventDefault(); switchToTouch(); return }
      if (e.key === 'Delete') { e.preventDefault(); voidSelected(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r + 1) % items.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r - 1 + items.length) % items.length); return }
      if (e.key === 'Enter' && items.length > 0) { e.preventDefault(); editRowRef.current?.(selectedRow); return }

      // Ctrl+1..9 — jump directly to cart by number
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const target = parseInt(e.key, 10) - 1
        if (target < carts.length) { e.preventDefault(); switchCart(target) }
        return
      }

      // Any printable character → open search with that character
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        openSearch(e.key)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen, paymentOpen, helpOpen, items, selectedRow])

  function openSearch(initialChar) {
    setSearchQuery(initialChar)
    setSearchOpen(true)
  }

  function voidSelected() {
    if (items[selectedRow]) {
      removeItem(items[selectedRow].id)
      setSelectedRow(r => Math.max(0, r - (r >= items.length - 1 ? 1 : 0)))
    }
  }

  function handleNewTransaction() {
    if (items.length > 0 && !confirm('Clear cart and start new transaction?')) return
    clearCart()
    setSelectedRow(0)
    setCheckoutErr(null)
  }

  function switchToTouch() {
    localStorage.setItem('pos_layout_mode', 'touch')
    router.push('/pos/touch')
  }

  function handleProductAdd(product, qty = 1) {
    const batchQty = product.available_stock ?? Infinity

    if (product.batch_id && qty > batchQty) {
      // Requested qty exceeds this batch — cap at batch qty and warn
      if (batchQty > 0) {
        addItem({ ...product, quantity: batchQty })
        setSelectedRow(items.length)
        setCheckoutErr(
          `Only ${batchQty} units available in batch "${product.batch_number || product.batch_id.slice(0, 8)}". ` +
          `Added ${batchQty}. Search the product again to add remaining ${qty - batchQty} from another batch.`
        )
      } else {
        setCheckoutErr(`Batch "${product.batch_number || product.batch_id.slice(0, 8)}" is out of stock.`)
      }
    } else {
      addItem({ ...product, quantity: qty })
      setSelectedRow(items.length)
    }
  }

  async function handlePaymentConfirm({ method, received }) {
    setPaymentOpen(false)
    setCheckoutErr(null)

    if (!cartId || items.length === 0) return

    // CREDIT requires customer OTP verification before completing
    if (method === 'CREDIT') {
      pendingPayment.current = { method, received }
      setCreditOtpOpen(true)
      return
    }

    await processPayment({ method, received })
  }

  async function handleCreditOtpVerified(phone) {
    setCreditOtpOpen(false)
    await setCustomerIdentity({ whatsapp: phone, buyerHash: null })

    // Auto-create khata account if customer is new
    let { account } = await lookupAccount(phone)
    if (!account) {
      const { data: customerEntity } = await supabase
        .from('entities')
        .select('name')
        .eq('whatsapp_no', phone)
        .single()

      const { account: newAccount } = await createAccount({
        party_type:   'CONSUMER',
        debtor_phone: phone,
        debtor_name:  customerEntity?.name ?? `Customer ${phone.slice(-4)}`,
        credit_limit: 1000,
      })
      account = newAccount
    }

    if (pendingPayment.current) {
      await processPayment(pendingPayment.current)
      pendingPayment.current = null
    }
  }

  async function processPayment({ method, received }) {

    try {
      const year   = new Date().getFullYear()
      const serial = String(Math.floor(Math.random() * 99999)).padStart(5, '0')
      const orderNo = `${entity?.name?.substring(0, 4).toUpperCase() ?? 'POS'}-${year}-${serial}`

      const { createHash } = await import('crypto').catch(() => ({ createHash: null }))
      let signature = ''
      if (createHash) {
        signature = createHash('sha256')
          .update(`${orderNo}:${grandTotal}:${entity?.tpn_gstin ?? ''}`)
          .digest('hex')
      }

      // Insert order_items first so the deduct trigger can read them on INSERT
      // We insert the order at PENDING_PAYMENT, insert items, then confirm atomically
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_type:    'POS_SALE',
          order_no:      orderNo,
          status:        'PENDING_PAYMENT',
          seller_id:     entity.id,
          buyer_whatsapp: customer?.whatsapp ?? null,
          buyer_hash:    customer?.buyerHash ?? null,
          items,
          subtotal,
          gst_total:     gstTotal,
          grand_total:   grandTotal,
          payment_method: method,
          digital_signature: signature,
          cart_id:       cartId,
          created_by:    user?.id,
        })
        .select('id, order_no')
        .single()

      if (orderError) throw new Error(orderError.message)

      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map(item => ({
          order_id:   order.id,
          product_id: item.product_id,
          batch_id:   item.batch_id ?? null,
          sku:        item.sku,
          name:       item.name,
          quantity:   item.quantity,
          unit_price: item.unit_price,
          discount:   item.discount ?? 0,
          gst_5:      item.gst_5,
          total:      item.total,
          status:     'ACTIVE',
        }))
      )

      if (itemsError) throw new Error(itemsError.message)

      // Confirm — triggers guard_stock_on_confirm (BEFORE) and deduct_stock_on_confirm (AFTER)
      const { error: confirmError } = await supabase
        .from('orders')
        .update({ status: 'CONFIRMED', payment_verified_at: new Date().toISOString() })
        .eq('id', order.id)

      if (confirmError) throw new Error(confirmError.message)

      setLastOrderNo(order.order_no)
      await clearCart()
      setSelectedRow(0)

    } catch (err) {
      setCheckoutErr(err.message)
    }
  }

  if (!entity) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="flex flex-col h-screen bg-background select-none">
      {/* Nav header — mirrors touch POS header */}
      <header className="glassmorphism border-b border-border px-4 py-2 flex items-center justify-between gap-3 shrink-0">
        {/* Left — branding + store + customer */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-sm">🏔️</span>
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-serif font-bold leading-none truncate">{entity.name}</p>
            <p className="text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          {customer?.whatsapp && (
            <span className="text-xs text-emerald-600 font-medium border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {customer.whatsapp}
            </span>
          )}
        </div>

        {/* Right — nav icons */}
        <div className="flex items-center gap-1 shrink-0">
          {subRole === 'OWNER' && (
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/admin/stores')} title="Manage Stores">
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/orders')} title="Orders [O]">
            <ClipboardList className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/purchases')} title="Purchases">
            <ShoppingCart className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/products')} title="Products">
            <BookOpen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/inventory')} title="Inventory">
            <Package className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/khata')} title="Khata">
            <Wallet className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Switch to Touch Mode [F9]"
            onClick={switchToTouch}
            className="text-muted-foreground hover:text-foreground"
          >
            <Hand className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Success banner */}
      {lastOrderNo && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-sm text-emerald-700 font-medium shrink-0">
          ✓ Order {lastOrderNo} completed — press F2 for new transaction
        </div>
      )}

      {/* Error banner */}
      {checkoutErr && (
        <div className="px-4 py-2 bg-tibetan/10 border-b border-tibetan/30 text-sm text-tibetan shrink-0">
          {checkoutErr}
        </div>
      )}

      {/* Multi-cart tab bar */}
      {(carts.length > 1 || items.length > 0) && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/10 shrink-0 overflow-x-auto">
          {carts.map((cart, i) => {
            const count = (cart.cart_items ?? []).length
            const isActive = i === activeIndex
            return (
              <div key={cart.id ?? i} className="flex items-center shrink-0">
                <button
                  onClick={() => switchCart(i)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Cart {i + 1}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1 rounded-full ${isActive ? 'bg-white/20' : 'bg-muted-foreground/20'}`}>
                      {count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => cancelCart(i)}
                  className="ml-0.5 text-muted-foreground hover:text-tibetan transition-colors"
                  title="Cancel cart"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          <button
            onClick={holdCart}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors shrink-0"
            title="Hold cart & start new [Shift+F3]"
          >
            + Hold
          </button>
        </div>
      )}

      {/* Cart table — main screen */}
      <CartTable
        items={items}
        onUpdateQty={(itemId, qty) => updateQty(itemId, qty)}
        onRemoveItem={removeItem}
        selectedRow={selectedRow}
        onSelectRow={setSelectedRow}
        onEditRequest={editRowRef}
      />

      {/* Totals row */}
      {items.length > 0 && (
        <div className="border-t border-border px-4 py-2 flex items-center justify-end gap-6 text-sm tabular-nums shrink-0 bg-muted/10">
          <span className="text-muted-foreground">Subtotal: <strong>Nu. {subtotal.toFixed(2)}</strong></span>
          <span className="text-muted-foreground">GST (5%): <strong>Nu. {gstTotal.toFixed(2)}</strong></span>
          <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
        </div>
      )}

      {/* Shortcut bar */}
      <ShortcutBar />

      {/* Modals */}
      <ProductSearchModal
        open={searchOpen}
        initialQuery={searchQuery}
        entityId={entity?.id}
        onAdd={handleProductAdd}
        onClose={() => { setSearchOpen(false); setSearchQuery('') }}
      />

      <PaymentModal
        open={paymentOpen}
        grandTotal={grandTotal}
        onConfirm={handlePaymentConfirm}
        onClose={() => setPaymentOpen(false)}
      />

      <HelpOverlay
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      <CustomerOtpModal
        open={creditOtpOpen}
        onVerified={handleCreditOtpVerified}
        onClose={() => { setCreditOtpOpen(false); pendingPayment.current = null }}
      />
    </div>
  )
}
