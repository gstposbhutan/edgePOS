const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED ONBOARDING TOUR (2 of 3) — Platform Super-Admin. Sign in (no brand intro), then the Riders,
// Categories (with the property Configure modal), Product Properties and Units screens. Split out of the
// full onboarding tour so each segment records a short .webm we later join with ffmpeg. Slow by design:
// the `tour` project adds slowMo and we type char-by-char and pause between beats.
// Live login as admin@nexus.bt (Staff tab, password test1234).

// Type a string one character at a time into a locator.
async function slowType(locator, text, delay = 90) { await locator.click(); await locator.pressSequentially(text, { delay }) }

test('Super-admin onboarding tour (2/3) — riders, categories, properties & units', async ({ page }) => {
  await installTour(page)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 OF 11 — SIGN IN
  // ═════════════════════════════════════════════════════════════════════════
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'SCREEN 1 OF 11',
    title: 'Sign in',
    sub: 'Staff and business accounts sign in with email + password.',
  }, { hold: 2200 })

  await callout(page, 'button:has-text("Customer")', {
    title: 'Customer tab', text: 'The default tab — shoppers sign in here with a one-time email code. Not you.',
  })
  await callout(page, 'button:has-text("Staff")', {
    title: 'Staff tab', text: 'Every business and platform account lives here. Tap it to reveal the email + password form.',
  })
  await caption(page, { step: 1, title: 'Switch to Staff', text: 'Tap the Staff tab to sign in as the platform operator.' })
  await page.getByRole('button', { name: 'Staff' }).click(); await beat(page, 900)

  await callout(page, 'input[placeholder="you@business.bt"]', {
    title: 'Email', text: 'Your platform admin email — this identity carries the SUPER_ADMIN role.',
  })
  await callout(page, 'input[placeholder="••••••••"]', {
    title: 'Password', text: 'Your account password. The eye icon reveals it if you need to check a typo.',
  })
  await callout(page, 'button:has-text("Sign In")', {
    title: 'Sign In', text: 'Confirms your credentials and drops you straight into the admin dashboard.',
  })

  await caption(page, { step: 2, title: 'Enter your credentials', text: 'Type your email and password, then Sign In.' })
  await clearHighlight(page)
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.admin.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.admin.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/admin', { timeout: 30000 }); await beat(page, 1600)
  await clearCaption(page)

  const sidebar = page.locator('aside')

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 5 OF 11 — RIDERS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 3, title: 'Open Riders', text: 'Tap Riders to manage the last-mile delivery fleet.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Riders' }).click()
  await expect(page).toHaveURL(/\/admin\/riders/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 5 OF 11',
    title: 'Riders',
    sub: 'Your delivery fleet — add riders, activate them, and watch each one’s live queue.',
  }, { hold: 2200 })

  await callout(page, 'h1:has-text("Riders")', {
    title: 'Riders', text: 'Every registered rider, with a running count of how many are on the platform.',
  })
  await callout(page, 'button:has-text("Add Rider")', {
    title: 'Add Rider', text: 'Register a new rider with a name, login email and phone.',
  })
  await callout(page, 'th:has-text("Status")', {
    title: 'Status column', text: 'Active vs Inactive — an inactive rider gets no dispatches at all.',
  })
  await callout(page, 'th:has-text("Shift")', {
    title: 'Shift column', text: 'On shift means the rider is Online and available to receive orders now.',
  })
  await callout(page, 'th:has-text("Queue")', {
    title: 'Queue column', text: 'How many orders are live in that rider’s queue right now.',
  })
  await callout(page, 'tbody tr:first-child', {
    title: 'A rider row', text: 'Name, login email, phone, status, shift and queue depth — all at a glance.',
  })

  // ── FLOW: open Add Rider, explain the fields, then close ──
  await caption(page, { step: 4, title: 'Open Add Rider', text: 'Tap Add Rider to see how a rider is registered.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /add rider/i }).first().click(); await beat(page, 1000)

  await callout(page, 'input[placeholder="Rider name"]', {
    title: 'Name', text: 'The rider’s name — shown to vendors and customers on each delivery.',
  })
  await callout(page, 'input[placeholder="rider@example.com"]', {
    title: 'Email', text: 'The rider’s sign-in identity — a fresh login code is emailed each time.',
  })
  await callout(page, 'input[placeholder="+975 17 123 456"]', {
    title: 'Phone', text: 'Must be unique across all users — used for WhatsApp and contact.',
  })
  await callout(page, 'div.fixed.inset-0.z-50 button:has-text("Add Rider")', {
    title: 'Add Rider', text: 'Creates the rider and adds them to the fleet, ready to go online.',
  })
  await caption(page, { step: 5, title: 'Close the form', text: 'We tap Cancel to close without adding a rider.' })
  await clearHighlight(page)
  await page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 6 OF 11 — CATEGORIES
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 6, title: 'Open Categories', text: 'Tap Categories to configure per-category product properties.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Categories' }).click()
  await expect(page).toHaveURL(/\/admin\/categories/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 6 OF 11',
    title: 'Categories',
    sub: 'Each product category can collect its own custom fields — you define them here.',
  }, { hold: 2200 })

  await callout(page, 'h1:has-text("Categories")', {
    title: 'Categories', text: 'The catalog’s category list — one row per category.',
  })
  await callout(page, 'div.p-4.border.rounded-lg', {
    title: 'A category row', text: 'Shows the category name and how many custom properties it currently collects.',
  })
  // The property editor opens from a category row's Configure button. The admin categories list is
  // entity-scoped, so the super-admin may see no rows — guard the whole sub-flow and skip gracefully
  // (every action also .catch()es so a missing modal control can never hang or abort the recording).
  const hasConfigure = await page.getByRole('button', { name: /configure/i }).count().catch(() => 0)
  if (hasConfigure) {
    await callout(page, 'button:has-text("Configure")', {
      title: 'Configure', text: 'Opens the property editor for that category.',
    })
    await caption(page, { step: 7, title: 'Configure a category', text: 'Tap Configure to open the property editor.' })
    await clearHighlight(page)
    await page.getByRole('button', { name: /configure/i }).first().click().catch(() => {}); await beat(page, 1200)

    await callout(page, '[role="dialog"] >> text=/Properties:/', {
      title: 'Property editor', text: 'Lists the custom properties for this category and lets you add, edit or remove them.',
    })
    await callout(page, '[role="dialog"] button:has-text("Add Property")', {
      title: 'Add Property', text: 'Reveals a form to define a new custom field for products in this category.',
    })
    await page.locator('[role="dialog"]').getByRole('button', { name: /add property/i }).click().catch(() => {}); await beat(page, 900)
    await callout(page, 'input[placeholder="e.g., Wattage"]', {
      title: 'Property name', text: 'What the field is called, e.g. Wattage or Screen size.',
    })
    await callout(page, '[role="dialog"] select', {
      title: 'Data type', text: 'Text, number, unit-of-measure or date/time — controls how the field is captured.',
    })
    await callout(page, '#is_required', {
      title: 'Required field', text: 'Tick this to force vendors to fill the field before a product can be saved.',
    })
    await caption(page, { step: 8, title: 'Close the editor', text: 'We tap Cancel, then Done, to close without adding a property.' })
    await clearHighlight(page)
    await page.locator('[role="dialog"]').getByRole('button', { name: /^cancel$/i }).click().catch(() => {}); await beat(page, 700)
    await page.locator('[role="dialog"]').getByRole('button', { name: /^done$/i }).click().catch(() => {}); await beat(page, 1200)
  } else {
    await caption(page, { step: 7, title: 'Per-category properties', text: 'Each category’s Configure button opens a property editor to add custom fields — e.g. Wattage or Screen size.' }, 3400)
    await clearHighlight(page)
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 7 OF 11 — PRODUCT PROPERTIES (HSN templates)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 9, title: 'Open Product Properties', text: 'Tap Product Properties to manage HSN-category field templates.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Product Properties' }).click()
  await expect(page).toHaveURL(/\/admin\/property-templates/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 7 OF 11',
    title: 'Product Properties',
    sub: 'Reusable custom-field templates per category — they power the product form and AI enrichment.',
  }, { hold: 2400 })

  await callout(page, 'h1:has-text("Product Properties")', {
    title: 'Product Properties', text: 'Per-category templates of custom fields, shared across every vendor’s catalog.',
  })
  await callout(page, 'input[placeholder^="New category"]', {
    title: 'New category', text: 'Type a category name here to start a fresh template.',
  })
  await callout(page, 'button:has-text("Add category")', {
    title: 'Add category', text: 'Adds the new category so you can attach properties to it.',
  })
  await callout(page, 'div.border.rounded-xl.p-4', {
    title: 'A template', text: 'One card per category. Add rows of properties, then Save to publish them.',
  })
  await callout(page, 'input[placeholder^="Label"]', {
    title: 'Property label', text: 'The human-readable field name shown on the product form.',
  })
  await callout(page, 'input[placeholder="key"]', {
    title: 'Property key', text: 'The machine key stored in the database and used by AI enrichment.',
  })
  await callout(page, 'div.border.rounded-xl.p-4 select', {
    title: 'Field type', text: 'text, number or select — select adds a comma-separated options list.',
  })
  await callout(page, 'button:has-text("Add property")', {
    title: 'Add property', text: 'Appends another property row to this category’s template.',
  })
  await callout(page, 'div.border.rounded-xl.p-4 button:has-text("Save")', {
    title: 'Save', text: 'Persists this category’s template so vendors and the AI enrichment pick it up.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 8 OF 11 — UNITS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 10, title: 'Open Units', text: 'Tap Units to manage the units of measurement.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Units' }).click()
  await expect(page).toHaveURL(/\/admin\/units/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 8 OF 11',
    title: 'Units of Measurement',
    sub: 'The kg / litre / piece list that vendors choose from when defining products.',
  }, { hold: 2200 })

  await callout(page, 'h1:has-text("Units of Measurement")', {
    title: 'Units', text: 'Every unit available across the platform, with its abbreviation and category.',
  })
  await callout(page, 'button:has-text("Add Unit")', {
    title: 'Add Unit', text: 'Define a new unit — a name, an abbreviation and an optional grouping category.',
  })
  await callout(page, 'th:has-text("Abbreviation")', {
    title: 'Abbreviation column', text: 'The short code (kg, L, pc) shown on labels and receipts.',
  })
  await callout(page, 'th:has-text("Status")', {
    title: 'Status column', text: 'Active units appear in the product form; inactive ones are hidden but kept.',
  })
  await callout(page, 'tbody tr:first-child', {
    title: 'A unit row', text: 'Reorder, edit or delete a unit, and toggle it active/inactive.',
  })

  // ── FLOW: open the Add-Unit form, explain fields, then close ──
  await caption(page, { step: 11, title: 'Open Add Unit', text: 'Tap Add Unit to see how a unit is defined.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /add unit/i }).click(); await beat(page, 1000)

  await callout(page, 'input[placeholder="e.g., Kilogram"]', {
    title: 'Name', text: 'The full unit name, e.g. Kilogram.',
  })
  await callout(page, 'input[placeholder="e.g., kg"]', {
    title: 'Abbreviation', text: 'The short form used on tags and receipts, e.g. kg.',
  })
  await callout(page, 'input[placeholder="e.g., weight"]', {
    title: 'Category', text: 'Optional grouping such as weight, volume or count.',
  })
  await callout(page, 'button:has-text("Create")', {
    title: 'Create', text: 'Adds the unit to the platform-wide list.',
  })
  await caption(page, { step: 12, title: 'Close the form', text: 'We tap Cancel to close without adding a unit.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ─────────────────────────────────────────────────────────────────────────
  // END OF SEGMENT 2 OF 3
  // ─────────────────────────────────────────────────────────────────────────
  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
