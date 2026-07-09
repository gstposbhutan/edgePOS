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
  use: { trace: "retain-on-failure" },
});
