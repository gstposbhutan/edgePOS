import { test, expect } from "./app-fixture";
import { execSync } from "node:child_process";

// F11 fullscreen toggle — owned by the MAIN process (before-input-event →
// BrowserWindow.setFullScreen) so it works on every screen with one fullscreen
// layer. Regression test for the stuck-fullscreen bug (default-menu WINDOW
// fullscreen vs renderer DOM fullscreen both bound to F11; F11/Esc seemed dead).
//
// Playwright's CDP-injected keys BYPASS before-input-event (verified), so this
// test sends REAL X11 keys via xdotool/XTEST. Requires a windowed X session with
// a WM that honors _NET_WM_STATE_FULLSCREEN:
//   xvfb-run -a sh -c 'openbox & sleep 1; npx playwright test ... fullscreen.spec.ts'
test("F11 (real X11 key) toggles window fullscreen on and off", async ({ electronApp, appPage }) => {
  let hasXdo = true;
  try { execSync("which xdotool", { stdio: "pipe" }); } catch { hasXdo = false; }
  test.skip(!process.env.DISPLAY || !hasXdo, "needs X DISPLAY + xdotool");

  const isFullScreen = () =>
    electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return win ? win.isFullScreen() : null;
    });

  // Focus the Electron window (search by the main-process pid), then XTEST-press F11.
  const pid = electronApp.process().pid;
  const winId = execSync(
    `xdotool search --sync --onlyvisible --pid ${pid} | head -1`,
    { stdio: "pipe" }
  ).toString().trim();
  expect(winId, "found the app's X window").toBeTruthy();
  const pressF11 = () => {
    execSync(`xdotool windowactivate --sync ${winId} key --clearmodifiers F11`, { stdio: "pipe" });
  };

  expect(await isFullScreen()).toBe(false);

  pressF11();
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(true);

  // The OFF leg — the reported bug was precisely that this didn't work.
  pressF11();
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(false);

  // Second full cycle: no layer-mismatch drift.
  pressF11();
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(true);
  pressF11();
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(false);

  // Renderer must never have entered DOM fullscreen — main consumes F11.
  expect(await appPage.evaluate(() => document.fullscreenElement !== null)).toBe(false);
});
