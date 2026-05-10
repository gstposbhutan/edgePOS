/**
 * E2E Test Data — fixed UUIDs and seed constants
 *
 * UUID format: 00000000-0000-4000-8000-{NNNNNNNNNNNN}
 * These are deterministic so seed and cleanup can target exact rows.
 */

// ── Test phone (WhatsApp) ────────────────────────────────────────────
const TEST_PHONE = '+97517100001'

// ── Test entity ──────────────────────────────────────────────────────
const TEST_ENTITY = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test Store',
  role: 'RETAILER',
  tpn_gstin: 'TPN0000001',
  whatsapp_no: TEST_PHONE,
  shop_slug: 'test-store',
  is_active: true,
}

// ── Test wholesaler entity ─────────────────────────────────────────────
const TEST_WHOLESALER = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Test Wholesaler',
  role: 'WHOLESALER',
  tpn_gstin: 'TPN0000010',
  whatsapp_no: '+97517100010',
  shop_slug: 'test-wholesaler',
  is_active: true,
}

// ── Test category ───────────────────────────────────────────────────────
const TEST_CATEGORY = {
  id: '00000000-0000-4000-8000-000000000020',
  name: 'Test Category',
  distributor_id: null, // Not needed for E2E
}

// ── Test products (10 items, varying stock) ──────────────────────────
// Schema: id, name, sku, hsn_code, current_stock, mrp, wholesale_price,
//         unit, is_active, visible_on_web, created_by (FK entities), product_type, reorder_point
const TEST_PRODUCTS = [
  {
    id: '00000000-0000-4000-8000-000000001001',
    name: 'Druk 1100 Generator',
    sku: 'DRK-GEN-1100',
    hsn_code: '8501',
    current_stock: 45,
    mrp: 35000.00,
    wholesale_price: 28000.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Electronics',
  },
  {
    id: '00000000-0000-4000-8000-000000001002',
    name: 'Wai Wai Noodles (Pack of 30)',
    sku: 'FDL-WAI-030',
    hsn_code: '1902',
    current_stock: 120,
    mrp: 450.00,
    wholesale_price: 360.00,
    unit: 'pack',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001003',
    name: 'Druk Supreme Milk 1L',
    sku: 'DRY-MLK-001',
    hsn_code: '0401',
    current_stock: 80,
    mrp: 85.00,
    wholesale_price: 68.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001004',
    name: 'Bhutan Telecom SIM Card',
    sku: 'TEL-SIM-BT1',
    hsn_code: '8517',
    current_stock: 200,
    mrp: 100.00,
    wholesale_price: 50.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Electronics',
  },
  {
    id: '00000000-0000-4000-8000-000000001005',
    name: 'Red Bull Energy Drink 250ml',
    sku: 'BEV-RDB-250',
    hsn_code: '2202',
    current_stock: 6,
    mrp: 120.00,
    wholesale_price: 95.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001006',
    name: 'Surf Excel Detergent 1kg',
    sku: 'HHD-SRF-001',
    hsn_code: '3402',
    current_stock: 3,
    mrp: 320.00,
    wholesale_price: 260.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'General Merchandise',
  },
  {
    id: '00000000-0000-4000-8000-000000001007',
    name: 'Lifebuoy Soap Bar (Pack of 4)',
    sku: 'HPC-LFB-004',
    hsn_code: '3401',
    current_stock: 8,
    mrp: 180.00,
    wholesale_price: 140.00,
    unit: 'pack',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Health & Pharmacy',
  },
  {
    id: '00000000-0000-4000-8000-000000001008',
    name: 'Parle-G Biscuit 800g',
    sku: 'FDL-PRL-800',
    hsn_code: '1905',
    current_stock: 0,
    mrp: 80.00,
    wholesale_price: 62.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001009',
    name: 'Coca-Cola 2L Bottle',
    sku: 'BEV-CC-002L',
    hsn_code: '2202',
    current_stock: 0,
    mrp: 90.00,
    wholesale_price: 70.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: false,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001010',
    name: 'Notebook A4 (200 pages)',
    sku: 'STN-NB-A420',
    hsn_code: '4820',
    current_stock: 55,
    mrp: 60.00,
    wholesale_price: 42.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: true,
    created_by: TEST_ENTITY.id,
    product_type: 'SINGLE',
    category: 'Stationery & Office',
  },
]

// ── Test users (cashier, manager, owner) ─────────────────────────────
const TEST_USERS = [
  {
    id: '00000000-0000-4000-8000-000000002001',
    email: 'cashier@teststore.bt',
    password: 'TestCashier@2026',
    role: 'RETAILER',
    sub_role: 'CASHIER',
    permissions: ['pos:read', 'pos:sale', 'pos:refund:view'],
    entity_id: TEST_ENTITY.id,
  },
  {
    id: '00000000-0000-4000-8000-000000002002',
    email: 'manager@teststore.bt',
    password: 'TestManager@2026',
    role: 'RETAILER',
    sub_role: 'MANAGER',
    permissions: [
      'pos:read', 'pos:sale', 'pos:refund:create',
      'inventory:read', 'inventory:write',
      'orders:read', 'orders:write',
      'khata:read',
      'reports:read',
    ],
    entity_id: TEST_ENTITY.id,
  },
  {
    id: '00000000-0000-4000-8000-000000002003',
    email: 'owner@teststore.bt',
    password: 'TestOwner@2026',
    role: 'RETAILER',
    sub_role: 'OWNER',
    permissions: [
      'pos:read', 'pos:sale', 'pos:refund:create', 'pos:refund:approve',
      'inventory:read', 'inventory:write', 'inventory:delete',
      'orders:read', 'orders:write', 'orders:cancel',
      'khata:read', 'khata:write', 'khata:freeze',
      'reports:read', 'reports:export',
      'settings:read', 'settings:write',
      'users:read', 'users:write',
    ],
    entity_id: TEST_ENTITY.id,
  },
]

// ── Test orders (6 orders across various statuses) ───────────────────
// Schema: id, order_type, order_no, status, seller_id, buyer_id, items,
//         subtotal, gst_total, grand_total, payment_method, order_source
const TEST_ORDERS = [
  {
    id: '00000000-0000-4000-8000-000000003001',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0001',
    seller_id: TEST_ENTITY.id,
    status: 'COMPLETED',
    order_source: 'POS',
    subtotal: 565.00,
    gst_total: 28.25,
    grand_total: 593.25,
    payment_method: 'CASH',
    items: [
      { product_id: TEST_PRODUCTS[1].id, sku: TEST_PRODUCTS[1].sku, name: TEST_PRODUCTS[1].name, qty: 1, rate: 450.00, discount: 0, gst_5: 22.50, total: 472.50 },
      { product_id: TEST_PRODUCTS[9].id, sku: TEST_PRODUCTS[9].sku, name: TEST_PRODUCTS[9].name, qty: 2, rate: 60.00, discount: 0, gst_5: 6.00, total: 126.00 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003002',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0002',
    seller_id: TEST_ENTITY.id,
    status: 'CONFIRMED',
    order_source: 'WHATSAPP',
    subtotal: 85.00,
    gst_total: 4.25,
    grand_total: 89.25,
    payment_method: 'ONLINE',
    items: [
      { product_id: TEST_PRODUCTS[2].id, sku: TEST_PRODUCTS[2].sku, name: TEST_PRODUCTS[2].name, qty: 1, rate: 85.00, discount: 0, gst_5: 4.25, total: 89.25 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003003',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0003',
    seller_id: TEST_ENTITY.id,
    status: 'DELIVERED',
    order_source: 'POS',
    subtotal: 120.00,
    gst_total: 6.00,
    grand_total: 126.00,
    payment_method: 'CASH',
    items: [
      { product_id: TEST_PRODUCTS[4].id, sku: TEST_PRODUCTS[4].sku, name: TEST_PRODUCTS[4].name, qty: 1, rate: 120.00, discount: 0, gst_5: 6.00, total: 126.00 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003004',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0004',
    seller_id: TEST_ENTITY.id,
    status: 'CANCELLED',
    order_source: 'POS',
    subtotal: 320.00,
    gst_total: 16.00,
    grand_total: 336.00,
    payment_method: 'CASH',
    items: [
      { product_id: TEST_PRODUCTS[5].id, sku: TEST_PRODUCTS[5].sku, name: TEST_PRODUCTS[5].name, qty: 1, rate: 320.00, discount: 0, gst_5: 16.00, total: 336.00 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003005',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0005',
    seller_id: TEST_ENTITY.id,
    status: 'REFUND_REQUESTED',
    order_source: 'POS',
    subtotal: 90.00,
    gst_total: 4.50,
    grand_total: 94.50,
    payment_method: 'ONLINE',
    items: [
      { product_id: TEST_PRODUCTS[8].id, sku: TEST_PRODUCTS[8].sku, name: TEST_PRODUCTS[8].name, qty: 1, rate: 90.00, discount: 0, gst_5: 4.50, total: 94.50 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000003006',
    order_type: 'POS_SALE',
    order_no: 'TS-2026-0006',
    seller_id: TEST_ENTITY.id,
    status: 'DRAFT',
    order_source: 'WHATSAPP',
    subtotal: 180.00,
    gst_total: 9.00,
    grand_total: 189.00,
    payment_method: null,
    items: [
      { product_id: TEST_PRODUCTS[6].id, sku: TEST_PRODUCTS[6].sku, name: TEST_PRODUCTS[6].name, qty: 1, rate: 180.00, discount: 0, gst_5: 9.00, total: 189.00 },
    ],
  },
]

// ── Test khata (credit) accounts ─────────────────────────────────────
// Schema: id, creditor_entity_id, party_type, debtor_name, debtor_phone,
//         credit_limit, outstanding_balance, credit_term_days, status
const TEST_KHATA_ACCOUNTS = [
  {
    id: '00000000-0000-4000-8000-000000004001',
    creditor_entity_id: TEST_ENTITY.id,
    party_type: 'CONSUMER',
    debtor_name: 'Karma Tshering',
    debtor_phone: '+97517100011',
    outstanding_balance: 500.00,
    credit_limit: 5000.00,
    credit_term_days: 30,
    status: 'ACTIVE',
  },
  {
    id: '00000000-0000-4000-8000-000000004002',
    creditor_entity_id: TEST_ENTITY.id,
    party_type: 'CONSUMER',
    debtor_name: 'Pema Wangmo',
    debtor_phone: '+97517100012',
    outstanding_balance: 0.00,
    credit_limit: 3000.00,
    credit_term_days: 30,
    status: 'ACTIVE',
  },
  {
    id: '00000000-0000-4000-8000-000000004003',
    creditor_entity_id: TEST_ENTITY.id,
    party_type: 'CONSUMER',
    debtor_name: 'Sonam Dorji',
    debtor_phone: '+97517100013',
    outstanding_balance: 1250.00,
    credit_limit: 2000.00,
    credit_term_days: 30,
    status: 'FROZEN',
  },
]

// ── Retailer-Wholesaler connection ───────────────────────────────────────
const TEST_RETAILER_WHOLESALER = {
  retailer_id: TEST_ENTITY.id,
  wholesaler_id: TEST_WHOLESALER.id,
  category_id: TEST_CATEGORY.id,
  is_primary: true,
  active: true,
}

// ── Wholesaler products ─────────────────────────────────────────────────
const TEST_WHOLESALER_PRODUCTS = [
  {
    id: '00000000-0000-4000-8000-000000001011',
    name: 'Wholesale Druk 1100 Generator',
    sku: 'WHL-DRK-1100',
    hsn_code: '8501',
    current_stock: 150,
    mrp: 35000.00,
    wholesale_price: 25000.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: false,
    created_by: TEST_WHOLESALER.id,
    product_type: 'SINGLE',
    category: 'Electronics',
  },
  {
    id: '00000000-0000-4000-8000-000000001012',
    name: 'Wholesale Wai Wai Noodles',
    sku: 'WHL-WAI-100',
    hsn_code: '1902',
    current_stock: 500,
    mrp: 450.00,
    wholesale_price: 300.00,
    unit: 'pack',
    is_active: true,
    visible_on_web: false,
    created_by: TEST_WHOLESALER.id,
    product_type: 'SINGLE',
    category: 'Food & Grocery',
  },
  {
    id: '00000000-0000-4000-8000-000000001013',
    name: 'Wholesale Surf Excel Detergent',
    sku: 'WHL-SRF-001',
    hsn_code: '3402',
    current_stock: 200,
    mrp: 320.00,
    wholesale_price: 220.00,
    unit: 'piece',
    is_active: true,
    visible_on_web: false,
    created_by: TEST_WHOLESALER.id,
    product_type: 'SINGLE',
    category: 'General Merchandise',
  },
]

// ── Retailer-Wholesaler Khata account ───────────────────────────────────
const TEST_WHOLESALER_KHATA = {
  id: '00000000-0000-4000-8000-000000004010',
  creditor_entity_id: TEST_WHOLESALER.id,
  party_type: 'RETAILER',
  debtor_entity_id: TEST_ENTITY.id,
  debtor_name: TEST_ENTITY.name,
  debtor_phone: null,
  credit_limit: 50000.00,
  outstanding_balance: 0.00,
  credit_term_days: 30,
  status: 'ACTIVE',
}

// ── Test rider ────────────────────────────────────────────────────────
const TEST_RIDER = {
  id: '00000000-0000-4000-8000-000000005001',
  name: 'Test Rider',
  phone: '+97517100050',
  pin: '1234',
  vehicle_type: 'motorcycle',
  is_active: true,
  entity_id: TEST_ENTITY.id,
}

// ── Test product batches (for PO/SO flows) ───────────────────────────
const TEST_BATCHES = [
  {
    id: '00000000-0000-4000-8000-000000006001',
    product_id: TEST_PRODUCTS[0].id, // Druk 1100 Generator
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-GEN-001',
    quantity: 20,
    mrp: 35000.00,
    selling_price: 35000.00,
    unit_cost: 28000.00,
    status: 'ACTIVE',
    expires_at: '2027-12-31',
  },
  {
    id: '00000000-0000-4000-8000-000000006002',
    product_id: TEST_PRODUCTS[1].id, // Wai Wai Noodles
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-WAI-001',
    quantity: 60,
    mrp: 450.00,
    selling_price: 450.00,
    unit_cost: 360.00,
    status: 'ACTIVE',
    expires_at: '2027-06-30',
  },
  {
    id: '00000000-0000-4000-8000-000000006003',
    product_id: TEST_PRODUCTS[2].id, // Druk Supreme Milk 1L
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-MLK-001',
    quantity: 50,
    mrp: 85.00,
    selling_price: 85.00,
    unit_cost: 68.00,
    status: 'ACTIVE',
    expires_at: '2027-03-31',
  },
  {
    id: '00000000-0000-4000-8000-000000006004',
    product_id: TEST_PRODUCTS[3].id, // Bhutan Telecom SIM Card
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-SIM-001',
    quantity: 100,
    mrp: 100.00,
    selling_price: 100.00,
    unit_cost: 50.00,
    status: 'ACTIVE',
    expires_at: '2028-12-31',
  },
  {
    id: '00000000-0000-4000-8000-000000006005',
    product_id: TEST_PRODUCTS[4].id, // Red Bull Energy Drink 250ml
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-RDB-001',
    quantity: 6,
    mrp: 120.00,
    selling_price: 120.00,
    unit_cost: 95.00,
    status: 'ACTIVE',
    expires_at: '2027-09-30',
  },
  {
    id: '00000000-0000-4000-8000-000000006006',
    product_id: TEST_PRODUCTS[5].id, // Surf Excel Detergent 1kg
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-SRF-001',
    quantity: 3,
    mrp: 320.00,
    selling_price: 320.00,
    unit_cost: 260.00,
    status: 'ACTIVE',
    expires_at: '2028-06-30',
  },
  {
    id: '00000000-0000-4000-8000-000000006007',
    product_id: TEST_PRODUCTS[6].id, // Lifebuoy Soap Bar (Pack of 4)
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-LFB-001',
    quantity: 8,
    mrp: 180.00,
    selling_price: 180.00,
    unit_cost: 140.00,
    status: 'ACTIVE',
    expires_at: '2028-03-31',
  },
  {
    id: '00000000-0000-4000-8000-000000006008',
    product_id: TEST_PRODUCTS[9].id, // Notebook A4 (200 pages)
    entity_id: TEST_ENTITY.id,
    batch_number: 'BATCH-NB-001',
    quantity: 30,
    mrp: 60.00,
    selling_price: 60.00,
    unit_cost: 42.00,
    status: 'ACTIVE',
    expires_at: '2029-12-31',
  },
]

module.exports = {
  TEST_PHONE,
  TEST_ENTITY,
  TEST_WHOLESALER,
  TEST_CATEGORY,
  TEST_PRODUCTS,
  TEST_WHOLESALER_PRODUCTS,
  TEST_USERS,
  TEST_ORDERS,
  TEST_KHATA_ACCOUNTS,
  TEST_RETAILER_WHOLESALER,
  TEST_WHOLESALER_KHATA,
  // User role aliases
  CASHIER_USER: TEST_USERS[0],
  MANAGER_USER: TEST_USERS[1],
  OWNER_USER: TEST_USERS[2],
  TEST_RIDER,
  TEST_BATCHES,
}

// Also export individual constants for easier importing in tests
module.exports.TEST_PHONE = TEST_PHONE
module.exports.TEST_ENTITY = TEST_ENTITY
module.exports.TEST_WHOLESALER = TEST_WHOLESALER
module.exports.TEST_CATEGORY = TEST_CATEGORY
module.exports.TEST_PRODUCTS = TEST_PRODUCTS
module.exports.TEST_WHOLESALER_PRODUCTS = TEST_WHOLESALER_PRODUCTS
module.exports.TEST_USERS = TEST_USERS
module.exports.TEST_ORDERS = TEST_ORDERS
module.exports.TEST_KHATA_ACCOUNTS = TEST_KHATA_ACCOUNTS
module.exports.TEST_RETAILER_WHOLESALER = TEST_RETAILER_WHOLESALER
module.exports.TEST_WHOLESALER_KHATA = TEST_WHOLESALER_KHATA
module.exports.CASHIER_USER = TEST_USERS[0]
module.exports.MANAGER_USER = TEST_USERS[1]
module.exports.OWNER_USER = TEST_USERS[2]
module.exports.TEST_RIDER = TEST_RIDER
module.exports.TEST_BATCHES = TEST_BATCHES
