const { test, expect } = require('@playwright/test')
const fs = require('fs')
const { VENDOR_USERS } = require('../fixtures/test-data')

// P4 lifecycle (Model B): a wholesaler browses a linked distributor's catalog (incl. PACKAGE
// levels), orders a pallet, and RECEIVES it into its own stock (receive-on-buy) so it can then
// OPEN the received pallet into boxes in ITS OWN catalog. Drives the real APIs through an
// authenticated browser session (cookies carried by page.request → getAuthContext). Captures every
// response + the touched ids to /tmp so the outer harness can assert DB state at each step.

const DIST = VENDOR_USERS.distributor   // GST Distributors
const WHL  = VENDOR_USERS.wholesaler    // Thimphu Wholesale
const OUT  = '/web/e2e/recordings/b2b-model-b-receive.json'

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByPlaceholder('you@business.bt').fill(user.email)
  await page.getByPlaceholder('••••••••').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })
}

test('B2B Model-B: order a pallet, receive-on-buy, then open the received pallet', async ({ browser }) => {
  const out = {}

  // ── 1. Distributor: read the orderable pallet from its own catalog (P0-P3 left one). ─────────
  const distCtx = await browser.newContext()
  const distPage = await distCtx.newPage()
  await login(distPage, DIST)

  const distPkgsRes = await distPage.request.get('/api/products/catalog/_/package')
  expect(distPkgsRes.ok()).toBeTruthy()
  const distPkgs = (await distPkgsRes.json()).packages || []
  // Pick a PALLET-type, active, stocked-as-unit package with on-hand and a component tree.
  const pallet = distPkgs.find(p =>
    p.package_type === 'PALLET' && p.is_active && p.stocked_as_unit &&
    (p.product?.current_stock ?? 0) > 0 && (p.package_items?.length ?? 0) > 0
  )
  expect(pallet, 'distributor must own an orderable PALLET with stock').toBeTruthy()

  out.pallet = {
    package_id: pallet.id,
    product_id: pallet.product.id,
    name: pallet.name,
    start_stock: pallet.product.current_stock,
    component_product_id: pallet.package_items[0].product?.id,
    component_qty: pallet.package_items[0].quantity,
  }
  await distCtx.close()

  // ── 2. Wholesaler: browse the distributor catalog, confirm the pallet shows, order 1. ───────
  const whlCtx = await browser.newContext()
  const whlPage = await whlCtx.newPage()
  await login(whlPage, WHL)

  const catRes = await whlPage.request.get(`/api/console/suppliers/${DIST.entityId}/catalog`)
  expect(catRes.ok()).toBeTruthy()
  const catalog = (await catRes.json()).products || []
  const palletInCatalog = catalog.find(p => p.product_type === 'PACKAGE' && p.package_id === out.pallet.package_id)
  expect(palletInCatalog, 'the pallet must appear in the supplier catalog as a PACKAGE').toBeTruthy()
  // Availability shown = the distributor pallet's own current_stock (Model B).
  expect(palletInCatalog.availability).toBe(out.pallet.start_stock)
  out.catalog_availability = palletInCatalog.availability
  out.catalog_price = palletInCatalog.price

  const orderRes = await whlPage.request.post('/api/console/orders', {
    data: {
      supplier_id: DIST.entityId,
      items: [{ product_id: out.pallet.product_id, package_id: out.pallet.package_id, quantity: 1 }],
    },
  })
  out.order_status = orderRes.status()
  out.order_body = await orderRes.json()
  expect(orderRes.status(), `order POST should be 201, got ${out.order_status}: ${JSON.stringify(out.order_body)}`).toBe(201)
  expect(out.order_body.order?.status).toBe('CONFIRMED')
  out.order_id = out.order_body.order.id
  out.order_no = out.order_body.order.order_no

  // ── 3. Wholesaler: find the auto-provisioned mirror pallet in its OWN catalog and open 1. ────
  const whlPkgsRes = await whlPage.request.get('/api/products/catalog/_/package')
  expect(whlPkgsRes.ok()).toBeTruthy()
  const whlPkgs = (await whlPkgsRes.json()).packages || []
  const mirror = whlPkgs.find(p => p.source_package_id === out.pallet.package_id)
  expect(mirror, 'a buyer mirror pallet (source_package_id set) must exist after the order').toBeTruthy()

  out.mirror = {
    package_id: mirror.id,
    product_id: mirror.product.id,
    source_package_id: mirror.source_package_id,
    received_stock: mirror.product.current_stock,
    box_product_id: mirror.package_items?.[0]?.product?.id,
    box_qty: mirror.package_items?.[0]?.quantity,
    box_start_stock: mirror.package_items?.[0]?.product?.current_stock,
  }
  // Received exactly 1 pallet into the buyer's own stock.
  expect(out.mirror.received_stock).toBe(1)
  // The mirror tree points at the buyer's OWN box (not the seller's box product id).
  expect(out.mirror.box_product_id).toBeTruthy()
  expect(out.mirror.box_product_id).not.toBe(out.pallet.component_product_id)

  const openRes = await whlPage.request.post('/api/console/packages/open', {
    data: { package_product_id: out.mirror.product_id, qty: 1 },
  })
  out.open_status = openRes.status()
  out.open_body = await openRes.json()
  expect(openRes.ok(), `open should succeed: ${JSON.stringify(out.open_body)}`).toBeTruthy()

  // Re-read the mirror tree to prove the open released into the buyer's own products.
  const whlPkgs2 = (await (await whlPage.request.get('/api/products/catalog/_/package')).json()).packages || []
  const mirror2 = whlPkgs2.find(p => p.id === out.mirror.package_id)
  out.mirror_after_open = {
    pallet_stock: mirror2?.product?.current_stock,
    box_stock: mirror2?.package_items?.[0]?.product?.current_stock,
  }
  // Pallet 1 → 0, box 0 → (component_qty) e.g. 100.
  expect(out.mirror_after_open.pallet_stock).toBe(0)
  expect(out.mirror_after_open.box_stock).toBe(out.mirror.box_qty)

  await whlCtx.close()

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log('LIFECYCLE_RESULT ' + JSON.stringify(out))
})
