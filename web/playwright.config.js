const { defineConfig, devices } = require('@playwright/test')

// Note on parallelism: every spec mutates the same entity_id via clearCart/resetStock/
// cleanupTestOrders in e2e/specs/v2-helpers.js. Running tests in parallel against the
// same Supabase project causes cart/stock/order races. Keep workers:1 until the seed
// is sharded per worker (e.g. one entity_id per worker).
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  globalSetup: require.resolve('./e2e/setup/global-setup'),
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
    // Default project: runs the role-agnostic POS/cart/checkout/marketplace/system flows
    // once under cashier (retailer) auth. Anything role-gated is covered by the
    // 'manager' project below or by inline `test.use` inside the spec itself.
    {
      name: 'retailer',
      // v1-auth runs unauthenticated only; v3-v7 run under 'manager' only.
      testMatch: /v2[a-z]?-.*\.spec\.js|v8-.*\.spec\.js|v9-.*\.spec\.js|v10-.*\.spec\.js|c[1-2]-.*\.spec\.js|c[4-5]-.*\.spec\.js|system-.*\.spec\.js|f[1-5]-.*\.spec\.js|rider-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/retailer-auth.json' },
      dependencies: ['auth-setup'],
    },
    // Guided tours — slow-paced, every-click/keypress-visible walkthroughs recorded to video.
    // Fresh context (no storageState); each tour signs itself in. Run: --project=tour.
    {
      name: 'tour',
      testMatch: /tour-.*\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        video: { mode: 'on', size: { width: 1280, height: 800 } },
        launchOptions: { slowMo: 700 },
      },
    },
    // Specs that hard-code `test.use({ storageState: 'manager-auth.json' })` at file
    // level (v3, v4, v5, v7) or declare per-describe auth (v6). Running these under
    // multiple projects would just repeat identical work — the spec's own test.use
    // overrides the project storageState.
    {
      name: 'manager',
      testMatch: /v[34567]-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/manager-auth.json' },
      dependencies: ['auth-setup'],
    },
    // Pelbu keyboard-POS redesign (P1–P4) on /pos. video:'on' records every test
    // so the flows can be visually verified (not just green checkmarks). slowMo
    // spaces out each click/keystroke so the recording is watchable.
    {
      name: 'pelbu',
      testMatch: /pelbu-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/manager-auth.json', video: 'on', launchOptions: { slowMo: 500 } },
      dependencies: ['auth-setup'],
    },
    // B2B roles (distributor / wholesaler) — their consoles + role-gating. Each
    // spec sets its own storageState per describe. video + slowMo for review.
    {
      name: 'b2b',
      testMatch: /b2b-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], video: 'on', launchOptions: { slowMo: 500 } },
      dependencies: ['auth-setup'],
    },
    {
      name: 'unauthenticated',
      testMatch: /v1-auth\.spec\.js|c3-whatsapp-otp\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // p0 exercises the login form itself — must start logged out.
    {
      name: 'pocketbase-auth-flow',
      testMatch: /p0-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // p1 covers POS/cart/settings flows — uses saved PocketBase storage state.
    {
      name: 'pocketbase-pos',
      testMatch: /p1-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/storage/pocketbase-auth.json' },
      dependencies: ['auth-setup'],
    },
    // Catalog-vendor flow (Silver Pines): the spec logs in / stays anonymous per-describe,
    // so no project-level storageState.
    {
      name: 'catalog',
      testMatch: /catalog-.*\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Email-notification permission model — each test logs in as the role it exercises.
    {
      name: 'email-pref',
      testMatch: /email-pref-.*\.spec\.js/,
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
