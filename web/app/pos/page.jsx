"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { resolve as resolveShortcut } from "@/lib/pos/shortcuts"
import { CartTable }          from "@/components/pos/keyboard/cart-table"
import { BatchPickerModal }   from "@/components/pos/batch-picker-modal"
import { ProductSearchModal } from "@/components/pos/keyboard/product-search-modal"
import { PaymentModal }       from "@/components/pos/keyboard/payment-modal"
import { HelpOverlay }        from "@/components/pos/keyboard/help-overlay"
import { DiscountModal }      from "@/components/pos/keyboard/discount-modal"
import { BillDiscountModal }  from "@/components/pos/keyboard/bill-discount-modal"
import { CustomerPanelModal } from "@/components/pos/keyboard/customer-panel-modal"
import { InvoiceSearchModal } from "@/components/pos/keyboard/invoice-search-modal"
import { SalespersonPickerModal } from "@/components/pos/keyboard/salesperson-picker-modal"
import { WeightEntryModal } from "@/components/pos/weight-entry-modal"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { QuotationConfirmModal } from "@/components/pos/keyboard/quotation-confirm-modal"
import { ComplimentaryConfirmModal } from "@/components/pos/keyboard/complimentary-confirm-modal"
import { ExchangeModal } from "@/components/pos/keyboard/exchange-modal"
import { PostMarketModal } from "@/components/pos/keyboard/post-market-modal"
import { DeliveryAddressModal } from "@/components/pos/keyboard/delivery-address-modal"
import { useCart }            from "@/hooks/use-cart"
import { useKhata }           from "@/hooks/use-khata"
import { getUser, getEnrichedClaims, signOut } from "@/lib/auth"
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
import { TillBar }          from "@/components/pos/keyboard/till-bar"
import { BarcodeRow, BARCODE_INPUT_ID } from "@/components/pos/keyboard/barcode-row"
import { ListingFooter }    from "@/components/pos/keyboard/listing-footer"
import { UnitSheet }        from "@/components/pos/keyboard/unit-sheet"
import { TextPromptModal }  from "@/components/pos/keyboard/text-prompt-modal"
import { OfficeMenu }       from "@/components/pos/keyboard/office-menu"
import { unitLadder, hasUnitChoice, lineFactor } from "@/lib/pos/units"
import { PRICE_LIST_LABEL, loadPriceListMode, savePriceListMode, nextPriceListMode } from "@/lib/pos/price-list"
import { printLabel, loadLabelConfig } from "@/lib/pos/labels"

// The station's GST basis preference. Per-station, like the price list: a shop that prices
// inclusive prices every bill that way, so the choice outlives one ticket.
function readGstPref() {
  try { return localStorage.getItem('pos_gst_included') === '1' } catch { return false }
}
function writeGstPref(flag) {
  try { localStorage.setItem('pos_gst_included', flag ? '1' : '0') } catch { /* private mode */ }
}

export default function KeyboardPosPage() {
  const router = useRouter()

  const [user,         setUser]         = useState(null)
  const [entity,       setEntity]       = useState(null)
  const shiftsEnabled = !!entity?.shifts_enabled   // per-vendor toggle — shift/drawer UI is hidden unless the owner enabled it
  const [subRole,      setSubRole]      = useState('CASHIER')
  const [selectedRow,  setSelectedRow]  = useState(0)
  const editRowRef = useRef(null)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [paymentOpen,   setPaymentOpen]   = useState(false)
  const [helpOpen,      setHelpOpen]      = useState(false)
  const [checkoutErr,   setCheckoutErr]   = useState(null)
  const [checkoutWarn,  setCheckoutWarn]  = useState(null)   // non-blocking (e.g. FEFO older-batch)
  const [creditOtpOpen, setCreditOtpOpen] = useState(false)
  const pendingPayment  = useRef(null)
  const [lastOrderNo,  setLastOrderNo]  = useState(null)
  const [replacingOrderNo, setReplacingOrderNo] = useState(null)   // set after a "Return & replace" — reminds the cashier to ring the replacement
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
  const [weighProduct, setWeighProduct] = useState(null)          // sold_by_weight product awaiting a weight
  const [batchPickItem, setBatchPickItem] = useState(null)        // cart line whose batch is being overridden
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
  // Alt+P — the active price tier. Persisted per station, like the terminal's.
  const [priceListMode, setPriceListMode] = useState('RETAIL')
  const [unitSheet, setUnitSheet] = useState(null)          // { itemId, resumeRate } — Alt+U
  const [remarkPrompt, setRemarkPrompt] = useState(null)    // { itemId, name, initial } — Ctrl+T
  const [labelPrompt, setLabelPrompt] = useState(null)      // { line } — Ctrl+B, how many labels
  const [officeOpen, setOfficeOpen] = useState(false)       // Alt+O — the back office, on a full-screen till
  // Ctrl+Z — what the last removal took off the ticket, so it can be put back.
  const undoStack = useRef([])

  useEffect(() => { setPriceListMode(loadPriceListMode()) }, [])


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
    addItem, updateQty, changeBatch, removeItem, clearCart, setCustomerIdentity, applyDiscount, applyBillDiscount,
    repriceCart, setLineSalesperson, setLineUnit, setLineRemark, setGstIncluded, overridePrice,
    gstIncluded,
    holdCart, switchCart, cancelCart,
  } = useCart(
    entity?.id, user?.id, priceListMode,
    // The cap is stated in whatever unit the line is being rung in — "only 2 in stock" has to
    // mean 2 cartons on a carton line, or the cashier reads it as loose pieces.
    (name, avail) => showToast(`Only ${avail} in stock`),
  )

  // The GST basis lives on the ticket (the server writes every line's tax from it), but the
  // CHOICE is a property of the shop: a store that prices inclusive prices every bill that way.
  // Remember it per station and apply it to each fresh, empty ticket, so Alt+T is pressed once
  // rather than once per customer.
  useEffect(() => {
    if (!cartId || items.length > 0) return
    const want = readGstPref()
    if (want !== gstIncluded) setGstIncluded(want)
  }, [cartId, items.length, gstIncluded, setGstIncluded])

  const { accounts, lookupAccount, createAccount } = useKhata(entity?.id)

  useEffect(() => {
    if (items.length === 0) { setSelectedRow(0); return }
    if (selectedRow >= items.length) setSelectedRow(items.length - 1)
    else if (items.length === 1) setSelectedRow(0)
  }, [items.length])

  // Every sheet that owns the keyboard while it is up: the ticket's own bindings stand down and
  // the barcode row stops reclaiming focus until the last one closes.
  const anyModalOpen = searchOpen || paymentOpen || helpOpen || showCustomerPanel || showDiscount ||
    showBillDiscount || showInvoiceSearch || showSalesPerson || showQuotation || showComp ||
    showExchange || showMarket || showDelivery || showHandover || showReceipt || showStartShift ||
    showEndShift || showCashAdj || showZReport || creditOtpOpen || officeOpen ||
    !!weighProduct || !!batchPickItem || !!unitSheet || !!remarkPrompt || !!labelPrompt

  useEffect(() => {
    function handleKeyDown(e) {
      if (anyModalOpen) return

      // The barcode row holds the caret continuously (spec WF-01), so it is a deliberate
      // exception: the ticket's keys still reach it from inside the field, which is what lets
      // ↑↓ move the highlighted line while a scan is being typed. Every other field (the inline
      // qty / rate editor) keeps its keys to itself.
      const target = document.activeElement
      const inBarcode = target?.id === BARCODE_INPUT_ID
      if (!inBarcode && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return
      // While there is text in the barcode row, Enter submits it and Delete edits it — both
      // belong to the field, not to the ticket.
      const barcodeHasText = inBarcode && target.value.length > 0
      if (barcodeHasText && (e.key === 'Enter' || e.key === 'Delete')) return

      // --- Commands: the Counter key map (lib/pos/shortcuts.js is the source of truth) ---
      const isManager = ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)
      const line = items[selectedRow] || null
      const hit = resolveShortcut(e)
      if (hit) {
        e.preventDefault()
        // A key the spec reserves but whose action we have not built says so, rather than
        // silently doing nothing under a reflex the cashier trusts. Nothing carries this today.
        if (hit.todo) { showToast(`${hit.combo} ${hit.label} — not built yet`); return }

        const needLine  = () => { if (line) return true; showToast('Select a product line first'); return false }
        const needItems = () => { if (items.length) return true; showToast('Add items first'); return false }

        switch (hit.id) {
          case 'help':          setHelpOpen(true); break
          case 'date':          setShowDateOverride(true); break

          case 'qtyUp':         if (needLine()) updateQty(line.id, line.quantity + 1); break
          // Less-quantity stops at 1 and removes the line below that, which is what a cashier
          // stepping a mis-scan back down expects.
          case 'qtyDown':       if (needLine()) { if (line.quantity > 1) updateQty(line.id, line.quantity - 1); else removeLine(line) } break
          case 'qtyFocus':      if (needLine()) editRowRef.current?.(selectedRow); break
          case 'rate':          if (needLine()) editRowRef.current?.(selectedRow, 'rate'); break
          case 'unitSheet':     if (needLine()) openUnitSheet(selectedRow); break
          case 'itemRemark':    if (needLine()) openRemarkPrompt(selectedRow); break
          case 'itemDiscount':  if (needLine()) setShowDiscount(true); break
          case 'complimentary': if (!isManager) showToast('Complimentary is manager-only'); else if (needItems()) setShowComp(true); break
          case 'removeLine':    voidSelected(); break
          case 'undo':          undoLast(); break

          case 'productInfo':
          case 'products':      openSearch(''); break
          case 'customerInfo':
          case 'party':         setShowCustomerPanel(true); break
          case 'salesperson':   if (needLine()) setShowSalesPerson(true); break
          case 'priceList':     cyclePriceList(); break
          case 'gstIncluded':   toggleGstIncluded(); break
          case 'deliveryDetail':setShowDelivery(true); break
          case 'tender':
          case 'tenderAlt':     if (needItems()) setPaymentOpen(true); break

          case 'hold':          holdCart(); break
          case 'retrieve':      if (carts.length > 1) switchCart((activeIndex - 1 + carts.length) % carts.length); else showToast('No held ticket'); break
          case 'clearTicket':   handleNewTransaction(); break
          // Both reprint the last bill on its own serial — no new GST number is drawn.
          case 'print':
          case 'lastGst':       if (lastOrderNo) setShowReceipt(true); else showToast('No bill to reprint'); break
          case 'barcodePrn':    if (needLine()) printBarcodeLabel(selectedRow); break
          case 'exit':          setCheckoutErr(null); break
          case 'day':           dayEnd(); break
          // F12 is the browser's and cannot be cancelled, so this fires from the rail button or
          // the Ctrl+⇧L alias. Both land here.
          case 'location':
          case 'locationAlt':   showToast(entity?.name ? `Shop: ${entity.name}` : 'Shop not set'); break

          case 'billDiscount':  if (needItems()) setShowBillDiscount(true); break
          case 'quotation':     if (needItems()) setShowQuotation(true); break
          case 'exchange':      setShowExchange(true); break
          case 'postMarket':    if (needItems()) setShowMarket(true); break
          case 'zReport':       if (isManager && shiftsEnabled) setShowZReport(true); break
          case 'cashInOut':     if (isManager && shiftsEnabled) setShowCashAdj(true); break
          case 'office':        setOfficeOpen(true); break
          default: break
        }
        return
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
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r + 1) % items.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); if (items.length > 0) setSelectedRow(r => (r - 1 + items.length) % items.length); return }
      if (e.key === 'Enter' && items.length > 0) { e.preventDefault(); editRowRef.current?.(selectedRow); return }

      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const target = parseInt(e.key, 10) - 1
        if (target < carts.length) { e.preventDefault(); switchCart(target) }
        return
      }

      // Typing goes to the barcode row, which already has the caret — that is the whole point of
      // keeping it focused, and it is what stops a wedge scan losing its first characters. Only
      // when focus is elsewhere does a printable character fall back to opening the picker.
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (inBarcode) return
        e.preventDefault()
        openSearch(e.key)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // checkoutErr must be a dep: handleNewTransaction (Ctrl+D) reads it to block clearing on a
    // stock error. Without it, the out-of-stock branch (no item added → items unchanged →
    // effect not re-run) leaves a stale closure.
  }, [anyModalOpen, items, selectedRow, carts, activeIndex, subRole, checkoutErr, shiftsEnabled,
      lastOrderNo, entity?.name, priceListMode, gstIncluded, updateQty, removeItem])

  // Suppress the BROWSER's own function-key actions across the whole till, in the capture phase
  // and independently of the handler above — that one returns early whenever a sheet is open or
  // focus sits in a field, which left F5 reloading the page mid-sale and F3 opening the find bar.
  // (The cart itself survives a reload — it is server-side — but the open sheet, the typed query,
  // the selected row and any uncommitted qty edit do not, in front of a waiting customer.)
  // preventDefault in capture does not stop propagation, so every binding above still runs.
  // F11 IS cancellable in Chrome/Edge (the terminal's browsers), so Day keeps its inherited key
  // and fullscreen does not fire underneath it. F12 is NOT cancellable anywhere — it belongs to
  // the devtools — so Location carries the Ctrl+⇧L alias instead of a key that cannot arrive.
  useEffect(() => {
    function swallowBrowserFnKeys(e) {
      if (/^F([1-9]|10|11)$/.test(e.key)) e.preventDefault()
    }
    document.addEventListener('keydown', swallowBrowserFnKeys, true)
    return () => document.removeEventListener('keydown', swallowBrowserFnKeys, true)
  }, [])

  function showToast(msg) {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }

  // Alt+Q — save the cart as a DRAFT sell-side document (SALES_ORDER/DRAFT): a Sales Order
  // (committed) or a Quotation (non-binding). No payment, no stock move. Clears the cart
  // on success like a completed sale.
  async function saveDraft(isQuotation) {
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
          isQuotation: !!isQuotation,
          salespersonId: salesPersonId ?? undefined,
          deliveryAddress: deliveryAddress || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setLastOrderNo(data.order.order_no)
      setReplacingOrderNo(null)
      await clearCart()
      setSelectedRow(0)
      setShowQuotation(false)
      showToast(`${isQuotation ? 'Quotation' : 'Sales order'} ${data.order.order_no} saved`)
    } catch (err) {
      setCheckoutErr(err.message)
      setShowQuotation(false)
    }
  }

  function openSearch(initialChar) {
    setSearchQuery(initialChar)
    setSearchOpen(true)
  }

  // Enter in the barcode row: a scanned code adds its product straight to the ticket; anything
  // that isn't a known code opens the picker already seeded with what was typed, so a cashier
  // who half-remembers a name never has to retype it.
  async function handleBarcodeEntry(value) {
    try {
      const res = await fetch(`/api/pos/products?barcode=${encodeURIComponent(value)}`)
      if (res.ok) {
        const data = await res.json()
        const first = (data.results || [])[0]
        if (first) {
          handleProductAdd({
            product_id: first.products.id,
            id:         first.products.id,
            name:       first.products.name,
            sku:        first.products.sku,
            unit:       first.products.unit,
            mrp:        first.mrp ?? first.products.mrp,
            selling_price: first.selling_price ?? first.products.selling_price ?? first.mrp,
            wholesale_price:   first.products.wholesale_price,
            distributor_price: first.products.distributor_price,
            sold_by_weight:    first.products.sold_by_weight,
            available_stock:   first.quantity,
            batch_id:     first.id,
            batch_number: first.batch_number,
            expires_at:   first.expires_at,
            stock_rotation:        first.products.stock_rotation,
            has_older_batch:       first.has_older_batch,
            earliest_batch_expiry: first.earliest_batch_expiry,
          }, 1, priceListMode)
          return
        }
      }
    } catch { /* fall through to the picker */ }
    openSearch(value)
  }

  // Removing a line remembers what it was, so Ctrl+Z can put it back. The stack holds the
  // payload `addItem` needs rather than the cart row, because the row's id dies with it.
  function removeLine(line) {
    if (!line) return
    undoStack.current.push({
      id:         line.product_id,
      product_id: line.product_id,
      name:       line.name,
      sku:        line.sku,
      unitPrice:  parseFloat(line.unit_price),
      quantity:   line.quantity,
      batch_id:   line.batch_id,
      unit_label: line.unit_label,
      unit_factor: line.unit_factor,
    })
    removeItem(line.id)
  }

  // Ctrl+Z — put back the last line the cashier took off. Only removals are undoable: a
  // quantity or rate edit is visible on the ticket and can simply be retyped, while a line that
  // has vanished is the one a cashier cannot reconstruct mid-queue.
  async function undoLast() {
    const last = undoStack.current.pop()
    if (!last) { showToast('Nothing to undo'); return }
    const restored = await addItem(last, priceListMode)
    if (!restored) { showToast('Could not restore the line'); return }
    // Put it back as it was, not merely back on the ticket: the unit it was rung in first (which
    // re-rates from the price per piece), then the exact rate it carried, which may have been
    // overridden by hand.
    if (Number(last.unit_factor) > 1) {
      await setLineUnit(restored.id, { label: last.unit_label, factor: Number(last.unit_factor) })
    }
    if (Number.isFinite(last.unitPrice) && Math.abs(last.unitPrice - parseFloat(restored.unit_price)) > 0.001) {
      await overridePrice(restored.id, last.unitPrice)
    }
    showToast(`Restored ${last.name}`)
  }

  // ── Alt+U — the Pcs / Pack / Case sheet ─────────────────────────────────────────────────
  // Returns whether it opened, so the Enter cycle can fall straight through to the rate step on
  // an item that has no ladder rather than stalling on a sheet with one row.
  function openUnitSheet(index, resumeRate = false) {
    const line = items[index]
    if (!line) { showToast('Select a product line first'); return false }
    if (!hasUnitChoice(line.product)) {
      showToast(`${line.name} — sold in ${line.product?.unit || 'Pcs'} only, no pack size set`)
      return false
    }
    setUnitSheet({ itemId: line.id, resumeRate })
    return true
  }

  function closeUnitSheet() {
    setUnitSheet(sheet => {
      // The cycle resumes at the rate step whether or not a level was chosen — Esc means "not
      // this unit", not "stop editing the line".
      if (sheet?.resumeRate) {
        const at = items.findIndex(i => i.id === sheet.itemId)
        if (at >= 0) setTimeout(() => editRowRef.current?.(at, 'rate'), 0)
      }
      return null
    })
  }

  async function applyUnitLevel(level) {
    if (!unitSheet) return
    const res = await setLineUnit(unitSheet.itemId, { label: level.label, factor: level.factor })
    if (res?.error) showToast(res.error)
    closeUnitSheet()
  }

  // ── Ctrl+T — the line's remark ──────────────────────────────────────────────────────────
  function openRemarkPrompt(index) {
    const line = items[index]
    if (!line) { showToast('Select a product line first'); return }
    setRemarkPrompt({ itemId: line.id, name: line.name, initial: line.remark || '' })
  }

  // ── Alt+T — GST-included basis ──────────────────────────────────────────────────────────
  // The basis belongs to the ticket, so the server owns it: it writes every line's tax from it
  // and refuses to change it once lines exist. A bill half-rung one way and half the other is
  // not something a cashier can create by accident.
  async function toggleGstIncluded() {
    const next = !gstIncluded
    // Write the station preference BEFORE the server call. The effect above keeps a fresh ticket
    // on the station's basis; if it re-ran while the preference still said the old value it would
    // flip the ticket straight back, and the key would look dead.
    const prev = readGstPref()
    writeGstPref(next)
    const res = await setGstIncluded(next)
    if (res?.error) { writeGstPref(prev); showToast(res.error); return }
    showToast(next ? 'Rates now include GST (extracted)' : 'GST added to the rate (exclusive)')
  }

  // ── Alt+P — the price list ──────────────────────────────────────────────────────────────
  async function cyclePriceList() {
    const next = nextPriceListMode(priceListMode)
    setPriceListMode(next)
    savePriceListMode(next)
    // Existing lines move to the new tier too — a single GST bill priced from two different
    // lists is exactly the kind of thing a cashier cannot spot on the printout.
    if (items.length > 0) await repriceCart(next)
    showToast(`Price list: ${PRICE_LIST_LABEL[next]}${items.length ? ` · ${items.length} line${items.length > 1 ? 's' : ''} repriced` : ''}`)
  }

  // ── Ctrl+B — barcode labels for the highlighted line ────────────────────────────────────
  function printBarcodeLabel(index) {
    const line = items[index]
    if (!line) { showToast('Select a product line first'); return }
    setLabelPrompt({ line })
  }

  function doPrintLabels(line, raw) {
    const copies = parseInt(raw, 10)
    setLabelPrompt(null)
    if (!Number.isFinite(copies)) return
    // Clamp rather than trust: a mistyped 500 sends a roll of labels through the printer with no
    // way to stop it, and the print dialog gives no other confirmation step.
    const n = Math.min(50, Math.max(1, copies))
    const ok = printLabel({
      name:    line.name,
      sku:     line.sku,
      barcode: line.product?.barcode,
      mrp:     line.product?.mrp ?? parseFloat(line.unit_price),
      unit:    line.product?.unit,
    }, loadLabelConfig(), n)
    showToast(ok ? `Printing ${n} label${n > 1 ? 's' : ''}` : 'The browser blocked the print window — allow pop-ups for this site')
  }

  // ── F11 — day end ───────────────────────────────────────────────────────────────────────
  function dayEnd() {
    if (!shiftsEnabled) { showToast('Shifts are off for this store'); return }
    // Closing the drawer on an open ticket would strand it, so the cashier is told rather than
    // losing what is on screen.
    if (items.length > 0) { showToast('Finish or hold the ticket before day-end'); return }
    if (!shift) { showToast('No open shift'); return }
    setShowEndShift(true)
  }

  function voidSelected() {
    if (items[selectedRow]) {
      removeLine(items[selectedRow])
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
    setCheckoutWarn(null)
  }

  function handleCancelCart(index) {
    if (checkoutErr) { showToast('Resolve the stock error first — remove the item or complete the sale'); return }
    cancelCart(index)
  }

  function switchToTouch() {
    localStorage.setItem('pos_layout_mode', 'touch')
    router.push('/pos/touch')
  }

  async function handleProductAdd(product, qty = 1, mode) {
    const batchQty = product.available_stock ?? Infinity
    // Lines start with no salesperson; the cashier assigns one per line via F8 (per-product #3).

    // Weighed goods: route through the weigh modal (enter the measured amount) instead of qty 1.
    if (product.sold_by_weight) { setWeighProduct(product); return }

    // One batch can't cover the quantity → auto-split across batches in FEFO/FIFO order.
    // Each sub-line keeps its own batch selling price (old stock sells at its old price).
    if (product.batch_id && qty > batchQty) {
      try {
        const res = await fetch(`/api/pos/allocate?product=${product.id}&qty=${qty}`)
        const data = await res.json()
        if (res.ok && data.allocation?.length) {
          for (const row of data.allocation) {
            addItem({
              ...product,
              batch_id:        row.batch_id,
              batch_number:    row.batch_number,
              selling_price:   row.selling_price,
              expires_at:      row.expires_at,
              available_stock: row.quantity,
              quantity:        row.quantity,
            }, mode)
          }
          setSelectedRow(items.length)
          if (data.insufficient) {
            setCheckoutErr(`Only ${qty - data.short} of ${qty} units in stock for "${product.name}". Added what's available.`)
            setCheckoutWarn(null)
          } else {
            setCheckoutErr(null)
            setCheckoutWarn(
              data.allocation.length > 1
                ? `Split "${product.name}" (${qty}) across ${data.allocation.length} batches${data.rotation === 'NONE' ? '.' : ` — ${data.rotation}, oldest first.`}`
                : null
            )
          }
          return
        }
      } catch { /* fall through to single-batch behaviour */ }

      // Fallback (allocation unavailable): add what the picked batch holds.
      if (batchQty > 0) {
        addItem({ ...product, quantity: batchQty }, mode)
        setSelectedRow(items.length)
        setCheckoutErr(`Only ${batchQty} units available in batch "${product.batch_number || product.batch_id.slice(0, 8)}". Added ${batchQty}.`)
      } else {
        setCheckoutErr(`Batch "${product.batch_number || product.batch_id.slice(0, 8)}" is out of stock.`)
      }
      return
    }

    // Fits within the chosen batch.
    addItem({ ...product, quantity: qty }, mode)
    setSelectedRow(items.length)

    // FEFO rotation nudge (non-blocking): the cashier picked a batch that isn't the soonest-expiring.
    if (product.stock_rotation === 'FEFO' && product.has_older_batch && product.expires_at) {
      const older = product.earliest_batch_expiry
        ? new Date(product.earliest_batch_expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null
      setCheckoutWarn(
        `FEFO: "${product.name}" — an older batch${older ? ` (expires ${older})` : ''} should sell first. Added anyway; switch batches if you can.`
      )
    } else {
      setCheckoutWarn(null)
    }
  }

  // Increasing a batch line past its stock → cap it (server does) and auto-split the overflow
  // across the product's other batches (FEFO/FIFO, oldest first), each new line at its batch price.
  async function handleQtyChange(itemId, newQty) {
    const item = items.find(i => i.id === itemId)
    if (!item?.batch_id || !item?.product_id) { updateQty(itemId, newQty); return }

    const result = await updateQty(itemId, newQty)   // server clamps to this batch's stock
    if (!result?.capped || result.available == null || newQty <= result.available) return

    const overflow = newQty - result.available
    try {
      const res = await fetch(`/api/pos/allocate?product=${item.product_id}&qty=${overflow}&exclude=${item.batch_id}`)
      const data = await res.json()
      if (res.ok && data.allocation?.length) {
        const p = data.product
        for (const row of data.allocation) {
          addItem({
            id: p.id, product_id: p.id, name: p.name, sku: p.sku, unit: p.unit,
            sold_by_weight: p.sold_by_weight, gst_exempt: p.gst_exempt,
            mrp: p.mrp, wholesale_price: p.wholesale_price, distributor_price: p.distributor_price,
            selling_price: row.selling_price, batch_id: row.batch_id, batch_number: row.batch_number,
            expires_at: row.expires_at, available_stock: row.quantity, quantity: row.quantity,
          })
        }
        setCheckoutWarn(`Split "${item.name}" across batches${data.rotation === 'NONE' ? '.' : ` — ${data.rotation}, oldest first.`}`)
      }
      if (data.insufficient) setCheckoutErr(`Not enough stock across batches for "${item.name}".`)
    } catch { /* leave the line capped */ }
  }

  async function handlePaymentConfirm({ method, received, journalNo, creditAccount }) {
    setPaymentOpen(false)
    setCheckoutErr(null)

    if (!cartId || items.length === 0) return

    if (method === 'CREDIT') {
      // Customer is picked/added inline in the payment modal now (no separate OTP step) —
      // put the sale on their khata by stamping the order's buyer to the account's phone.
      if (!creditAccount) { setCheckoutErr('Select a credit customer'); return }
      setCustomerIdentity({ whatsapp: creditAccount.debtor_phone, buyerHash: null })
      setSelectedCustomer(creditAccount)
      await processPayment({ method, received, journalNo, buyerWhatsapp: creditAccount.debtor_phone })
      return
    }

    await processPayment({ method, received, journalNo })
  }

  // Credit identity is keyed by email now (WhatsApp dropped).
  async function handleCreditOtpVerified(email) {
    setCreditOtpOpen(false)

    let { account } = await lookupAccount({ email })
    if (!account) {
      const { account: newAccount } = await createAccount({
        party_type:   'CONSUMER',
        debtor_email: email,
        debtor_phone: customer?.whatsapp || null,
        debtor_name:  customer?.name ?? `Customer ${(customer?.whatsapp || email).slice(-4)}`,
        credit_limit: 1000,
      })
      account = newAccount
    }

    if (pendingPayment.current) {
      await processPayment(pendingPayment.current)
      pendingPayment.current = null
    }
  }

  async function processPayment({ method, received, journalNo, buyerWhatsapp }) {
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
          customerWhatsapp: buyerWhatsapp ?? customer?.whatsapp ?? null,
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
      setReplacingOrderNo(null)
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
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-serif font-bold leading-none truncate">{entity.name}</p>
            <p className="text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          <button
            onClick={() => setShowCustomerPanel(true)}
            title="Customer (F9)"
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
          {/* Top bar = ACTIONS only. The counter is full-screen (it is a till, not a console),
              so page navigation is the Office letter menu rather than a sidebar. */}
          <Button
            variant="ghost"
            size="sm"
            title="Office — back office [Alt+O]"
            onClick={() => setOfficeOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4 mr-1.5" />
            Office
          </Button>
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon-sm"
            title="Switch to Touch Mode"
            onClick={switchToTouch}
            className="text-muted-foreground hover:text-foreground"
          >
            <Hand className="h-4 w-4" />
          </Button>
          {shiftsEnabled && ['MANAGER', 'OWNER', 'ADMIN'].includes(subRole) && (
            <div className="flex items-center gap-0.5 mr-1">
              <Button variant="ghost" size="icon-sm" title="Cash In/Out [Ctrl+Shift+X]" onClick={() => setShowCashAdj(true)} className="text-muted-foreground hover:text-foreground">
                <Wallet className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" title="Z-Report [Ctrl+Shift+Z]" onClick={() => setShowZReport(true)} className="text-muted-foreground hover:text-foreground">
                <ClipboardList className="h-4 w-4" />
              </Button>
            </div>
          )}
          {shiftsEnabled && <ShiftStatusBadge shift={shift} onStart={() => setShowStartShift(true)} onEnd={() => setShowEndShift(true)} />}
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

      {replacingOrderNo && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-sm text-amber-700 font-medium shrink-0 flex items-center justify-between gap-3">
          <span>↔ Replacing {replacingOrderNo} — add the replacement item(s) and check out. The price difference is settled at payment.</span>
          <button onClick={() => setReplacingOrderNo(null)} className="text-amber-700/70 hover:text-amber-700 text-xs underline shrink-0">dismiss</button>
        </div>
      )}

      {checkoutErr && (
        <div className="px-4 py-2 bg-tibetan/10 border-b border-tibetan/30 text-sm text-tibetan shrink-0">
          {checkoutErr}
        </div>
      )}

      {checkoutWarn && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-sm text-amber-700 dark:text-amber-400 shrink-0 flex items-start justify-between gap-3">
          <span>⚠ {checkoutWarn}</span>
          <button onClick={() => setCheckoutWarn(null)} className="shrink-0 text-xs underline opacity-80 hover:opacity-100">Dismiss</button>
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
            title="Hold cart & start new [Ctrl+H]"
          >
            + Hold
          </button>
        </div>
      )}

      <TillBar
        title="Counter"
        ready={!!cartId}
        buyer={selectedCustomer?.debtor_name ?? customer?.whatsapp}
        gstIncluded={gstIncluded}
        priceList={PRICE_LIST_LABEL[priceListMode]}
        hint="F1 Help · Alt+O Office"
      />

      <BarcodeRow
        disabled={anyModalOpen}
        onSubmit={handleBarcodeEntry}
      />

      <CartTable
        items={items}
        onUpdateQty={handleQtyChange}
        onOverridePrice={overridePrice}
        onRemoveItem={(id) => removeLine(items.find(i => i.id === id))}
        onChangeBatch={setBatchPickItem}
        selectedRow={selectedRow}
        onSelectRow={setSelectedRow}
        onEditRequest={editRowRef}
        // Editing done — the caret goes back to the barcode row, so the next scan lands in it.
        onEditEnd={() => document.getElementById(BARCODE_INPUT_ID)?.focus()}
        onUnitStep={(index) => openUnitSheet(index, true)}
        salespeopleById={salespeopleById}
      />

      <ListingFooter
        itemCount={items.length}
        subtotal={subtotal}
        billDiscount={billDiscount}
        gstTotal={gstTotal}
        grandTotal={grandTotal}
        gstIncluded={gstIncluded}
      />

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
        accounts={accounts}
        onCreateCustomer={async ({ name, phone }) => {
          const { account, error } = await createAccount({
            party_type: 'CONSUMER',
            debtor_name: name,
            debtor_phone: phone,
            credit_limit: 1000,
          })
          return { account, error }
        }}
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

      {weighProduct && (
        <WeightEntryModal
          key={weighProduct.id}
          open
          product={weighProduct}
          onConfirm={(w) => { addItem(weighProduct, undefined, w); setWeighProduct(null); setSelectedRow(items.length) }}
          onClose={() => setWeighProduct(null)}
        />
      )}

      {batchPickItem && (
        <BatchPickerModal
          open
          productId={batchPickItem.product_id}
          productName={batchPickItem.name}
          currentBatchId={batchPickItem.batch_id}
          onSelect={(batchId) => changeBatch(batchPickItem.id, batchId)}
          onClose={() => setBatchPickItem(null)}
        />
      )}

      {showQuotation && (
        <QuotationConfirmModal
          itemCount={items.length}
          grandTotal={grandTotal}
          onClose={() => setShowQuotation(false)}
          onConfirm={saveDraft}
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
        <ExchangeModal
          userId={user?.id}
          onToast={showToast}
          onClose={() => setShowExchange(false)}
          onReplace={(o) => { clearCart(); setSelectedRow(0); setCheckoutErr(null); setReplacingOrderNo(o.order_no) }}
        />
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

      {unitSheet && (() => {
        const line = items.find(i => i.id === unitSheet.itemId)
        if (!line) return null
        return (
          <UnitSheet
            open
            levels={unitLadder(line.product)}
            currentFactor={lineFactor(line)}
            productName={line.name}
            // On-hand in PIECES — the sheet floors it per level, so a shelf of 25 offers two
            // cartons of 12 and not 2.08.
            pieceStock={typeof line.product?.current_stock === 'number' ? line.product.current_stock : null}
            onSelect={applyUnitLevel}
            onClose={closeUnitSheet}
          />
        )
      })()}

      {remarkPrompt && (
        <TextPromptModal
          open
          title="Item remark"
          label={`A note against ${remarkPrompt.name}. It prints beside the line on the slip.`}
          initial={remarkPrompt.initial}
          placeholder="damaged carton — sold as seen"
          onSubmit={(text) => { setLineRemark(remarkPrompt.itemId, text); setRemarkPrompt(null) }}
          onClose={() => setRemarkPrompt(null)}
        />
      )}

      {labelPrompt && (
        <TextPromptModal
          open
          title="Print barcode labels"
          label={`How many labels for ${labelPrompt.line.name}? (up to 50)`}
          initial="1"
          maxLength={2}
          onSubmit={(raw) => doPrintLabels(labelPrompt.line, raw)}
          onClose={() => setLabelPrompt(null)}
        />
      )}

      <OfficeMenu open={officeOpen} onClose={() => setOfficeOpen(false)} />

      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-foreground text-background text-sm shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
