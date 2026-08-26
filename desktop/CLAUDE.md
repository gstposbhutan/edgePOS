# `desktop/` — the offline terminal

The Electron + PocketBase register that runs on a shop counter. Read the repo-root `CLAUDE.md`
first; this file covers only what is different down here.

> The old version of this file described YOLO26 vision, Hono/Bun and a Turborepo monorepo. None
> of that shipped and this is not a monorepo. It was deleted 2026-08-26.

## Shape

- **TypeScript + Next.js**, exported static (`next build` → `out/`) and served by a tiny local
  HTTP server inside Electron. There is no Node server at runtime.
- **Own toolchain and lockfile** — `desktop/` is deliberately NOT part of the web npm workspaces.
  Install and build from inside this directory.
- **PocketBase is the database**, bundled as a platform binary under `pb/`. Schema lives in
  `pb/pb_migrations/*.js` (append-only, numbered); custom routes in `pb/pb_hooks/`.
- `electron/main.js` is the main process, `electron/preload.js` the only bridge to the renderer.

## Ground rules

- **Offline-first, not offline-only.** The terminal rides out an outage and reconciles later. It
  is strictly a POS register — the back office lives on web.
- **Drop-and-forget.** The operator is a shopkeeper, not an administrator. Anything that can go
  wrong on a random Windows PC must either heal itself or say plainly what is wrong. A terminal
  that carries on in a broken state is worse than one that refuses to start: see the 2026-08-26
  incident in `docs/HANDOVER.md`, where a port clash became a 3.7 GB frozen till.
- **Never name the incumbent ERP** in code, UI, docs or commit messages. Ours are "the counter"
  (till) and "the office" (back office).
- **Extend the office frame, do not rebuild it**: `components/office/` + `lib/office-keys.ts`.
- **Key matching is solved** in `hooks/use-keyboard-registry.ts`. It handles the macOS
  Option-glyph problem that a hand-rolled comparison gets wrong. Route through it. Rail buttons
  re-dispatch the keystroke they name, so one registry answers both tap and key.

## Things that bite

- **The PocketBase port is a range, 8090–8099** (`electron/pb-launcher.js`). Whatever wins is
  handed to the renderer via `electronAPI.pb.url` — never hardcode 8090 in renderer code. If the
  whole range is taken the app refuses to start, by design.
- **`app.getPath("userData")` holds `pb_data` AND `license.lic`** — the shop's entire local
  record. `nsis.deleteAppDataOnUninstall` MUST stay `false`. It was `true` until 1.6.2 and an
  uninstall wiped a live terminal.
- **A `.lic` cannot be re-sent.** It carries a plaintext per-terminal sync token stored only as a
  SHA-256. Lost licence = revoke and reissue in the admin panel.
- **PocketBase rejects a partial-index `WHERE` containing parentheses** (e.g. `IN (...)`). Use
  `OR`. This bricked v1.0.2 on boot.
- **The binary committed to git is x86-64.** On this aarch64 box run `npm run pb:fetch -- --force`
  before `npm run pb:serve`.
- **`electron:build:win` needs a real Windows toolchain** for NSIS — CI does it on
  `windows-latest`. Do not expect to produce an installer here.

## Releasing

Bump `package.json` version, commit, then tag `desktop-vX.Y.Z` and push the tag. CI builds on
Windows, uploads to S3 and registers with `${APP_URL}/api/desktop/releases/register`; terminals
pick it up on their next update check. **A tag containing `-beta` or `-rc` publishes to the beta
channel, which stable terminals never poll** — that is how to get an installer to QA without
touching a shop. Verify after: the `releases/latest` feed reports the new version, and the
installer URL returns HTTP 200 with a `content-length` matching the registered `file_size`.

## Tests

- `npx vitest run` — unit tests for `lib/` (GST, units, labels). It currently also globs the
  Playwright specs and reports them as failures; ignore those, or scope the include.
- `npm run test:e2e:electron` — Playwright against the packaged app under xvfb.
