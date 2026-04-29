"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PosHeader }       from "@/components/pos/pos-header"
import { ProductPanel }    from "@/components/pos/product-panel"
import { CartPanel }       from "@/components/pos/cart-panel"
import { CustomerIdModal }  from "@/components/pos/customer-id-modal"
import { CustomerOtpModal } from "@/components/pos/customer-otp-modal"
import { StockGateModal }  from "@/components/pos/stock-gate-modal"
import { CreateAccountModal } from "@/components/pos/khata/create-account-modal"
import { CameraCanvas }      from "@/components/pos/camera/camera-canvas"
import { FaceCamera }        from "@/components/pos/camera/face-camera"
import { FaceConsentModal }  from "@/components/pos/face-consent-modal"
import { FaceStore }          from "@/lib/vision/face-store"
import { PaymentScannerModal } from "@/components/pos/payment-scanner-modal"
import { RestockModal }       from "@/components/pos/restock/restock-modal"
import { useCart }         from "@/hooks/use-cart"
import { useProducts }     from "@/hooks/use-products"
import { useKhata }        from "@/hooks/use-khata"
import { useOwnerStores }  from "@/hooks/use-owner-stores"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient }    from "@/lib/supabase/client"

export default function PosPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,              setUser]              = useState(null)
  const [entity,            setEntity]            = useState(null)
  const [subRole,           setSubRole]           = useState('CASHIER')
  const [activeEntityId,    setActiveEntityId]    = useState(null)
  const [paymentMethod,     setPaymentMethod]     = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [checkoutLoading,   setCheckoutLoading]   = useState(false)
  const [checkoutError,     setCheckoutError]     = useState(null)
  const [stockShortfalls,   setStockShortfalls]   = useState([])
  const [cameraActive,      setCameraActive]      = useState(false)
  const [faceActive,        setFaceActive]        = useState(true)
  const [showConsent,       setShowConsent]        = useState(false)
  const [showPaymentScan,   setShowPaymentScan]   = useState(false)
  const [ocrVerifyId,       setOcrVerifyId]       = useState(null)
  const [ocrReferenceNo,    setOcrReferenceNo]    = useState(null)
  const [khataAccount,      setKhataAccount]      = useState(null)
  const [showCreateKhata,   setShowCreateKhata]   = useState(false)
  const [ownerOverride,     setOwnerOverride]     = useState(false)
  const [showRestock,       setShowRestock]       = useState(false)
  const [showCreditOtp,     setShowCreditOtp]     = useState(false)

  // Payment methods that require OCR verification
  const OCR_REQUIRED_METHODS = ['MBOB', 'MPAY', 'RTGS']

  useEffect(() => {
    async function load() {
      const currentUser = await getUser()
      if (!currentUser) return router.push('/login')
      setUser(currentUser)
      const { entityId, subRole: sr } = getRoleClaims(currentUser)
      setSubRole(sr ?? 'CASHIER')
      if (!entityId) return
      setActiveEntityId(entityId)
      const { data } = await supabase
        .from('entities')
        .select('id, name, tpn_gstin')
        .eq('id', entityId)
        .single()
      setEntity(data)
    }
    load()
  }, [])

  const { stores: ownedStores } = useOwnerStores(user?.id, subRole)

  async function handleSwitchStore(entityId) {
    const { data } = await supabase
      .from('entities')
      .select('id, name, tpn_gstin')
      .eq('id', entityId)
      .single()
    if (data) {
      setEntity(data)
      setActiveEntityId(entityId)
    }
  }

  const {
    cartId, items, customer, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal,
    carts, activeIndex,
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
    holdCart, switchCart, cancelCart,
  } = useCart(entity?.id, user?.id)

  const { products, loading: productsLoading, search } = useProducts(entity?.id)
  const { lookupAccount, createAccount } = useKhata(entity?.id)

  // ── Stock availability check ───────────────────────────────────────────────
  async function checkStockAvailability() {
    if (!items.length) return []
    const shortfalls = []

    for (const item of items) {
      if (item.package_id) {
        // For packages: use DB function to get available qty
        const { data: avail } = await supabase
          .rpc('package_available_qty', { p_package_id: item.package_id })

        if ((avail ?? 0) < item.quantity) {
          shortfalls.push({ item, available: avail ?? 0, needed: item.quantity })
        }
      } else if (item.product_id) {
        if (item.batch_id) {
          // Batch-specific stock check
          const { data: batch } = await supabase
            .from('product_batches')
            .select('quantity, batch_number')
            .eq('id', item.batch_id)
            .single()

          if ((batch?.quantity ?? 0) < item.quantity) {
            shortfalls.push({ item, available: batch?.quantity ?? 0, needed: item.quantity, batchNumber: batch?.batch_number })
          }
        } else {
          const { data: product } = await supabase
            .from('products')
            .select('current_stock')
            .eq('id', item.product_id)
            .single()

          if ((product?.current_stock ?? 0) < item.quantity) {
            shortfalls.push({ item, available: product?.current_stock ?? 0, needed: item.quantity })
          }
        }
      }
    }

    return shortfalls
  }

  // ── Checkout flow ──────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (!customer?.whatsapp && !customer?.buyerHash) {
      setShowCustomerModal(true)
      return
    }

    // CREDIT: must verify customer identity via WhatsApp OTP every time
    if (paymentMethod === 'CREDIT') {
      if (!customer?.whatsapp) { setShowCustomerModal(true); return }
      setShowCreditOtp(true)
      return
      // Flow continues in handleCreditOtpVerified after OTP succeeds
    }

    await initiateCheckout()
  }

  // Called when customer completes OTP verification for CREDIT payment
  async function handleCreditOtpVerified(phone) {
    setShowCreditOtp(false)
    await setCustomerIdentity({ whatsapp: phone, buyerHash: null })

    // Khata lookup — auto-create if new customer
    let { account } = await lookupAccount(phone)

    if (!account) {
      // Resolve customer name from their entity record (created during OTP signup)
      const supabaseClient = createClient()
      const { data: customerEntity } = await supabaseClient
        .from('entities')
        .select('name')
        .eq('whatsapp_no', phone)
        .single()

      const { account: newAccount, error: createErr } = await createAccount({
        party_type:   'CONSUMER',
        debtor_phone: phone,
        debtor_name:  customerEntity?.name ?? `Customer ${phone.slice(-4)}`,
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

    // OCR verification required for digital payment methods
    if (OCR_REQUIRED_METHODS.includes(paymentMethod) && !ocrVerifyId) {
      setCheckoutLoading(false)
      setShowPaymentScan(true)
      return
    }

    await processCheckout()
  }

  function handlePaymentVerified(verifyId, referenceNo) {
    setOcrVerifyId(verifyId)
    setOcrReferenceNo(referenceNo)
    // Proceed to checkout now that OCR is done
    processCheckout({ verifyId, referenceNo })
  }

  async function handleRestockComplete() {
    // Re-check after restock — if all resolved, continue checkout
    const shortfalls = await checkStockAvailability()
    setStockShortfalls(shortfalls)
    if (shortfalls.length === 0) await processCheckout()
  }

  async function processCheckout(ocr = {}) {
    if (!cartId || !paymentMethod || items.length === 0) return
    setCheckoutLoading(true)
    setCheckoutError(null)

    const finalVerifyId    = ocr.verifyId    ?? ocrVerifyId
    const finalReferenceNo = ocr.referenceNo ?? ocrReferenceNo

    try {
      const year      = new Date().getFullYear()
      const serial    = String(Math.floor(Math.random() * 99999)).padStart(5, '0')
      const orderNo   = `${entity?.name?.substring(0,4).toUpperCase() ?? 'POS'}-${year}-${serial}`

      const sigPayload = `${orderNo}:${grandTotal}:${entity?.tpn_gstin ?? ''}`
      const msgBuffer  = new TextEncoder().encode(sigPayload)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const signature  = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_type:        'POS_SALE',
          order_no:          orderNo,
          status:            'PENDING_PAYMENT',
          seller_id:         entity.id,
          buyer_whatsapp:    customer?.whatsapp ?? null,
          buyer_hash:        customer?.buyerHash ?? null,
          items,
          subtotal,
          gst_total:         gstTotal,
          grand_total:       grandTotal,
          payment_method:    paymentMethod,
          payment_ref:       finalReferenceNo ?? null,
          ocr_verify_id:     finalVerifyId    ?? null,
          digital_signature: signature,
          cart_id:           cartId,
          created_by:        user?.id,
        })
        .select('id, order_no')
        .single()

      if (orderError) throw new Error(orderError.message)

      await supabase.from('order_items').insert(
        items.map(item => ({
          order_id:     order.id,
          product_id:   item.product_id,
          package_id:   item.package_id   ?? null,
          batch_id:     item.batch_id     ?? null,
          package_name: item.package_id   ? item.name : null,
          package_type: item.package_def?.package_type ?? null,
          sku:          item.sku,
          name:         item.name,
          quantity:     item.quantity,
          unit_price:   item.unit_price,
          discount:     item.discount ?? 0,
          gst_5:        item.gst_5,
          total:        item.total,
          status:       'ACTIVE',
        }))
      )

      // CONFIRMED — DB trigger guard_stock_on_confirm fires here.
      // If any item's qty > current_stock, the entire update is rolled back
      // and an exception is thrown with the product name and shortfall.
      const { error: confirmError } = await supabase
        .from('orders')
        .update({ status: 'CONFIRMED', payment_verified_at: new Date().toISOString() })
        .eq('id', order.id)

      if (confirmError) {
        // Clean up the PENDING_PAYMENT order so it doesn't linger
        await supabase.from('orders').update({ status: 'CANCELLED', cancellation_reason: 'Stock insufficient at confirmation' }).eq('id', order.id)
        // Re-check shortfalls to show the stock gate
        const shortfalls = await checkStockAvailability()
        setStockShortfalls(shortfalls)
        throw new Error(confirmError.message)
      }

      await clearCart()
      setPaymentMethod(null)
      setOcrVerifyId(null)
      setOcrReferenceNo(null)
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
    // Look up khata account for the identified customer
    if (paymentMethod === 'CREDIT') {
      const { account } = await lookupAccount(whatsapp)
      setKhataAccount(account)
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
                  if (match) addItem(match)
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
              onAddItem={addItem}
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
            customer={customer}
            paymentMethod={paymentMethod}
            userSubRole={subRole}
            khataAccount={khataAccount}
            onUpdateQty={updateQty}
            onRemoveItem={removeItem}
            onApplyDiscount={applyDiscount}
            onOverridePrice={overridePrice}
            onSelectPayment={setPaymentMethod}
            onCheckout={handleCheckout}
            checkoutLoading={checkoutLoading}
            carts={carts}
            activeIndex={activeIndex}
            onHoldCart={holdCart}
            onSwitchCart={switchCart}
            onCancelCart={cancelCart}
          />
        </div>
      </div>

      <PaymentScannerModal
        open={showPaymentScan}
        paymentMethod={paymentMethod}
        expectedAmount={grandTotal}
        onVerified={handlePaymentVerified}
        onClose={() => setShowPaymentScan(false)}
      />

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
    </>
  )
}
