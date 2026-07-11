import { defineConfig } from "@playwright/test";

// Electron-mode e2e: drives the REAL packaged app (main + renderer + embedded PocketBase) launched via
// Playwright's _electron on Linux. Run under a virtual display:  xvfb-run -a npm run test:e2e:electron
// The app self-hosts (static server :3200 + PocketBase :8090), so there is no webServer block here.
export default defineConfig({
  testDir: "./e2e/electron",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  globalSetup: "./e2e/electron/global-setup.ts",
  // navigationTimeout: the app keeps background cloud-sync connections open, so a goto waiting on the
  // full 'load' event can stall — cap it so a stuck navigation fails in seconds, never the whole test.
  // actionTimeout: same fast-fail for clicks/fills (mirrors the web tour project).
  use: { trace: "retain-on-failure", navigationTimeout: 30_000, actionTimeout: 20_000 },
});
