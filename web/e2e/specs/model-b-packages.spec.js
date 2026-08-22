const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')

// Model-B discrete package lifecycle (P0–P3) for the vendor consoles.
// Logs in as the distributor through the UI so the session cookie rides on page.request,
// then exercises the package CRUD + open APIs. Stock assertions come back in the API
// responses (open returns touched stocks) and the package GET (current_stock per level).

const D = VENDOR_USERS.distributor
const tag = Date.now()

async function login(page, user) {
  await page.goto('/login')
  await page.getByPlaceholder('you@business.bt').waitFor({ state: 'visible' })
  await page.getByPlaceholder('you@business.bt').fill(user.email)
  await page.getByPlaceholder('••••••••').fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })
}

// Find a created package (by name) in the GET list and return { pkg, productId, stock }.
async function findPackage(request, name) {
  const res = await request.get('/api/products/catalog/_/package')
  expect(res.ok()).toBeTruthy()
  const { packages } = await res.json()
  const pkg = packages.find(p => p.name === name)
  return pkg
}

test.describe('Model B — vendor package lifecycle', () => {
  test('distributor: piece -> box -> pallet, opening stock, open cascade', async ({ page }) => {
    test.setTimeout(120000)
    await login(page, D)
    const request = page.request

    const pieceName  = `MB Piece ${tag}`
    const boxName    = `MB Box ${tag}`
    const palletName = `MB Pallet ${tag}`

    // 1. SINGLE "Piece" via the vendor catalog (created_by-scoped).
    const pieceRes = await request.post('/api/console/catalog', {
      data: { formData: { name: pieceName, hsn_code: '1234', unit: 'pcs', current_stock: 0 }, categoryIds: [] },
    })
    expect(pieceRes.ok()).toBeTruthy()
    // Re-fetch the catalog to get the piece product id.
    const catRes = await request.get('/api/console/catalog')
    const { products } = await catRes.json()
    const piece = products.find(p => p.name === pieceName)
    expect(piece).toBeTruthy()

    // 2. BULK "Box" = 10 pieces, no opening stock yet.
    const boxRes = await request.post('/api/products/catalog/_/package', {
      data: {
        formData: { name: boxName, package_type: 'BULK', mrp: '100', stocked_as_unit: true, opening_stock: 0 },
        componentItems: [{ product_id: piece.id, quantity: 10 }],
        categoryIds: [],
      },
    })
    expect(boxRes.ok()).toBeTruthy()
    const box = await findPackage(request, boxName)
    expect(box).toBeTruthy()
    const boxProductId = box.product.id

    // 3. PALLET "Pallet" = 100 boxes, with opening stock 3 (distributor-priced only, no mrp).
    const palletRes = await request.post('/api/products/catalog/_/package', {
      data: {
        formData: { name: palletName, package_type: 'PALLET', wholesale_price: '5000', stocked_as_unit: true, opening_stock: 3 },
        componentItems: [{ product_id: boxProductId, quantity: 100 }],
        categoryIds: [],
      },
    })
    expect(palletRes.ok()).toBeTruthy()

    // Assert: pallet current_stock == opening qty (3); box == 0; piece == 0.
    let pallet = await findPackage(request, palletName)
    let boxNow = await findPackage(request, boxName)
    expect(pallet.product.current_stock).toBe(3)
    expect(boxNow.product.current_stock).toBe(0)
    expect(box.stocked_as_unit).toBe(true)

    // 4. Open 1 pallet -> pallet 3->2, box 0->100.
    const open1 = await request.post('/api/console/packages/open', {
      data: { package_product_id: pallet.product.id, qty: 1 },
    })
    expect(open1.ok()).toBeTruthy()
    const open1Body = await open1.json()
    const palletStock1 = open1Body.stocks.find(s => s.id === pallet.product.id)?.current_stock
    const boxStock1    = open1Body.stocks.find(s => s.id === boxProductId)?.current_stock
    expect(palletStock1).toBe(2)
    expect(boxStock1).toBe(100)

    // 5. Open 1 box -> box 100->99, piece 0->10.
    const open2 = await request.post('/api/console/packages/open', {
      data: { package_product_id: boxProductId, qty: 1 },
    })
    expect(open2.ok()).toBeTruthy()
    const open2Body = await open2.json()
    const boxStock2   = open2Body.stocks.find(s => s.id === boxProductId)?.current_stock
    const pieceStock2 = open2Body.stocks.find(s => s.id === piece.id)?.current_stock
    expect(boxStock2).toBe(99)
    expect(pieceStock2).toBe(10)

    // 6. Guard: opening more than on hand is rejected (400).
    const bad = await request.post('/api/console/packages/open', {
      data: { package_product_id: pallet.product.id, qty: 999 },
    })
    expect(bad.status()).toBe(400)
  })
})
