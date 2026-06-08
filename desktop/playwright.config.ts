import { defineConfig, devices } from "@playwright/test";

// P2-1 runtime check. Requires PocketBase running on :8090 (the app's default
// NEXT_PUBLIC_POCKETBASE_URL) with the role users seeded — see e2e/global-setup.ts.
// The webServer block boots the Next dev server; PocketBase is started separately
// (it's a Linux binary → run via Docker on Windows).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    // Port 3019 is used deliberately — :3000 is contended by another local project.
    baseURL: "http://127.0.0.1:3019",
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
  },
  // Served from the static production export (output: "export" → out/). The desktop
  // app doesn't hydrate reliably under headless dev (Turbopack/HMR), and prod is what
  // ships, so e2e runs against `next build` output via a static server.
  webServer: {
    command: "npx --yes serve out -l 3019",
    url: "http://127.0.0.1:3019",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "pocketbase", use: { ...devices["Desktop Chrome"] } },
  ],
});
