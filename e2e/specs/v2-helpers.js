const { test, expect } = require('@playwright/test')
const { PosPage } = require('../page-objects/pos-page')
const { CartPanel } = require('../page-objects/cart-panel')
const { PaymentScannerModal } = require('../page-objects/payment-scanner-modal')
const { CustomerIdModal } = require('../page-objects/customer-id-modal')
const { StockGateModal } = require('../page-objects/stock-gate-modal')
const { createClient } = require('@supabase/supabase-js')
const {
  TEST_PRODUCTS,
  TEST_USERS,
  TEST_KHATA_ACCOUNTS,
} = require('../fixtures/test-data')

// ── Product aliases ────────────────────────────────────────────────────
const IN_STOCK_PRODUCT  = TEST_PRODUCTS[0]
const CHEAP_PRODUCT     = TEST_PRODUCTS[9]
const DAIRY_PRODUCT     = TEST_PRODUCTS[2]
const LOW_STOCK_PRODUCT = TEST_PRODUCTS[4]
const OUT_OF_STOCK      = TEST_PRODUCTS[7]
const NOODLES_PRODUCT   = TEST_PRODUCTS[1]
const SOAP_PRODUCT      = TEST_PRODUCTS[6]

// ── User aliases ───────────────────────────────────────────────────────
const CASHIER_USER = TEST_USERS[0]
const MANAGER_USER = TEST_USERS[1]
const OWNER_USER   = TEST_USERS[2]

// ── Khata aliases ──────────────────────────────────────────────────────
const KHATA_ACCOUNT = TEST_KHATA_ACCOUNTS[0]
const KHATA_FROZEN  = TEST_KHATA_ACCOUNTS[2]
const TEST_PHONE    = '+97517100011'

// ── Entity ID for cart cleanup ─────────────────────────────────────────
const ENTITY_ID = TEST_USERS[0].entity_id

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(__dirname, '..', '..', '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (match) process.env[match[1].trim()] = match[2].trim()
    }
  } catch {}
}

async function clearCart() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: carts } = await supabase.from('carts').select('id').eq('entity_id', ENTITY_ID).eq('status', 'ACTIVE')
  if (carts?.length) {
    for (const c of carts) {
      await supabase.from('cart_items').delete().eq('cart_id', c.id)
    }
    await supabase.from('carts').delete().eq('entity_id', ENTITY_ID).eq('status', 'ACTIVE')
  }
}

module.exports = {
  test, expect,
  PosPage, CartPanel, PaymentScannerModal, CustomerIdModal, StockGateModal,
  IN_STOCK_PRODUCT, CHEAP_PRODUCT, DAIRY_PRODUCT, LOW_STOCK_PRODUCT,
  OUT_OF_STOCK, NOODLES_PRODUCT, SOAP_PRODUCT,
  CASHIER_USER, MANAGER_USER, OWNER_USER,
  KHATA_ACCOUNT, KHATA_FROZEN, TEST_PHONE,
  clearCart,
}
