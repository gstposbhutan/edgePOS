const { test: base, expect } = require('@playwright/test')
const { TEST_USERS } = require('../fixtures/test-data')

const test = base.extend({})

test.describe('Auth Setup', () => {
  const roles = [
    { key: 'retailer', user: TEST_USERS[0], file: 'e2e/storage/retailer-auth.json' },
    { key: 'manager', user: TEST_USERS[1], file: 'e2e/storage/manager-auth.json' },
    { key: 'owner', user: TEST_USERS[2], file: 'e2e/storage/owner-auth.json' },
  ]

  for (const { key, user, file } of roles) {
    test(`sign in as ${key} and save storage state`, async ({ page }) => {
      await page.goto('/login')
      await page.getByLabel('Email').fill(user.email)
      await page.getByLabel('Password').fill(user.password)
      await page.getByRole('button', { name: /sign in/i }).click()
      await page.waitForURL('**/pos**', { timeout: 30000 })
      await page.context().storageState({ path: file })
    })
  }
})
