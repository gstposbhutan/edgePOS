"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PosHeader }       from "@/components/pos/pos-header"
import { ProductPanel }    from "@/components/pos/product-panel"
import { CartPanel }       from "@/components/pos/cart-panel"
import { CustomerIdModal } from "@/components/pos/customer-id-modal"
import { StockGateModal }  from "@/components/pos/stock-gate-modal"
import { useCart }         from "@/hooks/use-cart"
import { useProducts }     from "@/hooks/use-products"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient }    from "@/lib/supabase/client"

export default function PosPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [user,              setUser]              = useState(null)
  const [entity,            setEntity]            = useState(null)
  const [subRole,           setSubRole]           = useState('CASHIER')
  const [paymentMethod,     setPaymentMethod]     = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [checkoutLoading,   setCheckoutLoading]   = useState(false)
  const [checkoutError,     setCheckoutError]     = useState(null)
  const [stockShortfalls,   setStockShortfalls]   = useState([])  // items with insufficient stock

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
    cartId, items, customer, loading: cartLoading,
    subtotal, discountTotal, taxableSubtotal, gstTotal, grandTotal,
    addItem, updateQty, applyDiscount, overridePrice, removeItem, clearCart, setCustomerIdentity,
  } = useCart(entity?.id, user?.id)

  const { products, loading: productsLoading, search } = useProducts(entity?.id)

  // ── Stock availability check ───────────────────────────────────────────────
  async function checkStockAvailability() {
    if (!items.length) return []

    const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))]
    const { data: stocks } = await supabase
      .from('products')
      .select('id, current_stock')
      .in('id', productIds)

    const stockMap = Object.fromEntries((stocks ?? []).map(p => [p.id, p.current_stock]))

    return items
      .filter(item => item.product_id && (stockMap[item.product_id] ?? 0) < item.quantity)
      .map(item => ({
        item,
        available: stockMap[item.product_id] ?? 0,
        needed:    item.quantity,
      }))
  }

  // ── Checkout flow ──────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (!customer?.whatsapp && !customer?.buyerHash) {
      setShowCustomerModal(true)
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

  async function processCheckout() {
    if (!cartId || !paymentMethod || items.length === 0) return
    setCheckoutLoading(true)
    setCheckoutError(null)

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
          digital_signature: signature,
          cart_id:           cartId,
          created_by:        user?.id,
        })
        .select('id, order_no')
        .single()

      if (orderError) throw new Error(orderError.message)

      await supabase.from('order_items').insert(
        items.map(item => ({
          order_id:   order.id,
          product_id: item.product_id,
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
      router.push(`/pos/order/${order.id}?success=true`)

    } catch (err) {
      setCheckoutError(err.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handleCustomerIdentified(whatsapp) {
    await setCustomerIdentity({ whatsapp, buyerHash: null })
    setShowCustomerModal(false)
    await initiateCheckout()
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
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 p-4 overflow-hidden flex flex-col border-r border-border">
          <ProductPanel
            products={products}
            loading={productsLoading}
            onSearch={search}
            onAddItem={addItem}
          />
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
            onUpdateQty={updateQty}
            onRemoveItem={removeItem}
            onApplyDiscount={applyDiscount}
            onOverridePrice={overridePrice}
            onSelectPayment={setPaymentMethod}
            onCheckout={handleCheckout}
            checkoutLoading={checkoutLoading}
          />
        </div>
      </div>

      <CustomerIdModal
        open={showCustomerModal}
        onIdentify={handleCustomerIdentified}
        onClose={() => setShowCustomerModal(false)}
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
    </>
  )
}
