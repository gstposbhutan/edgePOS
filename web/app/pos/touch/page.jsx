"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { PosHeader }       from "@/components/pos/pos-header"
import { ProductPanel }    from "@/components/pos/product-panel"
import { WeightEntryModal } from "@/components/pos/weight-entry-modal"
import { CartPanel }       from "@/components/pos/cart-panel"
import { CustomerIdModal }  from "@/components/pos/customer-id-modal"
import { CustomerOtpModal } from "@/components/pos/customer-otp-modal"
import { QuotationConfirmModal } from "@/components/pos/keyboard/quotation-confirm-modal"
import { StockGateModal }  from "@/components/pos/stock-gate-modal"
import { CreateAccountModal } from "@/components/pos/khata/create-account-modal"
import { CameraCanvas }      from "@/components/pos/camera/camera-canvas"
import { FaceCamera }        from "@/components/pos/camera/face-camera"
import { FaceConsentModal }  from "@/components/pos/face-consent-modal"
import { FaceStore }          from "@/lib/vision/face-store"
import { RestockModal }       from "@/components/pos/restock/restock-modal"
import { StartShiftModal }    from "@/components/pos/shift/start-shift-modal"
import { EndShiftModal }      from "@/components/pos/shift/end-shift-modal"
import { CashAdjustmentModal } from "@/components/pos/cash-adjustment-modal"
import { ZReportModal }       from "@/components/pos/z-report-modal"
import { SalespersonPickerModal } from "@/components/pos/keyboard/salesperson-picker-modal"
import { useCart }         from "@/hooks/use-cart"
import { useProducts }     from "@/hooks/use-products"
import { useKhata }        from "@/hooks/use-khata"
import { useOwnerStores }  from "@/hooks/use-owner-stores"
import { useShift }        from "@/hooks/use-shift"
import { getUser, getRoleClaims, signOut } from "@/lib/auth"

export default function PosPage() {
  const router   = useRouter()

  const [user,              setUser]              = useState(null)
  const [entity,            setEntity]            = useState(null)
  const [subRole,           setSubRole]           = useState('CASHIER')
  const [activeEntityId,    setActiveEntityId]    = useState(null)
  const [paymentMethod,     setPaymentMethod]     = useState(null)
  const [journalNo,        setJournalNo]         = useState('')
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [salespeopleById,   setSalespeopleById]   = useState({})     // id → name, per-line salesperson labels (#3)
  const [salespersonItemId, setSalespersonItemId] = useState(null)   // cart line awaiting a salesperson pick
  const [weighProduct,      setWeighProduct]      = useState(null)    // sold_by_weight product awaiting a weight

  // Weighed goods go through the weigh modal; everything else adds directly.
  function handleAddItem(product) {
    if (product?.sold_by_weight) { setWeighProduct(product); return }
    addItem(product)
  }
  const [checkoutLoading,   setCheckoutLoading]   = useState(false)
  const [checkoutError,     setCheckoutError]     = useState(null)
  const [stockShortfalls,   setStockShortfalls]   = useState([])
  const [cameraActive,      setCameraActive]      = useState(false)
  const [faceActive,        setFaceActive]        = useState(true)
  const [showConsent,       setShowConsent]        = useState(false)
  const [khataAccount,      setKhataAccount]      = useState(null)
  const [showCreateKhata,   setShowCreateKhata]   = useState(false)
  const [ownerOverride,     setOwnerOverride]     = useState(false)
  const [showRestock,       setShowRestock]       = useState(false)
  const [showCreditOtp,     setShowCreditOtp]     = useState(false)
  const [showQuotation,     setShowQuotation]     = useState(false)
  const [showStartShift,    setShowStartShift]    = useState(false)
  const [showEndShift,      setShowEndShift]      = useState(false)
  const [showCashAdj,       setShowCashAdj]       = useState(false)
  const [showZReport,       setShowZReport]       = useState(false)
  const [toastMsg,          setToastMsg]          = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg) {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600)
  }

  const { shift, openShift, closeShift } = useShift()

  // When the logout handover routes through "Close shift & sign out", finish the
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

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId, subRole: sr } = getRoleClaims(currentUser)
      setSubRole(sr ?? 'CASHIER')
      if (!entityId) return
      setActiveEntityId(entityId)
      const res = await fetch('/api/pos/entities')
      if (res.ok) {
        const { entity } = await res.json()
        setEntity(entity)
      }
    }
    load()
  }, [])

  const { stores: ownedStores } = useOwnerStores(user?.id, subRole)

  async function handleSwitchStore(switchEntityId) {
    const res = await fetch(`/api/pos/entities?entityId=${switchEntityId}`)
    if (res.ok) {
      const { entity } = await res.json()
      if (entity) {
        setEntity(entity)
        setActiveEntityId(switchEntityId)
      }
    }
  }

  const {
    cartId, items, customer, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal, billDiscount,
    carts, activeIndex,
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity, applyBillDiscount,
    setLineSalesperson,
    holdCart, switchCart, cancelCart,
  } = useCart(entity?.id, user?.id, 'RETAIL', (name, avail) => showToast(`Only ${avail} in stock`))

  const { products, loading: productsLoading, search } = useProducts(entity?.id)
  const { lookupAccount, createAccount } = useKhata(entity?.id)

  // Per-line rate tier: re-price a cart line at the chosen tier (retail default). Mirrors the
  // keyboard product-search toggle — the tier applies to that line only.
  function rateFor(product, mode) {
    const n = v => parseFloat(v ?? 0) || 0
    if (mode === 'WHOLESALE')   return n(product.wholesale_price)   || n(product.mrp)
    if (mode === 'DISTRIBUTOR') return n(product.distributor_price) || n(product.wholesale_price) || n(product.mrp)
    return n(product.selling_price) || n(product.mrp) || n(product.wholesale_price)
  }
  function handleSetRate(itemId, mode) {
    const line = items.find(i => i.id === itemId)
    const product = products.find(p => p.id === line?.product_id)
    if (!product) return
    overridePrice(itemId, rateFor(product, mode))
  }

  // Load the sales team once, to label each cart line's salesperson.
  useEffect(() => {
    fetch('/api/pos/salespeople')
      .then(r => r.ok ? r.json() : { salespeople: [] })
      .then(d => setSalespeopleById(Object.fromEntries((d.salespeople || []).map(s => [s.id, s.full_name || s.sub_role]))))
      .catch(() => {})
  }, [])

  // ── Stock availability check ───────────────────────────────────────────────
  async function checkStockAvailability() {
    if (!items.length) return []
    const shortfalls = []

    for (const item of items) {
      if (item.package_id) {
        const res = await fetch(`/api/pos/products?packageId=${item.package_id}`)
        if (res.ok) {
          const { available } = await res.json()
          if ((available ?? 0) < item.quantity) {
            shortfalls.push({ item, available: available ?? 0, needed: item.quantity })
          }
        }
      } else if (item.product_id) {
        if (item.batch_id) {
          const res = await fetch(`/api/pos/products?batchId=${item.batch_id}`)
          if (res.ok) {
            const { batch } = await res.json()
            if ((batch?.quantity ?? 0) < item.quantity) {
              shortfalls.push({ item, available: batch?.quantity ?? 0, needed: item.quantity, batchNumber: batch?.batch_number })
            }
          }
        } else {
          const res = await fetch(`/api/pos/products?productId=${item.product_id}`)
          if (res.ok) {
            const { product } = await res.json()
            if ((product?.current_stock ?? 0) < item.quantity) {
              shortfalls.push({ item, available: product?.current_stock ?? 0, needed: item.quantity })
            }
          }
        }
      }
    }

    return shortfalls
  }

  // ── Checkout flow ──────────────────────────────────────────────────────────
  async function handleCheckout() {
    // Shifts are optional — no shift gate (opening a shift for cash reconciliation is opt-in).

    // ONLINE: journal number is required
    if (paymentMethod === 'ONLINE' && !(journalNo || '').trim()) {
      setCheckoutError('Enter the journal number from customer\'s payment confirmation')
      return
    }

    if (!customer?.whatsapp && !customer?.buyerHash) {
      setShowCustomerModal(true)
      return
    }

    // CREDIT: must verify customer identity via email OTP every time
    if (paymentMethod === 'CREDIT') {
      if (!customer?.whatsapp) { setShowCustomerModal(true); return }
      setShowCreditOtp(true)
      return
      // Flow continues in handleCreditOtpVerified after OTP succeeds
    }

    await initiateCheckout()
  }

  // Called when the customer completes EMAIL OTP verification for CREDIT payment.
  // Credit identity is keyed by email (WhatsApp dropped).
  async function handleCreditOtpVerified(email) {
    setShowCreditOtp(false)

    // Khata lookup by email — auto-create if new customer
    let { account } = await lookupAccount({ email })

    if (!account) {
      const customerName = customer?.name || `Customer ${(customer?.whatsapp || '').slice(-4)}`
      const { account: newAccount, error: createErr } = await createAccount({
        party_type:   'CONSUMER',
        debtor_email: email,
        debtor_phone: customer?.whatsapp || null,
        debtor_name:  customerName,
        credit_limit: 1000, // default limit — manager can adjust later
      })

      if (createErr) {
        setCheckoutError('Failed to create khata account: ' + createErr)
        return
      }
      account = newAccount
    }

    setKhataAccount(account)

    // Credit limit check
    const balance = parseFloat(account.outstanding_balance)
    const limit   = parseFloat(account.credit_limit)
    if (balance + grandTotal > limit && !ownerOverride) {
      if (subRole === 'OWNER' || subRole === 'ADMIN') {
        setCheckoutError(`Credit limit exceeded (Nu. ${balance.toFixed(2)} / Nu. ${limit.toFixed(2)}). Tap checkout again to override.`)
        setOwnerOverride(true)
        return
      }
      setCheckoutError(`Credit limit exceeded. Outstanding: Nu. ${balance.toFixed(2)}, Limit: Nu. ${limit.toFixed(2)}`)
      return
    }

    await initiateCheckout()
  }

  async function initiateCheckout() {
    setCheckoutLoading(true)
    setCheckoutError(null)

    // Stock gate — check before creating any order
    const shortfalls = await checkStockAvailability()
    if (shortfalls.length > 0) {
      setStockShortfalls(shortfalls)
      setCheckoutLoading(false)
      return
    }

    await processCheckout()
  }

  async function handleRestockComplete() {
    // Re-check after restock — if all resolved, continue checkout
    const shortfalls = await checkStockAvailability()
    setStockShortfalls(shortfalls)
    if (shortfalls.length === 0) await processCheckout()
  }

  // Save the cart as a DRAFT sell-side document (Sales Order or Quotation) — no payment,
  // no stock move. Mirrors the keyboard POS "Save as draft" (Alt+Q).
  async function saveDraft(isQuotation) {
    if (!cartId || items.length === 0) return
    setCheckoutLoading(true); setCheckoutError(null)
    try {
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            product_id: item.product_id, package_id: item.package_id ?? null,
            batch_id: item.batch_id ?? null,
            package_name: item.package_id ? item.name : null,
            package_type: item.package_def?.package_type ?? null,
            sku: item.sku, name: item.name, quantity: item.quantity,
            unit_price: item.unit_price, discount: item.discount ?? 0,
            discount_type: item.discount_type || 'FLAT', discount_value: item.discount_value ?? 0,
            gst_5: item.gst_5, total: item.total,
          })),
          subtotal, gstTotal, grandTotal, billDiscount,
          customerWhatsapp: customer?.whatsapp ?? null,
          buyerHash: customer?.buyerHash ?? null,
          cartId, quotation: true, isQuotation: !!isQuotation,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setShowQuotation(false)
      await clearCart()
      setPaymentMethod(null); setJournalNo('')
      router.push(`/pos/order/${data.order.id}`)
    } catch (err) {
      setCheckoutError(err.message); setShowQuotation(false)
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function processCheckout() {
    if (!cartId || !paymentMethod || items.length === 0) return
    setCheckoutLoading(true)
    setCheckoutError(null)

    try {
      // order_no + digital signature are issued server-side now (parity P1-2) —
      // the client no longer generates a (collision-prone) random serial.
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            product_id:   item.product_id,
            package_id:   item.package_id   ?? null,
            batch_id:     item.batch_id     ?? null,
            package_name: item.package_id   ? item.name : null,
            package_type: item.package_def?.package_type ?? null,
            sku:          item.sku,
            name:         item.name,
            quantity:     item.quantity,
            unit_price:   item.unit_price,
            discount:       item.discount ?? 0,
            discount_type:  item.discount_type || 'FLAT',
            discount_value: item.discount_value ?? 0,
            gst_5:        item.gst_5,
            total:        item.total,
          })),
          subtotal,
          gstTotal,
          grandTotal,
          billDiscount,
          paymentMethod,
          paymentRef: journalNo?.trim() || null,
          customerWhatsapp: customer?.whatsapp ?? null,
          buyerHash: customer?.buyerHash ?? null,
          cartId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        // If the server reported a stock issue, re-check to show the stock gate
        if (data.error?.includes('stock') || data.error?.includes('Stock')) {
          const shortfalls = await checkStockAvailability()
          setStockShortfalls(shortfalls)
        }
        throw new Error(data.error)
      }

      const order = data.order

      await clearCart()
      setPaymentMethod(null)
      setJournalNo('')
      setKhataAccount(null)
      setOwnerOverride(false)

      // Auto-send receipt via WhatsApp gateway (fire-and-forget)
      if (customer?.whatsapp) {
        const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
        fetch(`${gatewayUrl}/api/send-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: customer.whatsapp,
            invoiceId: order.id,
            orderNo: order.order_no,
            entityName: entity?.name,
            grandTotal,
            gstTotal,
          }),
        }).catch(() => {}) // ignore failures
      }

      router.push(`/pos/order/${order.id}?success=true`)

    } catch (err) {
      setCheckoutError(err.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handleFaceIdentified(profile) {
    await setCustomerIdentity({ whatsapp: profile.whatsapp_no, buyerHash: profile.id })
  }

  async function handleFaceEnroll(params) {
    const store = new FaceStore()
    return store.enroll({ entityId: entity?.id, ...params })
  }

  async function handleCustomerIdentified(whatsapp) {
    await setCustomerIdentity({ whatsapp, buyerHash: null })
    setShowCustomerModal(false)

    // CREDIT requires WhatsApp OTP verification before we touch the khata
    // ledger. Route through the same OTP gate as handleCheckout uses for
    // an already-identified customer — without this, initiateCheckout
    // skips the credit-limit check in handleCreditOtpVerified and the
    // DB trigger khata_debit_on_confirm rejects the order.
    if (paymentMethod === 'CREDIT') {
      setShowCreditOtp(true)
      return
    }

    await initiateCheckout()
  }

  async function handleCreateKhata(data) {
    const result = await createAccount(data)
    if (!result.error) {
      setKhataAccount(result.account)
      setShowCreateKhata(false)
      await initiateCheckout()
    }
    return result
  }

  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading POS...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <PosHeader
        storeName={entity.name}
        cashierName={user?.email ?? ''}
        customer={customer}
        syncing={false}
        userSubRole={subRole}
        onEnrollFace={() => setShowConsent(true)}
        onRestock={() => setShowRestock(true)}
        ownedStores={ownedStores}
        onSwitchStore={handleSwitchStore}
        shift={shift}
        currentUserId={user?.id}
        onCloseShiftAndSignOut={() => { pendingSignOutRef.current = true; closedOkRef.current = false; setShowEndShift(true) }}
        onStartShift={() => setShowStartShift(true)}
        onEndShift={() => setShowEndShift(true)}
        onCashAdj={() => setShowCashAdj(true)}
        onZReport={() => setShowZReport(true)}
        faceCamera={
          <FaceCamera
            entityId={entity?.id}
            active={faceActive}
            onIdentified={handleFaceIdentified}
            onUnidentified={() => {}}
          />
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left — Camera + Products */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col border-r border-border">
          {/* Camera toggle bar */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
            <button
              onClick={() => setCameraActive(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all
                ${cameraActive
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
            >
              📷 {cameraActive ? 'Camera On' : 'Camera Off'}
            </button>
            {cameraActive && (
              <span className="text-xs text-muted-foreground">Hold items in view to auto-add</span>
            )}
          </div>

          {/* 4K Camera canvas */}
          {cameraActive && (
            <div className="px-4 pb-3 shrink-0 h-64">
              <CameraCanvas
                active={cameraActive}
                onProductRecognized={(product) => {
                  const match = products.find(p => p.id === product.productId)
                  if (match) handleAddItem(match)
                }}
              />
            </div>
          )}

          {/* Manual product grid */}
          <div className="flex-1 p-4 pt-0 overflow-hidden flex flex-col">
            <ProductPanel
              products={products}
              loading={productsLoading}
              onSearch={search}
              onAddItem={handleAddItem}
            />
          </div>
        </div>

        <div className="w-80 lg:w-96 shrink-0 p-4 flex flex-col overflow-hidden">
          {checkoutError && (
            <div className="mb-3 p-2.5 bg-tibetan/10 border border-tibetan/30 rounded-lg">
              <p className="text-xs text-tibetan">{checkoutError}</p>
            </div>
          )}
          <CartPanel
            items={items}
            subtotal={subtotal}
            discountTotal={discountTotal}
            taxableSubtotal={taxableSubtotal}
            gstTotal={gstTotal}
            grandTotal={grandTotal}
            billDiscount={billDiscount}
            onApplyBillDiscount={applyBillDiscount}
            customer={customer}
            paymentMethod={paymentMethod}
            userSubRole={subRole}
            khataAccount={khataAccount}
            onUpdateQty={updateQty}
            onRemoveItem={removeItem}
            onApplyDiscount={applyDiscount}
            onOverridePrice={overridePrice}
            onSetRate={handleSetRate}
            onPickSalesperson={(itemId) => setSalespersonItemId(itemId)}
            salespeopleById={salespeopleById}
            onSelectPayment={(m) => { setPaymentMethod(m); setJournalNo('') }}
            journalNo={journalNo}
            onJournalNoChange={setJournalNo}
            onCheckout={handleCheckout}
            onSaveDraft={() => setShowQuotation(true)}
            checkoutLoading={checkoutLoading}
            carts={carts}
            activeIndex={activeIndex}
            onHoldCart={holdCart}
            onSwitchCart={switchCart}
            onCancelCart={cancelCart}
          />
        </div>
      </div>

      <FaceConsentModal
        open={showConsent}
        entityId={entity?.id}
        onEnroll={handleFaceEnroll}
        onClose={() => setShowConsent(false)}
      />

      <CustomerIdModal
        open={showCustomerModal}
        onIdentify={handleCustomerIdentified}
        onClose={() => setShowCustomerModal(false)}
      />

      <CustomerOtpModal
        open={showCreditOtp}
        onVerified={handleCreditOtpVerified}
        onClose={() => setShowCreditOtp(false)}
      />

      {showQuotation && (
        <QuotationConfirmModal
          itemCount={items.length}
          grandTotal={grandTotal}
          onConfirm={saveDraft}
          onClose={() => setShowQuotation(false)}
        />
      )}

      <StockGateModal
        open={stockShortfalls.length > 0}
        shortfalls={stockShortfalls}
        entityId={entity?.id}
        onRestock={handleRestockComplete}
        onRemoveItem={(itemId) => {
          removeItem(itemId)
          setStockShortfalls(prev => prev.filter(s => s.item.id !== itemId))
        }}
        onClose={() => setStockShortfalls([])}
      />

      <CreateAccountModal
        open={showCreateKhata}
        onClose={() => setShowCreateKhata(false)}
        onCreate={handleCreateKhata}
        defaultPhone={customer?.whatsapp ?? ''}
      />

      <RestockModal
        open={showRestock}
        onClose={() => setShowRestock(false)}
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

      {weighProduct && (
        <WeightEntryModal
          key={weighProduct.id}
          open
          product={weighProduct}
          onConfirm={(w) => { addItem(weighProduct, undefined, w); setWeighProduct(null) }}
          onClose={() => setWeighProduct(null)}
        />
      )}

      {salespersonItemId && (
        <SalespersonPickerModal
          selectedId={items.find(i => i.id === salespersonItemId)?.salesperson_id ?? null}
          onClose={() => setSalespersonItemId(null)}
          onSelect={(id, name) => {
            setSalespeopleById(prev => ({ ...prev, [id]: name }))
            setLineSalesperson(salespersonItemId, id)
            setSalespersonItemId(null)
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-foreground text-background text-sm shadow-lg pointer-events-none">
          {toastMsg}
        </div>
      )}
    </>
  )
}
