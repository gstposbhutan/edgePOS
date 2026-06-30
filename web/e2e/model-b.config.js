const { defineConfig, devices } = require('@playwright/test')

// Minimal config for the Model-B lifecycle spec: targets the already-running container,
// no webServer, no globalSetup (the spec logs in itself and asserts via API responses).
module.exports = defineConfig({
  testDir: './specs',
  testMatch: /model-b-packages\.spec\.js/,
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    locale: 'en-IN',
    timezoneId: 'Asia/Thimphu',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'model-b', use: { ...devices['Desktop Chrome'] } },
  ],
})
