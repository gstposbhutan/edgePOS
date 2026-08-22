const { test, expect } = require('@playwright/test')
const { VENDOR_USERS: USERS } = require('../fixtures/test-data')

// Per-user email-notification permission model (three levels):
//   1. super-admin can toggle ANY user + riders
//   2. shop owner can toggle their own team members
//   3. each user can toggle their own pref
// In-app notifications always stay on; only email delivery is gated by this flag.

async function staffLogin(page, email, password) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Staff' }).click()
  await page.getByPlaceholder('you@business.bt').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
}

test('super-admin toggles any user email pref', async ({ page }) => {
  await staffLogin(page, USERS.admin.email, USERS.admin.password)

  const list = await page.request.get('/api/admin/users')
  expect(list.ok()).toBeTruthy()
  const { users } = await list.json()
  const target = users.find((u) => u.id === USERS.cashier.id)
  expect(target).toBeTruthy()
  expect(target).toHaveProperty('email_notifications_enabled')

  const before = !!target.email_notifications_enabled
  const patch = await page.request.patch(`/api/admin/users/${target.id}`, {
    data: { email_notifications_enabled: !before },
  })
  expect(patch.ok()).toBeTruthy()

  const after = await page.request.get('/api/admin/users')
  const updated = (await after.json()).users.find((u) => u.id === target.id)
  expect(!!updated.email_notifications_enabled).toBe(!before)
  console.log('ADMIN_USER_EMAIL_TOGGLE_OK')
})

test('super-admin toggles rider email pref', async ({ page }) => {
  await staffLogin(page, USERS.admin.email, USERS.admin.password)
  const list = await page.request.get('/api/admin/riders')
  expect(list.ok()).toBeTruthy()
  const { riders } = await list.json()
  test.skip(!riders.length, 'no riders seeded')
  const r = riders[0]
  expect(r).toHaveProperty('email_notifications_enabled')
  const before = !!r.email_notifications_enabled
  const patch = await page.request.patch(`/api/admin/riders/${r.id}`, {
    data: { email_notifications_enabled: !before },
  })
  expect(patch.ok()).toBeTruthy()
  const after = (await (await page.request.get('/api/admin/riders')).json()).riders.find((x) => x.id === r.id)
  expect(!!after.email_notifications_enabled).toBe(!before)
  console.log('ADMIN_RIDER_EMAIL_TOGGLE_OK')
})

test('owner toggles a team member; manager cannot', async ({ page }) => {
  // Owner path
  await staffLogin(page, USERS.retailer.email, USERS.retailer.password)
  const team = await page.request.get('/api/admin/team')
  expect(team.ok()).toBeTruthy()
  const list = (await team.json()).team || []
  const member = list.find((m) => m.id === USERS.cashier.id)
  expect(member).toBeTruthy()
  expect(member).toHaveProperty('email_notifications_enabled')
  const before = !!member.email_notifications_enabled
  const patch = await page.request.patch(`/api/admin/team/${member.id}`, {
    data: { email_notifications_enabled: !before },
  })
  expect(patch.ok()).toBeTruthy()
  console.log('OWNER_TEAM_EMAIL_TOGGLE_OK')

  // Manager (non-owner) must be forbidden
  await staffLogin(page, USERS.manager.email, USERS.manager.password)
  const denied = await page.request.patch(`/api/admin/team/${USERS.cashier.id}`, {
    data: { email_notifications_enabled: true },
  })
  expect(denied.status()).toBe(403)
  console.log('MANAGER_TEAM_EMAIL_FORBIDDEN_OK')
})

test('user toggles own email pref via settings', async ({ page }) => {
  await staffLogin(page, USERS.staff.email, USERS.staff.password)
  const get = await page.request.get('/api/admin/settings')
  expect(get.ok()).toBeTruthy()
  const before = !!(await get.json()).entity.email_notifications_enabled
  const patch = await page.request.patch('/api/admin/settings', {
    data: { email_notifications_enabled: !before },
  })
  expect(patch.ok()).toBeTruthy()
  const after = !!(await (await page.request.get('/api/admin/settings')).json()).entity.email_notifications_enabled
  expect(after).toBe(!before)
  console.log('SELF_EMAIL_TOGGLE_OK')
})
