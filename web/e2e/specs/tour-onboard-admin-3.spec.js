const { test, expect } = require('@playwright/test')
const { VENDOR_USERS } = require('../fixtures/test-data')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED ONBOARDING TOUR (3 of 3) — Platform Super-Admin. Sign in (no brand intro), then the Desktop
// App releases, Business Settings and Desktop Licenses screens, plus the closing wrap-up. Split out of
// the full onboarding tour so each segment records a short .webm we later join with ffmpeg. Slow by
// design: the `tour` project adds slowMo and we type char-by-char and pause between beats.
// Live login as admin@nexus.bt (Staff tab, password test1234).

// Type a string one character at a time into a locator.
async function slowType(locator, text, delay = 90) { await locator.click(); await locator.pressSequentially(text, { delay }) }

test('Super-admin onboarding tour (3/3) — releases, settings & licenses', async ({ page }) => {
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
  // SCREEN 9 OF 11 — DESKTOP APP (releases)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 3, title: 'Open Desktop App', text: 'Tap Desktop App to publish POS terminal releases.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Desktop App' }).click()
  await expect(page).toHaveURL(/\/admin\/releases/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 9 OF 11',
    title: 'Desktop App releases',
    sub: 'Publish a terminal version with notes and an installer; shops auto-update to the latest published build.',
  }, { hold: 2400 })

  await callout(page, 'h1:has-text("Desktop App Releases")', {
    title: 'Releases', text: 'The version history of the Pelbu POS installer.',
  })
  await callout(page, 'button:has-text("New Release")', {
    title: 'New Release', text: 'Draft a new version — set the number, channel, platform and notes.',
  })
  await callout(page, 'th:has-text("Installer")', {
    title: 'Installer column', text: 'A download link + file size once you upload the .exe / .dmg / .AppImage.',
  })
  await callout(page, 'th:has-text("Status")', {
    title: 'Status column', text: 'Draft vs Published — only a published release is offered to terminals.',
  })

  // ── FLOW: open the New Release form, explain fields, then close ──
  await caption(page, { step: 4, title: 'Open New Release', text: 'Tap New Release to see the publish form.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /new release/i }).click(); await beat(page, 1000)

  await callout(page, 'input[placeholder="1.0.0"]', {
    title: 'Version', text: 'The semantic version, e.g. 1.3.0 — terminals compare against it to decide whether to update.',
  })
  await callout(page, 'textarea[placeholder^="What\'s new"]', {
    title: 'Release notes', text: 'What changed — shown to shopkeepers when the update prompt appears.',
  })
  await callout(page, 'input[placeholder^="https://img.pelbu.com/releases"]', {
    title: 'Download URL', text: 'Optional — link an already-hosted installer, or upload the file after creating the release.',
  })
  await callout(page, 'text=Mandatory update', {
    title: 'Mandatory update', text: 'Force terminals onto this build — used for critical fixes.',
  })
  await callout(page, 'text=Publish now', {
    title: 'Publish now', text: 'Make it live immediately; leave it off to keep the release as a draft.',
  })
  await callout(page, 'form button:has-text("Create")', {
    title: 'Create', text: 'Saves the release. Upload the installer next, then flip it to Published.',
  })
  await caption(page, { step: 5, title: 'Close the form', text: 'We tap Cancel to close without publishing.' })
  await clearHighlight(page)
  await page.getByRole('button', { name: /^cancel$/i }).click(); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 10 OF 11 — SETTINGS
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 6, title: 'Open Settings', text: 'Tap Settings to edit your own business profile.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/admin\/settings/, { timeout: 15000 }); await beat(page, 1400)

  await titleCard(page, {
    kicker: 'SCREEN 10 OF 11',
    title: 'Business Settings',
    sub: 'Your platform business’s own profile — the same form every vendor uses.',
  }, { hold: 2200 })

  await callout(page, 'h1:has-text("Business Settings")', {
    title: 'Business Settings', text: 'Edit the details that identify your business across Pelbu.',
  })
  await callout(page, 'text=Business Name', {
    title: 'Business Name', text: 'Your legal business name, shown on receipts and the console header.',
  })
  await callout(page, 'text=WhatsApp Number', {
    title: 'WhatsApp Number', text: 'The E.164 number Pelbu uses for OTPs, receipts and alerts.',
  })
  await callout(page, 'text=TPN / GSTIN', {
    title: 'TPN / GSTIN', text: 'Your Bhutan taxpayer number — it signs invoices for GST compliance.',
  })
  await callout(page, 'text=Shop Slug (for marketplace URL)', {
    title: 'Shop Slug', text: 'The URL-safe handle for your marketplace storefront address.',
  })
  await callout(page, 'text=Marketplace Bio', {
    title: 'Marketplace Bio', text: 'A short description shoppers see on your storefront.',
  })
  await callout(page, 'button:has-text("Save Changes")', {
    title: 'Save Changes', text: 'Persists your profile edits.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 11 OF 11 — DESKTOP LICENSES (/pos/licenses)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 7, title: 'Open Licenses', text: 'Tap Licenses to issue machine-locked terminal licences.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Licenses' }).click()
  await expect(page).toHaveURL(/\/pos\/licenses/, { timeout: 15000 }); await beat(page, 1600)

  await titleCard(page, {
    kicker: 'SCREEN 11 OF 11',
    title: 'Desktop Licenses',
    sub: 'Issue signed, machine-locked .lic files that activate AND provision each POS terminal.',
  }, { hold: 2600 })

  await callout(page, 'text=Desktop Licenses', {
    title: 'Desktop Licenses', text: 'This screen lives under POS, but it’s super-admin only — you issue and revoke terminal licences here.',
  })
  await callout(page, 'text=/Super-admin ·/', {
    title: 'Issued count', text: 'A running total of licences you’ve issued across every store.',
  })
  await callout(page, 'text=/Pending terminals/', {
    title: 'Pending terminals', text: 'New terminals that registered their Machine ID on first start — tap Use to pre-fill the issue form.',
  })
  await callout(page, 'text=Issue a desktop license', {
    title: 'Issue a licence', text: 'A machine-locked, signed .lic that also embeds the store, a sync token and the cloud address.',
  })
  await callout(page, 'select:has(option:has-text("Select store"))', {
    title: 'Store / vendor', text: 'Which business this terminal belongs to. Distributors and wholesalers are locked to back-office mode.',
  })
  await callout(page, 'input[placeholder^="Machine ID"]', {
    title: 'Machine ID', text: 'The Windows MachineGuid the licence is locked to — copy it from the terminal’s activation screen.',
  })
  await callout(page, 'select:has(option:has-text("POS terminal"))', {
    title: 'Terminal mode', text: 'POS = cash sales at a register; Back office = stock management only.',
  })
  await callout(page, 'select:has(option:has-text("STANDARD"))', {
    title: 'Tier', text: 'STANDARD, TRIAL or ENTERPRISE — the licence class for this terminal.',
  })
  await callout(page, 'input[placeholder="Valid days"]', {
    title: 'Valid days', text: 'How long the licence stays active before it must be renewed.',
  })
  await callout(page, 'input[placeholder="Label (optional)"]', {
    title: 'Label', text: 'An optional name (e.g. “Front counter”) so you can tell terminals apart.',
  })
  await callout(page, 'button:has-text("Issue & download")', {
    title: 'Issue & download', text: 'Generates the .lic and downloads it once — it carries a sync token and won’t be shown again.',
  })

  // ─────────────────────────────────────────────────────────────────────────
  // WRAP UP
  // ─────────────────────────────────────────────────────────────────────────
  await clearHighlight(page)
  await titleCard(page, {
    kicker: 'PLATFORM · SUPER ADMIN',
    title: 'That’s the whole console',
    sub: 'Entities & Payment QR, users, riders, catalog rules, releases, settings and licences — the entire platform, from one place.',
  }, { hold: 3000 })
  await caption(page, { step: 8, title: 'You’re ready to run the platform', text: 'That’s every screen — welcome to the control room.' }, 3200)

  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
