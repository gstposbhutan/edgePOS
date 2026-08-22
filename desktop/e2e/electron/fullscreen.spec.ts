import { test, expect } from "./app-fixture";
import { execSync } from "node:child_process";

// Alt+Enter fullscreen toggle — owned by the MAIN process (before-input-event →
// BrowserWindow.setFullScreen) so it works on every screen with one fullscreen
// layer. Regression test for the stuck-fullscreen bug (default-menu WINDOW
// fullscreen vs renderer DOM fullscreen both bound to one key; the key seemed dead).
//
// It used to be F11. The counter now follows the RanceLab map, which gives F11 to Day
// (day-end), so fullscreen moved to the other conventional Windows toggle and F11 is
// passed through to the renderer — asserted at the end.
//
// Playwright's CDP-injected keys BYPASS before-input-event (verified), so this
// test sends REAL X11 keys via xdotool/XTEST. Requires a windowed X session with
// a WM that honors _NET_WM_STATE_FULLSCREEN:
//   xvfb-run -a sh -c 'openbox & sleep 1; npx playwright test ... fullscreen.spec.ts'
test("Alt+Enter (real X11 key) toggles window fullscreen on and off", async ({ electronApp, appPage }) => {
  let hasXdo = true;
  try { execSync("which xdotool", { stdio: "pipe" }); } catch { hasXdo = false; }
  test.skip(!process.env.DISPLAY || !hasXdo, "needs X DISPLAY + xdotool");

  const isFullScreen = () =>
    electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return win ? win.isFullScreen() : null;
    });

  // Focus the Electron window (search by the main-process pid), then XTEST-press the key.
  const pid = electronApp.process().pid;
  const winId = execSync(
    `xdotool search --sync --onlyvisible --pid ${pid} | head -1`,
    { stdio: "pipe" }
  ).toString().trim();
  expect(winId, "found the app's X window").toBeTruthy();
  const press = (key: string) => {
    execSync(`xdotool windowactivate --sync ${winId} key --clearmodifiers ${key}`, { stdio: "pipe" });
  };

  expect(await isFullScreen()).toBe(false);

  press("alt+Return");
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(true);

  // The OFF leg — the reported bug was precisely that this didn't work.
  press("alt+Return");
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(false);

  // Second full cycle: no layer-mismatch drift.
  press("alt+Return");
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(true);
  press("alt+Return");
  await expect.poll(isFullScreen, { timeout: 10_000 }).toBe(false);

  // F11 belongs to the counter (Day) now — the main process must NOT consume it for
  // fullscreen any more.
  press("F11");
  await appPage.waitForTimeout(1000);
  expect(await isFullScreen(), "F11 no longer toggles fullscreen").toBe(false);

  // Renderer must never have entered DOM fullscreen — main owns the window fullscreen.
  expect(await appPage.evaluate(() => document.fullscreenElement !== null)).toBe(false);
});
