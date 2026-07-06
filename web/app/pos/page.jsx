"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { CartTable }          from "@/components/pos/keyboard/cart-table"
import { ProductSearchModal } from "@/components/pos/keyboard/product-search-modal"
import { PaymentModal }       from "@/components/pos/keyboard/payment-modal"
import { HelpOverlay }        from "@/components/pos/keyboard/help-overlay"
import { ShortcutBar }        from "@/components/pos/keyboard/shortcut-bar"
import { DiscountModal }      from "@/components/pos/keyboard/discount-modal"
import { BillDiscountModal }  from "@/components/pos/keyboard/bill-discount-modal"
import { CustomerPanelModal } from "@/components/pos/keyboard/customer-panel-modal"
import { InvoiceSearchModal } from "@/components/pos/keyboard/invoice-search-modal"
import { SalespersonPickerModal } from "@/components/pos/keyboard/salesperson-picker-modal"
import { QuotationConfirmModal } from "@/components/pos/keyboard/quotation-confirm-modal"
import { ComplimentaryConfirmModal } from "@/components/pos/keyboard/complimentary-confirm-modal"
import { ExchangeModal } from "@/components/pos/keyboard/exchange-modal"
import { PostMarketModal } from "@/components/pos/keyboard/post-market-modal"
import { DeliveryAddressModal } from "@/components/pos/keyboard/delivery-address-modal"
import { useCart }            from "@/hooks/use-cart"
import { useKhata }           from "@/hooks/use-khata"
import { getUser, getEnrichedClaims, signOut } from "@/lib/auth"
import { Logo }                from "@/components/ui/logo"
import { ShiftStatusBadge }   from "@/components/pos/shift/shift-status-badge"
import { StartShiftModal }    from "@/components/pos/shift/start-shift-modal"
import { EndShiftModal }      from "@/components/pos/shift/end-shift-modal"
import { CashAdjustmentModal } from "@/components/pos/cash-adjustment-modal"
import { ZReportModal }       from "@/components/pos/z-report-modal"
import { HandoverModal }      from "@/components/pos/handover-modal"
import { ReceiptPreviewModal } from "@/components/pos/keyboard/receipt-preview-modal"
import { useShift }           from "@/hooks/use-shift"
import {
  LogOut, ClipboardList, BookOpen, Package,
  Wallet, Hand, X, LayoutDashboard, ShoppingCart, Landmark, Users, MonitorDown, Clock, Calendar
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerOtpModal } from "@/components/pos/customer-otp-modal"

export default function KeyboardPosPage() {
  const router = useRouter()

  const [user,         setUser]         = useState(null)
  const [entity,       setEntity]       = useState(null)
  const [subRole,      setSubRole]      = useState('CASHIER')
  const [selectedRow,  setSelectedRow]  = useState(0)
  const editRowRef = useRef(null)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [paymentOpen,   setPaymentOpen]   = useState(false)
  const [helpOpen,      setHelpOpen]      = useState(false)
  const [checkoutErr,   setCheckoutErr]   = useState(null)
  const [creditOtpOpen, setCreditOtpOpen] = useState(false)
  const pendingPayment  = useRef(null)
  const [lastOrderNo,  setLastOrderNo]  = useState(null)
  const [showReceipt,  setShowReceipt]  = useState(false)
  const [receiptOrder, setReceiptOrder] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [showDiscount, setShowDiscount] = useState(false)
  const [showStartShift, setShowStartShift] = useState(false)
  const [showEndShift,   setShowEndShift]   = useState(false)
  const [showCashAdj,    setShowCashAdj]    = useState(false)
  const [showZReport,    setShowZReport]    = useState(false)
  const [showHandover,   setShowHandover]   = useState(false)
  const [showBillDiscount, setShowBillDiscount] = useState(false)
  const [showCustomerPanel, setShowCustomerPanel] = useState(false)
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false)
  const [showSalesPerson, setShowSalesPerson] = useState(false)
  const [salesPersonId, setSalesPersonId] = useState(null)        // active salesperson (F8) — tags NEW lines; null = unattributed
  const [salesPersonName, setSalesPersonName] = useState(null)
  const [salespeopleById, setSalespeopleById] = useState({})      // id → name, to label each cart line's salesperson
  const [showQuotation, setShowQuotation] = useState(false)
  const [showComp, setShowComp] = useState(false)
  const [showExchange, setShowExchange] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [showDelivery, setShowDelivery] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState(null)    // attached to the next sale (Alt+D)
  const [selectedCustomer, setSelectedCustomer] = useState(null)        // full khata account for header display
  const [nextInvoiceNo, setNextInvoiceNo] = useState(null)              // live preview of the next order no
  const [serverTime, setServerTime] = useState(null)                    // internet-sourced clock
  const [dateOverride, setDateOverride] = useState(null)                // ISO applied to the next sale (admin)
  const [dateOverrideDraft, setDateOverrideDraft] = useState('')
  const [showDateOverride, setShowDateOverride] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)
  const toastTimer = useRef(null)

  const { shift, openShift, closeShift } = useShift()

  // After the logout handover routes through "Close shift & sign out", finish the
  // sign-out once the drawer is counted and the shift actually closes. closeShift
  // throws on failure, so closedOkRef flips true only on a real close (a cancel
  // leaves it false → no sign-out).
  const pendingSignOutRef = useRef(false)
  const closedOkRef = useRef(false)
  async function closeShiftAndTrack(id, count) {
    const res = await closeShift(id, count)
    closedOkRef.current = true
    return res
  }

  // Load the sales-attributable team once, to label each cart line's salesperson (per-line #3).
  useEffect(() => {
    fetch('/api/pos/salespeople')
      .then(r => r.ok ? r.json() : { salespeople: [] })
      .then(d => setSalespeopleById(Object.fromEntries((d.salespeople || []).map(s => [s.id, s.full_name || s.sub_role]))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId, subRole: sr } = await getEnrichedClaims(currentUser)
      setSubRole(sr ?? 'CASHIER')
      if (!entityId) return
      // Fetch entity info via BFF
      const res = await fetch('/api/pos/entities')
      if (res.ok) {
        const data = await res.json()
        setEntity(data.entity)
      }
    }
    load()
  }, [])

  async function refreshInvoiceHeader() {
    try {
      const res = await fetch('/api/pos/next-invoice')
      if (res.ok) {
        const data = await res.json()
        setNextInvoiceNo(data.orderNo)
        setServerTime(data.serverTime)
      }
    } catch { /* ignore — header keeps the last known value */ }
  }

  // Live invoice-no preview + internet-sourced clock. Refresh on entity load, every
  // 60s (keeps the clock honest), and after each completed sale (see processPayment).
  useEffect(() => {
    if (!entity?.id) return
    refreshInvoiceHeader()
    const id = setInterval(refreshInvoiceHeader, 60000)
    return () => clearInterval(id)
  }, [entity?.id])

  const {
    cartId, items, customer,
    subtotal, gstTotal, grandTotal, billDiscount, taxableSubtotal,
    carts, activeIndex,
    addItem, updateQty, removeItem, clearCart, setCustomerIdentity, applyDiscount, applyBillDiscount,
    repriceCart, setLineSalesperson,
    holdCart, switchCart, cancelCart,
  } = useCart(entity?.id, user?.id, 'RETAIL', (name, avail) => showToast(`Only ${avail} in stock`))

  const { accounts, lookupAccount, createAccount } = useKhata(entity?.id)

  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return }
    if (selectedRow >= items.length) setSelectedRow(items.length - 1)
    else if (items.length === 1) setSelectedRow(0)
  }, [items.length])

  useEffect(() => {
    function handleKeyDown(e) {
      if (searchOpen || paymentOpen || helpOpen || showCustomerPanel || showDiscount || showBillDiscount || showInvoiceSearch || showSalesPerson || showQuotation || showComp || showExchange || showMarket || showDelivery || showHandover || showReceipt) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return

      // --- Function keys (canonical Pelbu map) ---
      if (e.key === 'F1')  { e.preventDefault(); setHelpOpen(true); return }
      if (e.key === 'F2')  { e.preventDefault(); handleNewTransaction(); return }
      if (e.key === 'F3')  { e.preventDefault(); openSearch(''); return }
      if (e.key === 'F4')  { e.preventDefault(); holdCart(); return }                       // New Cart
      if (e.key === 'F5')  {                                                                 // Previous Cart
        e.preventDefault()
        if (carts.length > 1) switchCart((activeIndex - 1 + carts.length) % carts.length)
        return
      }
      if (e.key === 'F6')  { e.preventDefault(); setShowCustomerPanel(true); return }                          // Customer Select
      if (e.key === 'F8')  {                                                                                  // Salesperson for the SELECTED line
        e.preventDefault()
        if (!items.length || !items[selectedRow]) { showToast('Select a product line first'); return }
        setShowSalesPerson(true)
        return
      }
      if (e.key === 'F9')  { e.preventDefault(); editRowRef.current?.(selectedRow); return }                  // Change Qty
      if (e.key === 'F10') { e.preventDefault(); if (items.length > 0) setPaymentOpen(true); return }         // Tender

      // --- Manager shortcuts ---
      const isManager = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)
      if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z') && isManager) { e.preventDefault(); setShowZReport(true); return }
      if (e.ctrlKey && e.shiftKey && (e.key === 'x' || e.key === 'X') && isManager) { e.preventDefault(); setShowCashAdj(true); return }   // Cash In/Out (relocated off F8)

      // --- Ctrl modifiers ---
      if (e.ctrlKey && !e.shiftKey) {
        const k = e.key.toLowerCase()
        if (k === 'm') { e.preventDefault(); if (items.length > 0 && items[selectedRow]) setShowDiscount(true); return }   // per-row discount
        if (k === 'a') { e.preventDefault(); openSearch(''); return }                                                      // Add product
        if (k === 'r') { e.preventDefault(); voidSelected(); return }                                                       // Remove selected row
        if (k === 'd') { e.preventDefault(); if (items.length > 0) setShowBillDiscount(true); return }                      // Bill discount (all lines)
        if (k === 'c') { e.preventDefault(); if (isManager && items.length > 0) setShowComp(true); else showToast(isManager ? 'Add items first' : 'Complimentary is manager-only'); return }   // Complimentary (manager)
        if (k === 'e') { e.preventDefault(); setShowExchange(true); return }                                                  // Exchange (return from past order)
      }

      // --- Alt modifiers (all stubs) ---
      if (e.altKey && !e.ctrlKey) {
        const k = e.key.toLowerCase()
        if (k === 'm') { e.preventDefault(); if (items.length > 0) setShowMarket(true); else showToast('Add items first'); return }   // Post to Market
        if (k === 'q') { e.preventDefault(); if (items.length > 0) setShowQuotation(true); else showToast('Add items first'); return }   // Quotation
        if (k === 'd') { e.preventDefault(); setShowDelivery(true); return }                                                    // Delivery Address
      }

      // --- Navigation / cart switching ---
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        if (carts.length > 1) switchCart((activeIndex + 1) % carts.length)
        return
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        if (carts.length > 1) switchCart((activeIndex - 1 + carts.length) % carts.length)
        return
      }
      if (e.key === 'Delete') { e.preventDefault(); voidSelected(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r + 1) % items.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r - 1 + items.length) % items.length); return }
      if (e.key === 'Enter' && items.length > 0) { e.preventDefault(); editRowRef.current?.(selectedRow); return }

      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const target = parseInt(e.key, 10) - 1
        if (target < carts.length) { e.preventDefault(); switchCart(target) }
        return
      }

      // Type-to-search (single char, no modifiers)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        openSearch(e.key)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // checkoutErr must be a dep: handleNewTransaction (F2) reads it to block
    // clearing on a stock error. Without it, the out-of-stock branch (no item
    // added → items unchanged → effect not re-run) leaves a stale closure.
  }, [searchOpen, paymentOpen, helpOpen, showCustomerPanel, showDiscount, showBillDiscount, showInvoiceSearch, showSalesPerson, showQuotation, showComp, showExchange, showMarket, showDelivery, showHandover, showReceipt, items, selectedRow, carts, activeIndex, subRole, checkoutErr])

  function showToast(msg) {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }

  // Alt+Q — save the cart as a draft quotation (SALES_ORDER/DRAFT): no payment,
  // no stock move. Clears the cart on success like a completed sale.
  async function saveQuotation() {
    if (items.length === 0) return
    try {
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items, subtotal, gstTotal, grandTotal,
          customerWhatsapp: customer?.whatsapp ?? null,
          buyerHash: customer?.buyerHash ?? null,
          cartId,
          quotation: true,
          salespersonId: salesPersonId ?? undefined,
          deliveryAddress: deliveryAddress || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Quotation failed')
      setLastOrderNo(data.order.order_no)
      await clearCart()
      setSelectedRow(0)
      setShowQuotation(false)
      showToast(`Quotation ${data.order.order_no} saved`)
    } catch (err) {
      setCheckoutErr(err.message)
      setShowQuotation(false)
    }
  }

  function openSearch(initialChar) {
    setSearchQuery(initialChar)
    setSearchOpen(true)
  }

  function voidSelected() {
    if (items[selectedRow]) {
      removeItem(items[selectedRow].id)
      setSelectedRow(r => Math.max(0, r - (r >= items.length - 1 ? 1 : 0)))
      setCheckoutErr(null)   // removing an item clears the stock-error path
    }
  }

  function handleNewTransaction() {
    if (checkoutErr) { showToast('Resolve the stock error first — remove the item or complete the sale'); return }
    if (items.length > 0 && !confirm('Clear cart and start new transaction?')) return
    clearCart()
    setSelectedRow(0)
    setCheckoutErr(null)
  }

  function handleCancelCart(index) {
    if (checkoutErr) { showToast('Resolve the stock error first — remove the item or complete the sale'); return }
    cancelCart(index)
  }

  function switchToTouch() {
    localStorage.setItem('pos_layout_mode', 'touch')
    router.push('/pos/touch')
  }

  function handleProductAdd(product, qty = 1, mode) {
    const batchQty = product.available_stock ?? Infinity
    // Lines start with no salesperson; the cashier assigns one per line via F8 (per-product #3).

    if (product.batch_id && qty > batchQty) {
      if (batchQty > 0) {
        addItem({ ...product, quantity: batchQty }, mode)
        setSelectedRow(items.length)
        setCheckoutErr(
          `Only ${batchQty} units available in batch "${product.batch_number || product.batch_id.slice(0, 8)}". ` +
          `Added ${batchQty}. Search the product again to add remaining ${qty - batchQty} from another batch.`
        )
      } else {
        setCheckoutErr(`Batch "${product.batch_number || product.batch_id.slice(0, 8)}" is out of stock.`)
      }
    } else {
      addItem({ ...product, quantity: qty }, mode)
      setSelectedRow(items.length)
    }
  }

  async function handlePaymentConfirm({ method, received, journalNo }) {
    setPaymentOpen(false)
    setCheckoutErr(null)

    if (!cartId || items.length === 0) return

    if (method === 'CREDIT') {
      pendingPayment.current = { method, received, journalNo }
      setCreditOtpOpen(true)
      return
    }

    await processPayment({ method, received, journalNo })
  }

  async function handleCreditOtpVerified(phone) {
    setCreditOtpOpen(false)
    await setCustomerIdentity({ whatsapp: phone, buyerHash: null })

    let { account } = await lookupAccount(phone)
    if (!account) {
      const res = await fetch(`/api/pos/entities?phone=${encodeURIComponent(phone)}`)
      const entityData = res.ok ? await res.json() : null

      const { account: newAccount } = await createAccount({
        party_type:   'CONSUMER',
        debtor_phone: phone,
        debtor_name:  entityData?.entity?.name ?? `Customer ${phone.slice(-4)}`,
        credit_limit: 1000,
      })
      account = newAccount
    }

    if (pendingPayment.current) {
      await processPayment(pendingPayment.current)
      pendingPayment.current = null
    }
  }

  async function processPayment({ method, received, journalNo }) {
    // Shifts are optional — a cashier can sell without an open shift (opening a shift for cash
    // reconciliation is opt-in, not a gate on checkout).
    try {
      // Order no + digital signature are issued server-side (next_pos_order_no RPC +
      // sha256 over orderNo:grandTotal:tpn). Admin-only invoice date override (Phase 2).
      const isAdmin = ['OWNER', 'ADMIN'].includes(subRole)

      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          subtotal,
          gstTotal,
          grandTotal,
          billDiscount,
          paymentMethod: method,
          paymentRef: journalNo || null,
          customerWhatsapp: customer?.whatsapp ?? null,
          buyerHash: customer?.buyerHash ?? null,
          cartId,
          invoiceDate: isAdmin && dateOverride ? dateOverride : undefined,
          salespersonId: salesPersonId ?? undefined,
          deliveryAddress: deliveryAddress || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order failed')

      setLastOrderNo(data.order.order_no)
      await clearCart()
      setSelectedRow(0)
      refreshInvoiceHeader()        // bump the displayed next invoice no
      setDateOverride(null)         // an override applies to one sale only
      setDateOverrideDraft('')

      // Pop the printable receipt preview. The POST only returns {id, order_no},
      // so re-fetch the full order + items (same shape the order page feeds to
      // <Receipt/>) before showing the modal.
      openReceiptForOrder(data.order.id)

    } catch (err) {
      setCheckoutErr(err.message)
    }
  }

  async function openReceiptForOrder(orderId) {
    try {
      const res = await fetch(`/api/pos/orders/${orderId}`)
      if (!res.ok) return                       // banner already confirms the sale
      const data = await res.json()
      if (!data.order) return
      setReceiptOrder(data.order)
      setReceiptItems(data.items ?? [])
      setShowReceipt(true)
    } catch { /* ignore — the success banner still confirms the sale */ }
  }

  if (!entity) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  async function handleSignOut() {
    // Don't let a logout silently orphan an open shift — prompt to close it or
    // hand the register to another cashier first (parity with /pos/touch).
    if (shift) { setShowHandover(true); return }
    await signOut()
    router.push('/login')
  }

  // "Close shift & sign out" → open the existing end-shift reconcile flow. After the
  // drawer is counted and the shift closes, the next sign-out goes straight through.
  function handleCloseShiftFromHandover() {
    setShowHandover(false)
    pendingSignOutRef.current = true
    closedOkRef.current = false
    setShowEndShift(true)
  }

  const isAdmin = ['OWNER', 'ADMIN'].includes(subRole)
  const displayDate = dateOverride ?? serverTime
  const customerLabel = selectedCustomer?.debtor_name ?? customer?.whatsapp ?? 'Walk-in Customer'

  return (
    <div className="flex flex-col h-screen bg-background select-none">
      {/* Nav header */}
      <header className="glassmorphism border-b border-border px-4 py-2 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo variant="icon" className="h-7 w-7 rounded-lg shrink-0" />
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-serif font-bold leading-none truncate">{entity.name}</p>
            <p className="text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={() => setShowCustomerPanel(true)}
            title="Select customer (F6)"
            className={`text-xs font-medium border px-2 py-0.5 rounded-full shrink-0 truncate max-w-[160px] ${
              selectedCustomer
                ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10'
                : 'text-muted-foreground border-border bg-muted/40 hover:bg-muted'
            }`}
          >
            {customerLabel}
          </button>
          <button
            onDoubleClick={() => setShowInvoiceSearch(true)}
            title="Next invoice number — double-click to search past invoices"
            className="hidden md:inline text-[11px] font-mono text-muted-foreground border border-border bg-muted/30 px-2 py-0.5 rounded-full shrink-0 cursor-pointer hover:bg-muted"
          >
            Inv: {nextInvoiceNo ?? '—'}
          </button>
          <button
            onClick={() => { if (!items.length || !items[selectedRow]) { showToast('Select a product line first'); return } setShowSalesPerson(true) }}
            title="Assign salesperson to the selected product line (F8)"
            className="hidden md:inline text-[10px] font-medium border border-border bg-muted/30 px-2 py-0.5 rounded-full shrink-0 hover:bg-muted"
          >
            + Salesperson (F8)
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => isAdmin && setShowDateOverride(v => !v)}
              title={isAdmin ? 'Invoice date — click to override (admin)' : 'Invoice date (server time)'}
              className={`text-[11px] tabular-nums border bg-muted/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                isAdmin ? 'text-foreground border-border hover:bg-muted cursor-pointer' : 'text-muted-foreground border-border cursor-default'
              } ${dateOverride ? 'ring-1 ring-primary' : ''}`}
            >
              <Calendar className="h-3 w-3" />
              {displayDate ? new Date(displayDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
            </button>
            {showDateOverride && isAdmin && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-3 w-64">
                <p className="text-xs font-medium mb-2">Override invoice date</p>
                <input
                  type="datetime-local"
                  value={dateOverrideDraft}
                  onChange={e => setDateOverrideDraft(e.target.value)}
                  className="w-full h-9 px-2 rounded border border-border bg-background text-sm"
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    className="flex-1 h-8 text-xs"
                    disabled={!dateOverrideDraft}
                    onClick={() => {
                      const d = new Date(dateOverrideDraft)
                      if (!Number.isNaN(d.getTime())) { setDateOverride(d.toISOString()); setShowDateOverride(false) }
                    }}
                  >Apply</Button>
                  <Button
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { setDateOverride(null); setDateOverrideDraft(''); setShowDateOverride(false) }}
                  >Reset</Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Applies to the next sale only.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {subRole === 'OWNER' && (
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/stores')} title="Manage Stores">
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          )}
          {subRole === 'OWNER' && (
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/team')} title="Team">
              <Users className="h-4 w-4" />
            </Button>
          )}
          {subRole === 'OWNER' && (
            <Button variant="ghost" size="icon-sm" onClick={() => router.push('/downloads')} title="Desktop App & Updates">
              <MonitorDown className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/orders')} title="Orders [O]">
            <ClipboardList className="h-4 w-4" />
          </Button>
          {subRole !== 'CASHIER' && (
            <>
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
              <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos/registers')} title="Cash Registers">
                <Landmark className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Switch to Touch Mode"
            onClick={switchToTouch}
            className="text-muted-foreground hover:text-foreground"
          >
            <Hand className="h-4 w-4" />
          </Button>
          {['MANAGER', 'OWNER', 'ADMIN'].includes(subRole) && (
            <div className="flex items-center gap-0.5 mr-1">
              <Button variant="ghost" size="icon-sm" title="Cash In/Out [Ctrl+Shift+X]" onClick={() => setShowCashAdj(true)} className="text-muted-foreground hover:text-foreground">
                <Wallet className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Z-Report [Ctrl+Shift+Z]" onClick={() => setShowZReport(true)} className="text-muted-foreground hover:text-foreground">
                <ClipboardList className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Shift history" onClick={() => router.push('/pos/shifts')} className="text-muted-foreground hover:text-foreground">
                <Clock className="h-4 w-4" />
              </Button>
            </div>
          )}
          <ShiftStatusBadge shift={shift} onStart={() => setShowStartShift(true)} onEnd={() => setShowEndShift(true)} />
          <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {lastOrderNo && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 text-sm text-emerald-700 font-medium shrink-0">
          ✓ Order {lastOrderNo} completed — press F2 for new transaction
        </div>
      )}

      {checkoutErr && (
        <div className="px-4 py-2 bg-tibetan/10 border-b border-tibetan/30 text-sm text-tibetan shrink-0">
          {checkoutErr}
        </div>
      )}

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
                  onClick={() => handleCancelCart(i)}
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

      <CartTable
        items={items}
        onUpdateQty={(itemId, qty) => updateQty(itemId, qty)}
        onRemoveItem={removeItem}
        selectedRow={selectedRow}
        onSelectRow={setSelectedRow}
        onEditRequest={editRowRef}
        salespeopleById={salespeopleById}
      />

      {items.length > 0 && (
        <div className="border-t border-border px-4 py-2 flex items-center justify-end gap-6 text-sm tabular-nums shrink-0 bg-muted/10">
          <span className="text-muted-foreground">Subtotal: <strong>Nu. {subtotal.toFixed(2)}</strong></span>
          {billDiscount > 0 && (
            <span className="text-emerald-600">Invoice disc: <strong>−Nu. {billDiscount.toFixed(2)}</strong></span>
          )}
          <span className="text-muted-foreground">GST (5%): <strong>Nu. {gstTotal.toFixed(2)}</strong></span>
          <span className="text-lg font-bold text-primary">Total: Nu. {grandTotal.toFixed(2)}</span>
        </div>
      )}

      <ShortcutBar />

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

      {showStartShift && (
        <StartShiftModal
          onOpen={openShift}
          onClose={() => setShowStartShift(false)}
        />
      )}

      {showEndShift && shift && (
        <EndShiftModal
          shift={shift}
          onClose={() => {
            setShowEndShift(false)
            if (pendingSignOutRef.current && closedOkRef.current) {
              pendingSignOutRef.current = false
              signOut().then(() => router.push('/login'))
            } else {
              pendingSignOutRef.current = false
            }
          }}
          onEndShift={closeShiftAndTrack}
        />
      )}

      {showCashAdj && (
        <CashAdjustmentModal shift={shift} onClose={() => setShowCashAdj(false)} />
      )}

      {showZReport && (
        <ZReportModal onClose={() => setShowZReport(false)} />
      )}

      <HandoverModal
        open={showHandover}
        currentUserId={user?.id}
        onCloseShift={handleCloseShiftFromHandover}
        onClose={() => setShowHandover(false)}
      />

      {showReceipt && receiptOrder && (
        <ReceiptPreviewModal
          order={receiptOrder}
          entity={entity}
          items={receiptItems}
          onNewSale={() => { setShowReceipt(false); setLastOrderNo(null) }}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {showDiscount && items[selectedRow] && (
        <DiscountModal
          item={items[selectedRow]}
          onClose={() => setShowDiscount(false)}
          onApply={(discount) => {
            applyDiscount(items[selectedRow].id, discount)
            setShowDiscount(false)
          }}
        />
      )}

      {showBillDiscount && items.length > 0 && (
        <BillDiscountModal
          items={items}
          onClose={() => setShowBillDiscount(false)}
          onApply={(amount) => {
            applyBillDiscount(amount)
            setShowBillDiscount(false)
          }}
        />
      )}

      {showCustomerPanel && (
        <CustomerPanelModal
          accounts={accounts}
          selectedPhone={selectedCustomer?.debtor_phone ?? customer?.whatsapp ?? null}
          onClose={() => setShowCustomerPanel(false)}
          onSelect={(account) => {
            if (account) {
              setCustomerIdentity({ whatsapp: account.debtor_phone, buyerHash: null })
              setSelectedCustomer(account)
            } else {
              setCustomerIdentity({ whatsapp: null, buyerHash: null })
              setSelectedCustomer(null)
            }
            setShowCustomerPanel(false)
          }}
        />
      )}

      {showInvoiceSearch && (
        <InvoiceSearchModal onClose={() => setShowInvoiceSearch(false)} />
      )}

      {showSalesPerson && (
        <SalespersonPickerModal
          selectedId={items[selectedRow]?.salesperson_id ?? null}
          onClose={() => setShowSalesPerson(false)}
          onSelect={(id, name) => {
            const line = items[selectedRow]
            setShowSalesPerson(false)
            if (!line) return
            setSalespeopleById(prev => ({ ...prev, [id]: name }))   // so the line label resolves immediately
            setLineSalesperson(line.id, id)
            showToast(`${line.name}: ${name}`)
          }}
        />
      )}

      {showQuotation && (
        <QuotationConfirmModal
          itemCount={items.length}
          grandTotal={grandTotal}
          onClose={() => setShowQuotation(false)}
          onConfirm={saveQuotation}
        />
      )}

      {showComp && items.length > 0 && (
        <ComplimentaryConfirmModal
          onClose={() => setShowComp(false)}
          onConfirm={(reason) => {
            items.forEach(it => applyDiscount(it.id, { type: 'PERCENTAGE', value: 100 }))
            setShowComp(false)
            showToast(reason ? `Marked complimentary — ${reason}` : 'Marked complimentary')
          }}
        />
      )}

      {showExchange && (
        <ExchangeModal userId={user?.id} onToast={showToast} onClose={() => setShowExchange(false)} />
      )}

      {showMarket && items.length > 0 && (
        <PostMarketModal items={items} onClose={() => setShowMarket(false)} onDone={(m) => showToast(m)} />
      )}

      {showDelivery && (
        <DeliveryAddressModal
          initialAddress={deliveryAddress}
          onClose={() => setShowDelivery(false)}
          onApply={(addr) => { setDeliveryAddress(addr); showToast('Delivery address attached') }}
          onClear={() => { setDeliveryAddress(null); showToast('Delivery address cleared') }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-foreground text-background text-sm shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
