const { test } = require('@playwright/test')
const { VENDOR_USERS, TEST_ENTITY } = require('../fixtures/test-data')
const {
  installTour, titleCard, caption, callout, clearCaption, clearHighlight, beat,
} = require('../lib/tour-overlay')

// GUIDED TOUR — Platform Super-Admin · DESKTOP LICENSING (approval + issuance).
// Narrated as: a new POS terminal has self-registered its Machine ID and is waiting; the platform
// operator approves that request and issues the machine-locked .lic that activates AND provisions it.
// Walks /pos/licenses with a callout on every component — pending terminals, the issue form's fields,
// the Issue & download action, the one-time .lic panel, and the revoke control on the license list.
// Live login as admin@nexus.bt (Staff tab, password test1234). Author-only — the `tour` project records
// it (fresh context, no storageState); slow by design (project slowMo + char-by-char typing + beats).

// A stable prefix + a per-run suffix so every recording seeds a FRESH pending request (the tour issues
// the licence at the end, which would otherwise mark a fixed machine as LICENSED and hide the pending
// block on the next run). slice(0,16) of this === "TOUR-LIC-MACHINE" — that's what the license list row
// prints, so we can still spot our row regardless of the suffix.
const MACHINE_ID = `TOUR-LIC-MACHINE-${Date.now().toString(36).toUpperCase()}`
const BASE = process.env.BASE_URL || 'http://localhost:3000'

// Type a string one character at a time into a locator (visible, human-paced typing for the recording).
async function slowType(locator, text, delay = 90) { await locator.click(); await locator.pressSequentially(text, { delay }) }

// SEED — self-register a PENDING license request via the app's PUBLIC terminal endpoint, exactly as a
// real POS terminal does on first start (POST /api/license/request → upserts a license_requests row).
// Best-effort: if the box is down or the request fails, the callouts below fall back to captions.
test.beforeAll(async () => {
  try {
    await fetch(`${BASE}/api/license/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        machine_id: MACHINE_ID,
        hostname: 'FRONT-COUNTER-PC',
        app_version: '1.3.0',
      }),
    })
  } catch { /* best-effort seed — tour is tolerant of a missing pending row */ }
})

test('Super-admin tour — approve a terminal & issue its desktop licence', async ({ page }) => {
  // The Issue & download button triggers a blob download of the .lic — accept + discard it so the
  // click never hangs the recording.
  page.on('download', (d) => { d.saveAs(`/tmp/${d.suggestedFilename()}`).catch(() => {}) })

  await installTour(page)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — SIGN IN (platform operator)
  // ═════════════════════════════════════════════════════════════════════════
  await page.goto('/login'); await beat(page, 1000)
  await titleCard(page, {
    kicker: 'PLATFORM · DESKTOP LICENSING',
    title: 'Sign in as the operator',
    sub: 'Only the SUPER_ADMIN can approve terminals and issue licences — sign in on the Staff tab.',
  }, { hold: 2600 })

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
    title: 'Sign In', text: 'Confirms your credentials and drops you into the admin dashboard.',
  })

  await caption(page, { step: 2, title: 'Enter your credentials', text: 'Type your email and password, then Sign In.' })
  await clearHighlight(page)
  await slowType(page.getByPlaceholder('you@business.bt'), VENDOR_USERS.admin.email, 70)
  await slowType(page.getByPlaceholder('••••••••'), VENDOR_USERS.admin.password, 55)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/admin', { timeout: 30000 }).catch(() => {}); await beat(page, 1600)
  await clearCaption(page)

  const sidebar = page.locator('aside')

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — OPEN DESKTOP LICENSES (/pos/licenses)
  // ═════════════════════════════════════════════════════════════════════════
  await caption(page, { step: 3, title: 'Open Licenses', text: 'Tap Licenses to approve terminals and issue their .lic files.' })
  await clearHighlight(page)
  await sidebar.getByRole('link', { name: 'Licenses' }).click().catch(() => {})
  await page.waitForURL('**/pos/licenses', { timeout: 15000 }).catch(() => {}); await beat(page, 1600)

  await titleCard(page, {
    kicker: 'PLATFORM · DESKTOP LICENSING',
    title: 'Desktop Licenses',
    sub: 'A terminal has asked to be activated. Here you approve the request and issue a signed, machine-locked .lic.',
  }, { hold: 3000 })

  await callout(page, 'text=Desktop Licenses', {
    title: 'Desktop Licenses', text: 'This screen lives under POS, but it’s super-admin only — you approve, issue and revoke terminal licences here.',
  })
  await callout(page, 'text=/Super-admin ·/', {
    title: 'Issued count', text: 'A running total of licences you’ve issued across every store on the platform.',
  })

  // ── APPROVE: the pending terminal self-registration ──────────────────────
  await callout(page, 'text=/Pending terminals/', {
    step: 4, title: 'Pending terminals',
    text: 'A new POS registers its Machine ID here on first start and waits for you. Approving = issuing its licence.',
  }, 3200)
  await callout(page, 'button:has-text("Use")', {
    step: 5, title: 'Approve this terminal',
    text: 'Tap Use to accept the request — it drops the terminal’s Machine ID straight into the issue form below.',
  }, 3200)
  await page.locator('button:has-text("Use")').first().click().catch(() => {}); await beat(page, 1200)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — THE ISSUE FORM (explain every field)
  // ═════════════════════════════════════════════════════════════════════════
  await callout(page, 'text=Issue a desktop license', {
    step: 6, title: 'Issue a desktop licence',
    text: 'One signed .lic that BOTH activates the terminal AND provisions it — store, register, sync token and the cloud address, all baked in.',
  }, 3200)

  await callout(page, 'select:has(option:has-text("Select store"))', {
    title: 'Store / vendor', text: 'Which business this terminal belongs to. Distributors and wholesalers are locked to back-office mode.',
  })
  await caption(page, { step: 7, title: 'Pick the store', text: 'Choose the shop this terminal will ring sales for — Dawai Tshongkhang.' })
  await clearHighlight(page)
  await page.locator('select:has(option:has-text("Select store"))').selectOption({ value: TEST_ENTITY.id }).catch(() => {})
  await beat(page, 1100)

  await callout(page, 'input[placeholder^="Machine ID"]', {
    step: 8, title: 'Machine ID (pre-filled)',
    text: 'The Windows MachineGuid the licence locks to — already filled from the approved request, so no manual typing.',
  }, 3200)
  await callout(page, 'select:has(option:has-text("POS terminal"))', {
    title: 'Terminal mode', text: 'POS = rings cash sales at a register; Back office = stock management only. Retailers can choose either.',
  })
  await page.locator('select:has(option:has-text("POS terminal"))').selectOption('POS').catch(() => {})
  await callout(page, 'select:has(option:has-text("STANDARD"))', {
    title: 'Tier', text: 'STANDARD, TRIAL or ENTERPRISE — the licence class stamped onto this terminal.',
  })
  await page.locator('select:has(option:has-text("STANDARD"))').selectOption('STANDARD').catch(() => {})

  await callout(page, 'input[placeholder="Valid days"]', {
    title: 'Valid days', text: 'How long the licence stays active before it must be renewed — 365 days by default.',
  })
  await caption(page, { step: 9, title: 'Set the validity', text: 'Leave it at a year, or tighten it for a trial.' })
  await clearHighlight(page)
  await page.locator('input[placeholder="Valid days"]').fill('365').catch(() => {})
  await beat(page, 800)

  await callout(page, 'input[placeholder="Label (optional)"]', {
    step: 10, title: 'Label (optional)',
    text: 'A friendly name so you can tell terminals apart — e.g. “Front counter”.',
  })
  await clearHighlight(page)
  await slowType(page.locator('input[placeholder="Label (optional)"]'), 'Front counter', 70)
  await beat(page, 900)

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — ISSUE & DOWNLOAD THE .LIC
  // ═════════════════════════════════════════════════════════════════════════
  await callout(page, 'button:has-text("Issue & download")', {
    step: 11, title: 'Issue & download .lic',
    text: 'Signs the file, mints a per-terminal sync token, provisions the register — then downloads the .lic. Once.',
  }, 3200)
  await page.locator('button:has-text("Issue & download")').click().catch(() => {}); await beat(page, 2200)

  await callout(page, 'text=/downloaded\\./', {
    step: 12, title: 'Machine-locked & one-time',
    text: 'The .lic just downloaded. It’s locked to that machine and embeds the sync token — this panel won’t show it again.',
  }, 3400)
  await callout(page, 'button:has-text("Download again")', {
    title: 'Download again', text: 'Missed the save dialog? Grab the same file again — but only while this panel is on screen.',
  })

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — THE LICENSE LIST & REVOCATION
  // ═════════════════════════════════════════════════════════════════════════
  await callout(page, 'text=/machine TOUR-LIC-MACHINE/', {
    step: 13, title: 'Your new licence',
    text: 'The terminal now appears in the list — store, tier, register mode, machine and expiry, all at a glance.',
  }, 3200)
  await callout(page, 'button[title="Revoke"]', {
    step: 14, title: 'Revoke',
    text: 'This kills a terminal instantly — it deactivates the licence AND its sync token, so a lost or rogue machine goes dark. We’ll leave this one live.',
  }, 3600)

  // ─────────────────────────────────────────────────────────────────────────
  // WRAP UP
  // ─────────────────────────────────────────────────────────────────────────
  await clearHighlight(page)
  await titleCard(page, {
    kicker: 'PLATFORM · DESKTOP LICENSING',
    title: 'Terminal approved & live',
    sub: 'Approve the request, pick the store, issue the .lic — the terminal is activated, provisioned and syncing.',
  }, { hold: 3000 })
  await caption(page, { step: 15, title: 'That’s the licensing flow', text: 'One screen from a terminal’s request to a live, revocable licence.' }, 3200)

  await clearCaption(page); await clearHighlight(page); await beat(page, 800)
})
