const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { TEST_USERS } = require('../fixtures/test-data')

const ENTITY_ID = TEST_USERS[0].entity_id

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


// The RanceLab counter shell on the WEB till (spec WF-01/WF-02): the status strip, the
// always-focused barcode row, the ticket's column order, the paged key rail, and the Office
// letter menu that replaces the sidebar now the counter is full-screen.
//
// The line-editing keys these make room for are covered separately in
// pelbu-counter-line-keys.spec.js — small suites, so a failure names itself.

test.describe('Pelbu counter — the RanceLab shell', () => {
  test.beforeEach(async ({ page }) => {
    await resetTicket()
    await page.goto('/pos')
    // The cart loads asynchronously. A key pressed before it lands can only report "ticket still
    // loading", so gate on the ticket being real rather than on the bar merely being painted.
    await expect(page.locator('[data-ticket-ready="true"]')).toBeVisible({ timeout: 20000 })
  })

  test('the till bar states the basis, the currency and the buyer', async ({ page }) => {
    await expect(page.getByText('Counter', { exact: true })).toBeVisible()
    // Default basis is exclusive, so the strip says the plain rate — not "incl".
    await expect(page.getByTestId('till-status')).toHaveText(/GST 5% · Nu · walk-in/)
  })

  test('the counter is full-screen — no back-office sidebar', async ({ page }) => {
    // Every other /pos screen keeps the rail; the till gives the whole width to the ticket.
    await expect(page.locator('aside')).toHaveCount(0)
  })

  test('the barcode row holds the caret, and typing lands in it', async ({ page }) => {
    const barcode = page.locator('#pos-barcode')
    await expect(barcode).toBeFocused()
    await page.keyboard.type('8901234')
    // The character must NOT have been swallowed by a search sheet opening under it — that
    // race is what made fast wedge scans lose their leading digits.
    await expect(barcode).toHaveValue('8901234')
    await page.keyboard.press('Escape')
    await expect(barcode).toHaveValue('')
  })

  test('an unknown code falls through to the picker, seeded with what was typed', async ({ page }) => {
    await page.locator('#pos-barcode').fill('Druk')
    await page.keyboard.press('Enter')
    const input = page.locator('[data-testid="keyboard-product-search-input"]')
    await expect(input).toBeVisible({ timeout: 10000 })
    await expect(input).toHaveValue('Druk')
    await page.keyboard.press('Escape')
  })

  test('the ticket carries the RanceLab columns, in RanceLab order', async ({ page }) => {
    // An empty ticket shows the "scan a barcode" placeholder; the grid appears with the line.
    await page.keyboard.press('F8')
    const input = page.locator('[data-testid="keyboard-product-search-input"]')
    await expect(input).toBeVisible({ timeout: 10000 })
    await input.fill('Druk')
    const row = page.locator('[data-testid="keyboard-product-search-modal"] tbody tr').first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.click()

    const headers = page.locator('table thead th')
    await expect(headers.nth(0)).toHaveText('Srl')
    await expect(headers.nth(1)).toHaveText('Product Name')
    await expect(headers.nth(2)).toHaveText('Product Code')
    await expect(headers.nth(3)).toHaveText('Stock')
    await expect(headers.nth(4)).toHaveText('Qty')
    await expect(headers.nth(5)).toHaveText('Unit')
    await expect(headers.nth(6)).toHaveText('Sale Tax Price Name')
    await expect(headers.nth(7)).toHaveText('Amount')
  })

  test('the footer rail pages, and names the key F12 cannot deliver', async ({ page }) => {
    await expect(page.getByText('Footer page 1')).toBeVisible()
    await expect(page.getByRole('button', { name: /F10\s*Tender/ })).toBeVisible()
    await page.getByTitle('Next page').click()
    await expect(page.getByText('Footer page 2')).toBeVisible()
    await expect(page.getByRole('button', { name: /Ctrl\+B\s*Barcode Prn/ })).toBeVisible()
    // F12 belongs to the devtools and cannot be cancelled by a page, so the rail shows the
    // alias that does reach the till rather than promising a key that never arrives.
    await expect(page.getByRole('button', { name: /F12\s*Location/ })).toContainText('Ctrl+⇧L')
  })

  test('Alt+O opens the Office letter menu, and a letter drills into it', async ({ page }) => {
    await page.keyboard.press('Alt+o')
    await expect(page.getByRole('heading', { name: 'Office' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /P\s*Purchase Management/ })).toBeVisible()
    // W is Warehouse, and it has a second row of letters the way RanceLab does.
    await page.keyboard.press('W')
    await expect(page.getByRole('heading', { name: /Office — Warehouse Management/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /O\s*Stock Register/ })).toBeVisible()
    await page.keyboard.press('Escape')   // back to the module list
    await expect(page.getByRole('heading', { name: 'Office', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')   // and closed
    await expect(page.getByRole('heading', { name: 'Office', exact: true })).toBeHidden()
  })
})
