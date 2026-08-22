const { test } = require('@playwright/test')
const { installTour, titleCard, beat } = require('../lib/tour-overlay')

// Branded intro + outro cards for the stitched master training video. Rendered on a dark blank
// page so they match the per-tour title cards exactly (same overlay CSS).
test.describe.configure({ mode: 'serial' })

async function darkPage(page) {
  await installTour(page)
  await page.goto('about:blank')
  await page.evaluate(() => {
    document.documentElement.style.background = '#070c16'
    document.body.style.background = '#070c16'
  })
  await beat(page, 600)
}

test('intro card', async ({ page }) => {
  test.setTimeout(60_000)
  await darkPage(page)
  await titleCard(page, {
    kicker: 'Pelbu · Point of Sale',
    title: 'Guided Product Tour',
    sub: 'From the shop counter to the doorstep — the whole platform, one walkthrough.',
  }, { hold: 4800 })
  await beat(page, 700)
})

test('outro card', async ({ page }) => {
  test.setTimeout(60_000)
  await darkPage(page)
  await titleCard(page, {
    kicker: 'Pelbu',
    title: 'Ready when you are',
    sub: '4K Edge-AI POS · GST 2026 · Made in Bhutan',
  }, { hold: 4800 })
  await beat(page, 700)
})
