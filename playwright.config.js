const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    locale: 'en-IN',
    timezoneId: 'Asia/Thimphu',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth-setup\.js/,
    },
    {
      name: 'retailer',
      testMatch: /v[1-7][a-z]?-.*\.spec\.js|c[1-5]-.*\.spec\.js|system-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/retailer-auth.json' },
      dependencies: ['auth-setup'],
    },
    {
      name: 'manager',
      testMatch: /v[2-7][a-z]?-.*\.spec\.js|c[4-5]-.*\.spec\.js|system-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/manager-auth.json' },
      dependencies: ['auth-setup'],
    },
    {
      name: 'owner',
      testMatch: /v[2-7][a-z]?-.*\.spec\.js|c[4-5]-.*\.spec\.js|system-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/owner-auth.json' },
      dependencies: ['auth-setup'],
    },
    {
      name: 'unauthenticated',
      testMatch: /v1-auth\.spec\.js|c1-marketplace\.spec\.js|c3-whatsapp-otp\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
