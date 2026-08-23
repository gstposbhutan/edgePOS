const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_PRODUCTS, TEST_USERS } = require('../fixtures/test-data')

const ENTITY_ID = TEST_USERS[0].entity_id

// The five keys the RanceLab spec reserves, on the WEB till: F5 rate, Alt+U unit sheet,
// Ctrl+T item remark, Alt+T GST-included, Ctrl+B barcode print (the prompt — the print itself
// opens an OS dialog and is not automatable). They were built on the terminal first; this is
// the parity pass.
//
// The shell they sit in is covered in pelbu-counter-look.spec.js.

// Notebook A4 — cheap, discrete, and nothing else in the suite rings it, so giving it a pack
// ladder cannot change another spec's totals.
const LADDER_PRODUCT = TEST_PRODUCTS[9]

// The POS tables live in the `pos` schema (migration 121). PostgREST's default schema is
// `public`, where `carts` and `products` do not exist at all — a client without this option
// silently no-ops on every write here, which looks exactly like a test that "didn't take".
function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'pos' },
  })
}

// Every spec here shares one server-side cart, so a leftover line (or a GST basis another test
// flipped) would decide the result before the first keystroke. Start each test from an empty
// ticket on the default basis.
async function resetTicket() {
  const db = admin()
  const { data: carts } = await db.from('carts').select('id').eq('entity_id', ENTITY_ID).eq('status', 'ACTIVE')
  for (const c of carts ?? []) await db.from('cart_items').delete().eq('cart_id', c.id)
  await db.from('carts').delete().eq('entity_id', ENTITY_ID).eq('status', 'ACTIVE')
}

test.describe('Pelbu counter — the reserved line keys', () => {
  test.beforeAll(async () => {
    // The unit sheet is inert until a shop fills in pack sizes — that refusal is the feature,
    // so the ladder has to be configured before it can be exercised.
    await admin().from('products')
      .update({ pack_size: 12, case_size: 5, case_label: 'Carton' })
      .eq('id', LADDER_PRODUCT.id)
  })

  test.afterAll(async () => {
    await admin().from('products')
      .update({ pack_size: null, case_size: null, case_label: null })
      .eq('id', LADDER_PRODUCT.id)
  })

  test.beforeEach(async ({ page }) => {
    await resetTicket()
    await page.goto('/pos')
    // The cart loads asynchronously. A key pressed before it lands can only report "ticket still
    // loading", so gate on the ticket being real rather than on the bar merely being painted.
    await expect(page.locator('[data-ticket-ready="true"]')).toBeVisible({ timeout: 20000 })
  })

  // Ring one line and leave it highlighted, which is what every line key needs.
  async function ringLine(page, query = 'Notebook') {
    await page.keyboard.press('F8')
    const input = page.locator('[data-testid="keyboard-product-search-input"]')
    await expect(input).toBeVisible({ timeout: 10000 })
    await input.fill(query)
    const row = page.locator('[data-testid="keyboard-product-search-modal"] tbody tr').first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.click()
    await expect(input).toBeHidden({ timeout: 5000 })
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 })
  }

  test('F5 opens the rate editor on the highlighted line', async ({ page }) => {
    await ringLine(page)
    await page.keyboard.press('F5')
    const editor = page.locator('input[type="number"][step="0.01"]')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await expect(editor).toBeFocused()
    await page.keyboard.press('Escape')
  })

  test('Alt+U rings the line by the pack, and the ticket says the factor', async ({ page }) => {
    await ringLine(page)
    await page.keyboard.press('Alt+u')
    const sheet = page.getByTestId('unit-sheet')
    await expect(sheet).toBeVisible({ timeout: 5000 })
    // Only the levels the shop configured: pieces, a pack of 12, and a carton of 5 packs.
    await expect(sheet.getByTestId('unit-level-PACK')).toContainText('x 12')
    await expect(sheet.getByTestId('unit-level-CASE')).toContainText('Carton')
    await expect(sheet.getByTestId('unit-level-CASE')).toContainText('x 60')

    await sheet.getByTestId('unit-level-PACK').click()
    await expect(sheet).toBeHidden({ timeout: 5000 })
    // The line now reads in packs and says how many pieces one is — a carton line and a piece
    // line are otherwise indistinguishable at a glance.
    const row = page.locator('table tbody tr').first()
    await expect(row).toContainText('Pack')
    await expect(row).toContainText('x 12')
  })

  test('Alt+U refuses to invent a ladder for an item with no pack size', async ({ page }) => {
    await ringLine(page, 'Druk 1100')   // generator — no pack sizes configured
    await page.keyboard.press('Alt+u')
    await expect(page.getByTestId('unit-sheet')).toHaveCount(0)
    await expect(page.getByText(/no pack size set/i)).toBeVisible({ timeout: 5000 })
  })

  test('Ctrl+T writes a remark against the line', async ({ page }) => {
    await ringLine(page)
    await page.keyboard.press('Control+t')
    await expect(page.getByRole('heading', { name: 'Item remark' })).toBeVisible({ timeout: 5000 })
    await page.locator('input[placeholder="damaged carton — sold as seen"]').fill('sold as seen')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('table tbody tr').first()).toContainText('sold as seen', { timeout: 10000 })
  })

  test('Alt+T flips the GST basis, and refuses to do it mid-ticket', async ({ page }) => {
    const status = page.getByTestId('till-status')
    await expect(status).not.toContainText('incl')
    await page.keyboard.press('Alt+t')
    await expect(status).toContainText('GST 5% incl')

    // Re-basing rates already rung would change what the customer was quoted halfway through
    // the sale, so with a line on the ticket the key says so instead.
    await ringLine(page)
    await page.keyboard.press('Alt+t')
    await expect(page.getByText(/before changing the GST basis/i)).toBeVisible({ timeout: 5000 })
    await expect(status).toContainText('GST 5% incl')
  })

  test('Ctrl+B asks how many labels before it prints any', async ({ page }) => {
    await ringLine(page)
    await page.keyboard.press('Control+b')
    await expect(page.getByRole('heading', { name: 'Print barcode labels' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/up to 50/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Print barcode labels' })).toBeHidden()
  })
})
