# Handover — the back office reads like the counter

**Read this section first.** Written 2026-08-26. **`main` is the product** (the `v2` branch
became `main` at the cutover; the pre-homecoming tree is tagged `legacy/main`). Everything below
this section is history kept for reference, newest first — read it for how something came to be,
not for what is true now.

## Where things stand

| | |
|---|---|
| Web | LIVE on pos.pelbu.com, build `i9yoQ4hBLkP0IO1NpouIq` |
| Desktop | **1.6.2** tagged and released to the **stable** channel |
| Branch | **`main`** — work here. `origin/v2` is a frozen marker of the cutover; do not push to it. |
| Migrations | lineage at **139**, all applied on this box — the only environment |

## What the reskin changed

Innovates cannot retrain staff, so the product wears the incumbent ERP's shape. The till
already did; this work took the BACK OFFICE the same way, on both surfaces, so a shopkeeper
crossing from the ticket to a report no longer changes visual language mid-task.

Every framed screen has three fixed places: a **band** naming the screen, a **register** holding
the data in columns with its totals underneath, and a **rail** printing every key the screen
answers. Web frame: `web/components/pos/office/`. Terminal: `desktop/components/office/`.

**Web — eleven routes framed**, plus the product card:
`/pos/reports` (Tax Register) · `/pos/khata` (Bills Receivable, with aging) · `/pos/purchases` ·
`/pos/products` + `/pos/products/[id]` (the card: the whole record on one sheet) ·
`/pos/inventory` · `/pos/inventory/ledger` (Stock Ledger) · `/pos/registers` · `/pos/shifts` ·
`/pos/orders` · `/pos/reports/day-book` · `/pos/reports/cash-book` · `/pos/stores`, `/pos/team`,
`/pos/settings`. Only `/pos/licenses`, `/pos/order`, `/pos/terminals` and `/pos/touch` are still
on the console look, and none of them is a back-office screen.

**Terminal — all six local screens**: `/stock`, `/adjustments` (now the Cash Book, with the
balance carried down), `/b2b-orders`, `/customers`, `/online-orders`, `/settings`.

**Three new reports**, all from data already held, no migration: Stock Ledger, Day Book, Cash Book.

## Things that will bite you

- **`next dev` writes to `web/.next`, and the Dockerfile copies that directory into the image.**
  Always `rm -rf .next && npm run build` with `web/.env.local` ABSENT before
  `docker compose build pos`, then check `grep -rl "localhost:3000" .next/static` comes back
  empty. A dev server left running is enough to publish a bundle wired to localhost.
- **Location is `Ctrl+⇧L` on web and the real `F12` on the terminal.** Not an inconsistency:
  F12 belongs to the browser's devtools and no page can cancel it.
- **Key matching is already solved** — `web/lib/pos/shortcuts.js` `matches()` and
  `desktop/hooks/use-keyboard-registry.ts`. Both handle Option rewriting the character on macOS
  (`Alt+L` arrives as `¬`), which a hand-rolled comparison gets wrong. Do not write a third one.
- **`E2E_FORCE_SEED=1` is broken.** The fixture sends `role`, `tpn_gstin` and `shop_slug` on
  `entities`, which moved to `merchant_profiles`, so the seed aborts on its first write. The
  suite therefore never restores its fixtures and corrodes them a little every run — which is why
  khata payment tests drift. Fixing the fixture is the root cause.
- **Local e2e needs two env overrides** or it points at production:
  `NEXT_PUBLIC_APP_URL=http://localhost:3000` (else `proxy.js` redirects to pos.pelbu.com) and
  `NEXT_PUBLIC_COOKIE_DOMAIN=` (a `.pelbu.com` cookie is rejected on localhost, so login never
  sticks). Pass them to the dev process — NOT via `.env.local`, which is the deploy trap above.
- **The terminal's PocketBase binary in git is x86-64**; this box is aarch64. Local runs need
  `npm run pb:fetch -- --force`, and `npm run pb:serve` writes to `desktop/pb_data/`.
- **"Could not start local database" usually means something else holds the port** — not a
  corrupt database. On 2026-08-26 a terminal had **VS Code** sitting on `127.0.0.1:8090` for two
  days. Diagnose with `netstat -ano | findstr ":8090"` then `Get-Process -Id <PID>`, and *read the
  process name* — it is not always `pocketbase`. Do NOT delete `pb_data`: that destroys unsynced
  sales and fixes nothing. Since 1.6.1 the launcher probes 8090–8099 and quotes PocketBase's own
  error, so this should not recur; older terminals still show the bare message.
- **Uninstalling used to delete the shop's books.** `nsis.deleteAppDataOnUninstall` was `true`
  until 1.6.2, so removing the app wiped its user-data folder — `license.lic` and `pb_data`
  both. A `.lic` **cannot be re-sent** (it carries a plaintext sync token stored only as a hash),
  so the recovery is revoke-and-reissue in the admin panel. The fix ships in the uninstaller, so
  it only protects terminals removed from **1.6.2 onward** — a terminal on 1.6.1 or earlier still
  loses everything when uninstalled. Take a copy of `%APPDATA%\pos-terminal` first.
- **The user-data folder is `%APPDATA%\pos-terminal`, NOT `%APPDATA%\Pelbu POS`.** `productName`
  is set only under `build.productName` (electron-builder's config); Electron's `app.getName()`
  reads the TOP-LEVEL `productName` and falls back to `name`, which is `pos-terminal`. **Do not
  "fix" this by adding a top-level `productName`** — that would move `userData` for every
  installed terminal and strand its `pb_data` and `license.lic` where the app no longer looks.

## Not verified

- **Desktop 1.6.2 has had no Windows runtime QA.** The six screens were checked in a browser
  against the same code, not the packaged app. Unverified: the NSIS installer, printer paths,
  path separators, and whether **F12** reaches the app rather than Electron. Also unverified on
  Windows: the 1.6.1 port probe, the fail-closed database dialog, and the preload URL bridge.
  What a real terminal DID prove on 2026-08-26 is that the bundled PocketBase binary runs, and
  that all 28 app migrations apply cleanly from an empty data directory.
- Nobody has used the reskinned screens as a signed-in shopkeeper.
- Two design calls were made without the client: the Cash Book counts **cash only** (credit and
  online takings never enter the drawer, so including them would give a balance no till count
  could reconcile), and the Day Book does **not net** sales against purchases.

## What is next

`docs/frs/REFERENCE-SCREEN-GAP.md` audits every screen in the reference recording against the
real schema. Buildable next with no migration: nothing left of the easy set — Day Book and Cash
Book were the last two. What remains needs a feature first (Stock Discrepancy needs stock-take
counts; Bills Payable needs a supplier ledger) or is an accounting suite — Trial Balance, P&L,
Balance Sheet — which means building a general ledger and should be a scope conversation with
Innovates, not a backlog item.

## The first terminal in the field, 2026-08-26

A real Windows terminal reported "Could not start pocketbase", an unresponsive UI, and no
recovery from uninstall + reinstall. It was worth the day: nothing was wrong with the release,
and four separate defects were hiding behind one useless error message.

**VS Code held `127.0.0.1:8090`.** PocketBase could not bind, the app said "Could not start local
database" — and then **carried on booting**, pointed its client at 8090, and spent ~700 sockets
and 3.7 GB talking to the editor until the till froze. Reinstalling could not help: a port is
machine state.

Shipped as **1.6.1**: the launcher probes 8090–8099 and takes the first port it can actually
hold; the renderer is *told* the address over the preload bridge (`electronAPI.pb.url`) instead
of assuming 8090; PocketBase's own last line is quoted in the dialog; and a database that will
not start is now **fatal** — a till drawn over a dead database looks workable, takes keystrokes
and records nothing. The health check also verifies the responder is PocketBase, closing the gap
where another process claims the port between probe and bind.

Then a licence request "never arrived" in the admin panel. It had arrived; the server answered
`{status:"LICENSED"}` — already licensed, no request created — and `activation.html` discarded
that and said "ask your administrator", sending the operator to watch for a row that could not
appear. Behind it sat the real damage: **`nsis.deleteAppDataOnUninstall` was `true`**, so the
uninstall would have wiped `%APPDATA%\pos-terminal` — the licence *and* `pb_data`. Both fixed in
**1.6.2**. (Care with the evidence here: the empty `pb_data` that first suggested data loss was an
artifact of running PocketBase by hand against a `--dir` that did not exist. The uninstall setting
was real; the wipe was not proven.)

The lesson worth keeping: every one of these turned a small, ordinary problem into a dead
register, because the terminal preferred to carry on rather than say what was wrong. Prefer
failing loudly and early. Read `desktop/CLAUDE.md` before changing anything under `desktop/`.

---

## Shipped today

- **Web is LIVE at pos.pelbu.com** with the counter UI. Deployed by rebuilding the host
  bundle and the `pelbu-pos` image (`npm run build` in `web/`, then `docker compose build pos &&
  docker compose up -d pos`). Verified in a real browser on the live host: the till bar, the
  barcode row, no sidebar, the paged rail, Alt+O, and no page errors.
  **The deploy trap:** the image copies the HOST's `web/.next`, so whatever was last built is
  what ships. Build with `web/.env.local` deleted, or you will publish a bundle wired to
  localhost. Check with `grep -r "localhost:3000" web/.next/static` before building the image.
- **Desktop 1.5.0 tagged and published** (`desktop-v1.5.0`), stable channel — every terminal
  picks it up on its next update check. Shawn's call to go straight to stable.
- **Migrations 134–138 are applied on this box**, which is the only environment.

## What was verified before releasing, and how

The Windows-QA gate the previous handover set could not be met from here, so the equivalent was
run on this box against the REAL packaged arm64 build (`npx electron-builder --linux dir
--arm64`, then the binary under `xvfb-run`). Between them these cover the failure that bricked
v1.0.2, which was a PocketBase config change and therefore platform-independent:

- **Upgrade path.** Built a v1.4.0-era database (migrations ≤024 only), then booted the 1.5.0
  migration set against it: 25 → 29 applied, PocketBase still healthy, Batch API on, the 14
  repaired fields present, unit ladder and remark present.
- **Fresh install.** The packaged app on a clean user-data dir: 29/29 migrations, Batch API on,
  activation window opens.
- **Vendor login with web credentials.** Mirrored a real cloud bcrypt hash through
  `/api/custom/sync-user` into a fresh terminal, then signed in with the WEB password — and
  confirmed a wrong password is still rejected.

**Still genuinely untested:** Windows-specific packaging (NSIS installer, printer paths, path
separators). If a terminal misbehaves after updating, that is where to look first.

## What changed, in one paragraph

The desktop counter was already feature-complete against `docs/keyboard-shortcuts.html`. This
pass brought the **web till to the same place**: it now wears the counter layout (full-screen
ticket, status strip, always-focused barcode row, the spec's column order, the paged key rail)
and every key the terminal has, except the ones a browser genuinely cannot deliver. Two
decisions were Shawn's and are recorded here because they shaped the work: the web till takes
the **full terminal look** (no sidebar — the back office is reached by the Office letter menu on
Alt+O), and the **GST bill-discount bug was fixed on both tills** rather than left marked.

## The keys the web till now has

`F5` rate change · `Alt+U` unit sheet (Pcs/Pack/Case) · `Ctrl+T` item remark · `Alt+T`
GST-included basis · `Ctrl+B` barcode labels · `Ctrl+Z` undo the last removal · `F11` day-end ·
`Alt+O` the Office letter menu. Enter now walks a line the way the spec says — qty, then unit,
then rate, then back to the barcode row. `todo` no longer appears on any entry in
`web/lib/pos/shortcuts.js`, matching the terminal.

**The one key a browser cannot take is `F12`** — it belongs to the devtools and no page can
cancel it. Location therefore carries a second combo, `Ctrl+⇧L`, and the rail prints it under
the F12 button so the key is never a promise the page cannot keep. `F11` IS cancellable in
Chrome and Edge, so Day keeps its inherited key there. Silent thermal printing, native
notifications and offline operation stay **desktop-only**: a browser cannot drive a printer
without a dialog, and the web till is not the offline register.

## Four migrations, applied on this box only

| # | What | Why it matters |
|---|---|---|
| `136_cart_item_units_remark.sql` | `pos.cart_items` += `unit_label`, `unit_factor`, `remark` | The web cart is server-side, so a line rung in cartons has nowhere else to remember it |
| `137_stock_moves_in_pieces.sql` | The four stock triggers multiply by `unit_factor` | **Selling 2 cases of 240 took 2 pieces off the shelf.** See the trap below |
| `138_cart_gst_included.sql` | `pos.carts.gst_included` | Alt+T has to reach the server, or the slip's lines and its total disagree about which way the tax ran |

(`134` and `135` from the terminal's pass are still un-applied to staging and production too —
that item has not moved.)

**The trap in 137, because it will cost the next person an hour:** the POS *tables* live in the
`pos` schema after the 121 flip, but these trigger FUNCTIONS are still `public.<name>()` carrying
`SET search_path = pos, public`. Identically-named copies exist in `pos` and are bound to
nothing. Replacing those changes no behaviour at all — check `pg_trigger` before assuming which
copy is live.

## The GST fix — what it changes on a real bill

A ticket mixing exempt goods (rice, sugar) with a **bill-level** discount used to charge 5% on
the exempt lines too. The discount now reduces every line pro-rata and only the taxable share
carries tax:

    Rice 500 + sugar 85 (exempt) + soap 100 (taxable), 10% off the invoice
    before:  GST on 616.50 = 30.83
    after:   GST on  90.00 =  4.50

Nothing changes for a ticket with no bill discount, or one with nothing exempt on it — those
paths are byte-identical. `desktop/lib/gst.ts` and `web/lib/gst.js` carry the same maths, and
the desktop suite now covers it (51 unit tests, up from 48). Two further web-only exempt bugs
were fixed while in there: the cart's `discount` and `override_price` actions hard-coded 5%, so
discounting an exempt line re-added tax to it.

## What is verified, and what is not

- **Desktop unit tests: 51/51 green** (`cd desktop && npx vitest run lib/`).
- **Web build: clean.**
- **Web e2e: 27/27 green** — `--project=pelbu`, which is auth-setup (6) plus all four Pelbu
  specs (21): two new ones written here (`pelbu-counter-look` 7, `pelbu-counter-line-keys` 6)
  and the two older ones re-pointed at the current key map and current copy (`Alt+D` → `Ctrl+L`,
  `Alt+Q` → `Ctrl+Q`; the price-list spec had been testing an `F7` badge that never existed in
  `web/` and now tests the real `Alt+P`; `Convert to Quotation` → `Save as draft`; `Exchange —`
  → `Return —`; F6 now needs a line, because salespeople are attributed per line).
- **Not verified:** a real sale rung end-to-end in a browser by hand, and the label print
  dialog (it opens an OS dialog, which no harness can assert on).

**Running the web suite on this box** needs three things the harness does not tell you:
1. Playwright's Docker image, matched to the installed version — chromium refuses on
   ubuntu26.04-arm64. Mount the **repo root** and `-w /work/web`, or the config cannot resolve
   `@playwright/test` (it is hoisted to the root `node_modules`).
2. The app must serve from **this machine**, and `proxy.js` redirects to
   `NEXT_PUBLIC_APP_URL` — which is `https://pos.pelbu.com` in `web/.env`. A local run without
   an override silently tests the DEPLOYED build instead of yours. `web/.env.local` with
   `NEXT_PUBLIC_APP_URL=http://localhost:3000` fixes it; **delete that file afterwards.**
3. `next start` does not work with `output: standalone`. Run
   `node .next/standalone/web/server.js` — and copy `.next/static` and `public` into
   `.next/standalone/web/` first, or every page renders blank and the failure looks like a
   selector problem. Load `web/.env` into that process too (`set -a; . web/.env; set +a`), or
   every sign-in hangs on "Signing in…".
4. **`NEXT_PUBLIC_*` is inlined at BUILD time**, so a runtime override cannot move it. That bites
   twice: `NEXT_PUBLIC_APP_URL` (above) and `NEXT_PUBLIC_COOKIE_DOMAIN=.pelbu.com`, which makes
   the auth cookie one a `localhost` browser drops on the floor — the login form just sits on
   "Signing in…". Both belong in `web/.env.local`, followed by a rebuild.
5. **The e2e admin client must ask for the `pos` schema.** `createClient(url, key)` talks to
   `public`, where `carts` and `products` do not exist, so every seed and cleanup silently
   no-ops and the failure looks like the feature. Pass `{ db: { schema: 'pos' } }` — the older
   helpers in `e2e/specs/v2-helpers.js` do NOT, which is worth knowing before trusting
   `clearCart()`.
6. **Gate on `[data-ticket-ready="true"]`, not on the till bar being painted.** The cart loads
   asynchronously; a key pressed in that window can only report "ticket still loading", and the
   spec then waits out its whole timeout against a page that looks perfectly healthy. This is
   the web twin of the terminal's `waitForShortcutsReady` trap.

## Still open — unchanged by this pass

1. **Apply migrations 134–138 to staging and production.** All are additive and idempotent.
2. **QA the four PocketBase migrations on a REAL Windows terminal before tagging** (025, 026,
   027, 028). Unchanged: xvfb here is not enough.
3. **The desktop release blocker is NOT the CI secrets.** `APP_URL` and `RELEASE_INGEST_TOKEN`
   (and the AWS pair) all exist on `gstposbhutan/edgePOS`, set 2026-06-16 — the previous
   handover was wrong about this. The real blocker: `.github/workflows/desktop-release.yml`
   POSTs the installer to `${APP_URL}/api/desktop/releases/upload`, which **404s in production**
   and does not exist in this repo. `web/` only has `/api/desktop/releases/register`, which takes
   JSON metadata and a `download_url` — no file upload, no S3 write. Either port the keyless
   upload route from the monorepo, or point the workflow back at the two-step keyed path (`aws
   s3 cp` with the AWS secrets that are already there, then POST to `/register`). Its own git
   history has that version: `git show 4a73118:.github/workflows/desktop-release.yml`.
4. **The Alt+P flake on the terminal** ("counter-line" spec, ~1 run in 3) is still unexplained
   and still pre-existing.

---

# Handover — the terminal counter is feature-complete (superseded)

**Superseded by the section above** — kept because its traps and test instructions still hold.
Written 2026-08-23. Branch `v2`, head **`cf8a430`**, **pushed to
`origin/v2`**, working tree clean. Everything below this section is history kept for reference —
the build record for the parity work, then the Phase 2 port.

## State in one paragraph

The desktop terminal now implements **the whole the incumbent ERP Counter key table**. The last five keys
the spec reserved — Alt+U unit sheet, Ctrl+T item remark, Alt+T GST-included, F2 bill date,
Ctrl+B barcode print — were built in `cf8a430`; `todo` no longer appears on any entry in
`desktop/lib/pos-shortcuts.ts`. Verified at 48 unit tests, 29/29 Electron specs over three
consecutive runs, fullscreen passing under a WM, and both apps building clean. **No product work
is queued.** What remains is release mechanics and two decisions that are Shawn's.

## Do these next, in this order

1. **Apply migrations 134 + 135 to staging and production.** They exist only on this box's local
   Supabase. `134_pack_case_units.sql` (the Pcs/Pack/Case ladder) and `135_order_item_remark.sql`
   are both additive and idempotent — every column is nullable or defaulted, and no existing read
   path changes. Apply via `docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1`.
2. **QA four PocketBase migrations on a REAL Windows terminal before tagging.** 025 (enables the
   Batch API — without it every sale fails outright), 026 (repairs 14 fields that never existed),
   and now 027 (unit ladder) + 028 (item remark). 027/028 are additive and low-risk, but a PB
   config change bricked v1.0.2 boot before. xvfb on this box is not enough.
3. **Recreate the CI secrets** `APP_URL` and `RELEASE_INGEST_TOKEN` on this repo — they only ever
   existed on the monorepo's GitHub, and a `desktop-vX.Y.Z` tag will not publish without them.
   This is the actual release blocker.
4. **Then tag a release.** Notes are already drafted under "Unreleased" in `desktop/CHANGELOG.md`.

## Two decisions waiting on Shawn — do not guess these

- **The web till's remap (`7716521`) is still undeployed**, so production web is unchanged either
  way. Keep it or revert that one commit; the two web bug fixes in `b435161` are worth keeping
  regardless. Also `pelbu-customer-pricelist.spec.js` tests an F7 price-list feature that does not
  exist in `web/` — stale, and failing before any of this work.
- **A real GST bug, deliberately left alone.** `calcCartTotals`' bill-discount branch does not
  consult per-line `gstExempt`, so a ticket that mixes exempt goods (rice, sugar) with a
  **bill-level** discount charges 5% on the exempt lines too. It pre-dates this work, the web cart
  shares the shape, and fixing it changes the totals on every such bill — so it is marked in
  `desktop/lib/gst.ts` and left for a deliberate call rather than changed quietly. The
  no-bill-discount path is per-line and does honour exemption.

## The one thing that will make Alt+U look broken

**The unit sheet is inert until a shop fills in pack sizes.** The factors live on the item master
(web back office → product form → "Pack sizes"), and an item with none configured reports
"sold in Pcs only — no pack size set" instead of opening a sheet. That refusal is deliberate — a
Pcs/Pack/Case sheet built on a guessed factor would invent quantities and mis-deduct stock — but
if nobody has entered any, the key will look dead. **Terminals also need to re-bootstrap** to
pull the new fields down (`sync/bootstrap` now ships `pack_size`, `case_size` and the labels).

Stock is only ever held and moved in **pieces**. A line keeps its quantity in the sold unit and
its price per one of that unit, so `quantity x unit_price = total` still holds; the factor enters
only where stock is read or written. Cloud stock reconciles from `inventory_movements`, not order
lines, so the terminal writing pieces needed no cloud-side stock change. The model and its 18
tests are in `desktop/lib/units.ts` — read the header comment there before changing anything, in
particular why this is NOT the vendor-console package model (084/085).

## Two harness traps that cost real time

- **A key pressed after `reload()` but before the counter's shortcut effect registers is swallowed
  silently.** The spec then waits out its entire timeout on an assertion that can never pass, and
  the trace shows a perfectly healthy page. `#pos-barcode` being visible is NOT sufficient. Gate on
  `waitForShortcutsReady()` in `e2e/electron/app-fixture.ts`.
- **Specs seed products by barcode and REUSE the existing row** (a fresh id would orphan cart lines
  pointing at the old one), so two specs sharing a barcode silently rename each other's product and
  the loser fails a long way from the cause. There is now an allocation registry at the top of
  `app-fixture.ts` — claim a number there before seeding.

Also: a `git stash` of `desktop/` reverts the arm64 PocketBase binary, after which every spec fails
in ~12ms and it looks nothing like a binary problem. Re-fetch after any stash or pop.

**Known pre-existing flake, not from this work:** `counter-line` "Alt+P cycles the price list"
fails roughly 1 run in 3, and 4 of 6 when repeated in isolation. Verified at the same 4-of-6 rate
against a stashed pre-parity tree. Alt+P silently does nothing — the tier never changes and the
line never reprices. `waitForShortcutsReady` does **not** help it, so the cause is something other
than registry arming; start there rather than assuming it is the same bug.

---

# Build record — the incumbent ERP parity on the desktop terminal

Written 2026-08-22 across two sessions, amended 2026-08-23. **No longer the live work** (see the
section above), but still the reference for how the counter is put together, what will bite you
before a release, and how to run the tests. Nothing here has been superseded.

## Why this work exists

The client's shops are trained on **the incumbent ERP** ERP/POS. Our UI forced them to relearn, so
**adoption was zero** — this is the top product priority, ahead of the camera pad. The
requirement is `docs/keyboard-shortcuts.html` (wireframes WF-01…WF-10 + full key tables).

Two decisions from Shawn that shape everything:
- **The client uses the DESKTOP terminal, not the web till.** "web can remain the same".
- **The desktop must mimic the incumbent ERP's UI**, not merely its keys.

⚠ The older `web/docs/features/*keyboard*` docs describe the OLD system and are **not** the
requirement — "the docs merely reflect the existing system". One wrong diagnosis was caused by
trusting them. Trust `docs/keyboard-shortcuts.html` and the code.

## What is done (all committed + pushed)

Desktop, in the order it was built: key map as a single source of truth → the incumbent ERP ticket
columns → always-focused barcode row → rate editor + Enter cycle → till status bar →
keyboard-complete tender sheet → Office letter navigation → price list + reprint → split tender.

- `desktop/lib/pos-shortcuts.ts` — **the Counter key map, as data.** Drives the bindings, the
  two-page footer rail and the F1 sheet. Those three each kept their own copy before and had
  drifted apart; do not reintroduce a second list.
- `desktop/lib/office-menu.ts` + `components/office/` — the Office letter strip (WF-08/09).
- `desktop/components/pos/keyboard/` — barcode row, till bar, cart table, listing footer.
- Split tender: `orders.payments` holds the parts; `payment_method` stays the largest part
  because the cloud CHECKs that enum and reports group by it.

The **web** till was also remapped (`7716521`) and is verified but **never deployed** — so
production web is unchanged either way. If Shawn wants web left alone, revert that one commit;
the two web bug fixes in `b435161` are worth keeping regardless.

## Things that will bite you — read before releasing

1. **Migration 025 enables the PocketBase Batch API.** Checkout writes the order, stock,
   movements and khata in ONE batch. PocketBase ships with batch DISABLED and nothing turned it
   on, so on a default-settings terminal **every sale failed outright**. This was invisible
   until a test rang a real sale.
2. **Migration 026 repairs 14 fields that never existed.** Every migration from 007 on guarded
   with `try { getByName(x); exists = true } catch {}`, assuming a missing field *throws*. It
   returns `undefined` — so the guard always said "already present", nothing was added, and
   PocketBase recorded the migration as applied. PocketBase then silently drops unknown fields
   on write. Missing: bill discount, salesperson, invoice date, quotation flag, delivery
   address, complimentary reason, GST-exempt (products + cart lines), distributor price, and
   the printer + NQRC payment-QR settings. **Those values had been going nowhere on every
   terminal.** Guards corrected for fresh installs; 026 repairs existing ones.
   → **Both migrations change installed terminals. A PB config change bricked v1.0.2 boot
   before (see the notes on partial-index parens). Exercise them on a real Windows terminal
   before tagging a release — xvfb here is not enough.**
3. **Electron fullscreen moved F11 → Alt+Enter**, because the counter map gives F11 to Day.
   Terminals in the field will notice; tell the shopkeepers before the release goes out.
4. **`window.prompt` is not implemented in Electron — it throws.** Never use it. Use
   `components/pos/amount-prompt-modal.tsx`.
5. **The shared `Input` component does not forward `id`** (base-ui primitive underneath), which
   breaks label association and lookups. Use a plain `<input>` when you need an id.

## The five reserved keys — now built (concluded 2026-08-23, commit `cf8a430`)

All five work; `todo` no longer appears on any entry in `desktop/lib/pos-shortcuts.ts`.

**Alt+U unit sheet** was the one that needed data, and the data now exists. The vendor-console
package model (cloud 084/085) does carry factors in `package_items.quantity`, but it is **Model
B** — pallet/box/piece are three separate stock-carrying products — and `sync/bootstrap` filters
`product_type='SINGLE'` precisely to keep sealed-unit stock off the till. A retail counter needs
**Model A**: one line, one stock pool in pieces, quantity scaled by a factor. So the ladder is
two integers on the item master:

- **cloud migration 134** — `pos.products.pack_size` (pieces per pack), `case_size` (PACKS per
  case), `pack_label` / `case_label`, plus `pos.order_items.unit_label` / `unit_factor`. CHECKs
  reject a factor <= 1, a case without a pack, and a pack on a weighed item, so a bad
  configuration can never reach the counter and invent a quantity.
- **PB migration 027** mirrors it on the terminal; **028** adds `cart_items.remark`; **cloud 135**
  adds `pos.order_items.remark`.
- `desktop/lib/units.ts` is the ladder (18 unit tests). **Stock is only ever held and moved in
  pieces** — checkout multiplies by the factor, so the cloud reconciles through the existing
  `apply_inventory_movement` trigger with no cloud-side stock change. Returns restock pieces too.
- A level the shop has not configured is ABSENT from the sheet, and Alt+U on an unconfigured
  item says so. That refusal is the feature.

**Alt+T GST-included** re-splits tax out of the entered rate rather than adding it on
(`lib/gst.ts`, 13 unit tests; the exclusive path is byte-identical to before). It refuses to
flip mid-ticket and the till bar states the live basis. **F2** sets the bill date, owner-only —
the header field was previously shown to managers too but checkout only ever honoured an owner,
so the gate now matches what takes effect. **Ctrl+T** is a per-line remark, on the ticket and on
the slip. **Ctrl+B** prints labels for the highlighted line through the existing label pipeline.

Three prompt modals now exist because `window.prompt` throws in Electron: amount, date, text.

### Found while doing this — NOT fixed, needs a decision
`calcCartTotals`' bill-discount branch does not consult per-line `gstExempt`, so a ticket that
mixes exempt goods (rice, sugar) with a **bill-level** discount charges 5% on the exempt lines
too. It pre-dates this work and the web cart shares the shape, so it was left alone rather than
silently changing every existing bill — the comment in `lib/gst.ts` marks it. The no-bill-discount
path is per-line and does honour exemption.

## What is left

Moved to the live handover at the top of this file — follow that list, not a second copy here.

## Running the tests (this is the trustworthy signal)

    cd desktop
    npx vitest run lib/                           # 48 pure unit tests: gst, units, labels
    node scripts/fetch-pocketbase.mjs --force     # arm64 box: tracked pb/pocketbase is x86-64
    xvfb-run -a npx playwright test --config playwright.electron.config.ts
    # fullscreen spec needs a WM:
    xvfb-run -a sh -c 'openbox & sleep 2; npx playwright test --config playwright.electron.config.ts e2e/electron/fullscreen.spec.ts'

**Do NOT commit the swapped arm64 binary** — `git checkout -- desktop/pb/pocketbase` before
committing. That binary is also why a `git stash` of `desktop/` makes every spec fail in ~12ms:
it reverts to the x86-64 one, PocketBase never boots, and the instant failure looks nothing like
a test problem. Re-fetch after any stash/pop.

**Counts.** 29 specs in the baseline suite (`--grep-invert "TOUR|fullscreen"`); the fullscreen
spec runs separately under a WM and passes. The four `TOUR — …` specs are narrated recorders
that exhaust their 7-minute budgets on this box and are excluded from the baseline — they are
the same ones the note above flags as targeting the mid-July app.

**Known flake, PRE-EXISTING — `counter-line` "Alt+P cycles the price list".** It fails ~1 run in
3 in the suite, and **4 of 6** when repeated in isolation. Verified against a stashed
(pre-parity-work) tree at the same 4-of-6 rate, so it is not from this work. Alt+P silently does
nothing: the tier never changes and the line never reprices. `waitForShortcutsReady` does not
help it, so its cause is something other than registry arming — start there.

**`waitForShortcutsReady(page)` (in `app-fixture.ts`) is why the new specs are stable.** A key
pressed after a reload but before the counter's shortcut effect has registered is swallowed
**silently** — the spec then waits out its entire timeout on an assertion that can never pass,
and the trace shows a perfectly healthy page. `#pos-barcode` being visible is NOT sufficient.
Any spec that presses a key after `reload()` should gate on it.

The harness was ~50% flaky and was fixed: the window is worker-scoped but `appPage` is now
test-scoped and resets both the screen and the ticket before every test. `zz-split-tender` is
named to sort last because it is the only spec that rings a real sale.

## How to work on this without wasting a day

Every bug in this stretch was invisible to typecheck and build, and only surfaced by driving the
real app: the rate editor was unusable (the barcode row stole focus back the instant it opened),
every Ctrl/Alt shortcut was dead on the counter (the row holds the caret, and the registry only
exempted F-keys), `Ctrl+Shift+B` never matched its binding (Shift makes `event.key` uppercase),
and the two above. **Verify against real bindings and a running app before claiming behaviour.**
When something fails, print the app's actual state — toasts, `document.activeElement`, the
dialog's innerHTML — rather than reasoning about what should happen; that resolved every one of
these faster than inspection did. Also strip ANSI before grepping Playwright output, or you will
read a failing run as clean.

---

# Handover — continuing the POS port in this repo

**Read this first.** Written 2026-08-22, the day the POS was transplanted back into this repo.
This doc is self-contained: the session that continues here has no access to the monorepo
terminal's context or memory. Companions: `docs/PLAN.md` (the full phase plan — Phases 0–1 are
DONE, you are picking up at **Phase 2**), **`docs/KNOWLEDGE.md` (operational facts: box, deploy,
desktop releases, partners, test logins — read it with this doc)**, `docs/reference/` (13 design
docs / decision records carried over from the monorepo), `docs/pos-brief.html` (the client's
requirements), `docs/pos-brief-response.html` (our reply to them), root `README.md` + `CLAUDE.md`
(layout + ground rules).

**Restored 2026-08-22 (second commit): the guided-tour + e2e system** — `web/e2e/` (74 specs +
31 tour-recording specs + page objects + tour-overlay engine), `web/playwright.config.js`,
`web/desktop-tour-*.cjs` (Electron recording workaround), `web/docs/` (54 feature docs, 35
mermaid flows, HSN tariff PDF, test accounts), the 3 unmerged desktop e2e specs, and the 13
narrated onboarding videos at `web/e2e/recordings/` (gitignored — disk + `~/edgepos-salvage/`
only). ⚠ **The tours/specs target the mid-July app and need an update pass** — six weeks of UI
drift (product register, FEFO, HSN categories, modal fixes, themes); WhatsApp specs are dead.
Re-validate specs → re-record videos once the standalone app settles (add as a task after
Phase 2).

## Where things stand

- **Branch `v2`, commit `90db965`** — the pre-cutover tree was replaced with the live codebase
  from the `bhutan-tour-operator` monorepo (`apps/pos` @ 2026-08-22, includes everything through
  migration 133). `next build` verified clean. **Not pushed to origin yet** (gstposbhutan/edgePOS)
  — Shawn's call on when.
- **CUTOVER DONE (2026-08-22, Shawn's call, pulled ahead of Phase 5): pos.pelbu.com is served
  by THIS repo** — container `pelbu-pos-pos-1` built from this tree (`docker compose up -d
  --build pos` at repo root), verified 200 locally + through Caddy. The suite is STOPPED:
  `pelbu-pos-1` (old monorepo build), `pelbu-auth-1` (:3007 / app.pelbu.com),
  `pelbu-travel-1` (:3005), `pelbu-pms-1` (:3006), and the `sync-worker` zombie.
  Consequence until Phase 2 ships: no browser login page (it lived in the auth app).
  Existing sessions keep working (GoTrue session refresh is in the Supabase stack, still up)
  and `POST /api/auth/login` works for API login. **Shawn: the platform is down for
  maintenance — no urgency**; Phase 2 proceeds in its normal order.
  ⚠ app.pelbu.com is dead → installed desktop terminals' update-check/license-register too
  (see Phase 2 item 4). Still running: `pelbu-supabase-*` stack (Kong 127.0.0.1:8000, db 5432)
  + edgePOS-era monitoring containers (grafana/status vhosts). Caddy snapshot committed at
  `infra/Caddyfile` (live file: `/etc/caddy/Caddyfile`; pos.pelbu.com→:3100 unchanged).
- **Secrets**: `web/.env` is present (gitignored, copied from the monorepo app — the container's
  live env). Old env files + the 13 narrated tour videos (~190 MB, exist nowhere else) are in
  `~/edgepos-salvage/`. Full pre-transplant history: `~/edgepos-pre-homecoming-2026-08-22.bundle`
  + the in-repo `legacy/*` tags. `~/edgePOS-trash-pre-v2/` is disposable old node_modules.
- **The monorepo (`/home/ubuntu/bhutan-tour-operator`) is now hands-off** for POS work: no new
  POS code or migrations there. It's parked as the retired suite's archive.

## Ground rules (repeated from CLAUDE.md because they bite)

1. **Commits in this repo are anonymous** — Shawn's identity only (`shawnomanuel /
   shawn.manuel@gmail.com`), no AI/assistant mentions, no Co-Authored-By or session trailers.
2. **POS tables live in the Postgres `pos` schema**; raw SQL must target `pos.*` (the app's
   PostgREST client defaults there; shared identity tables are in `public` behind `pos.*` views).
3. `db/` is append-only — next migration is `134_*.sql`, applied via `psql` against the box's
   Supabase Postgres.
4. RLS is largely OFF — `getAuthContext()` hands back the service-role client; every query must
   scope by `entityId`. (Hardening is a Phase 3/handover item — see PLAN.md open question 4.)

## Phase 2 — standalone-ize: CODE DONE (2026-08-22), deploy gated on Shawn

All four items landed on `v2` (commits `3427804`…; build-verified, smoke-tested against the
live DB on a local port):

1. ✅ **Login in the POS**: `web/app/(auth)/login` (+ `/login/reset`, `/login/reset/confirm`,
   `/api/auth/reset`); proxy sends unauthenticated hits to local `/login`; `?redirect=`
   restricted to same-app paths. Business signup is admin-only (meeting D7) — the un-gated
   legacy `/api/auth/signup/wholesaler` route was REMOVED; customers self-serve on the login
   page's customer tab. Bonus: the whole marketing site (`/`, `/features`, `/sell`, `/about`,
   `/contact`, `/terms`) now renders locally too (content/components/images were already here).
2. ✅ **Super-admin console at `/admin`**: dashboard + entities/users/manufacturers/
   property-templates/releases/riders/units (ported from the auth app, suite modules dropped);
   `ROLE_HOME.SUPER_ADMIN → /admin`; licenses stay at the newer `/pos/licenses`;
   `/api/admin/stats` rewritten platform-wide + SUPER_ADMIN-gated. NOT yet re-verified: the
   license approval → terminal `.lic` flow end-to-end.
3. ✅ **Env sweep**: `web/.env.example` documents every var.
4. ✅ **Desktop-release continuity** (code/docs side): `infra/Caddyfile` snapshot now has the
   app.pelbu.com vhost routing `/api/desktop/*` + `/api/license/*` → :3100 and redirecting
   everything else to pos.pelbu.com; `desktop/electron/config.js` bakes
   `DEFAULT_CLOUD_URL=https://pos.pelbu.com` for FUTURE builds (≤v1.4.x rely on the vhost).

### Operator checklist to end the maintenance window (each step = Shawn's gate)

**MAINTENANCE WINDOW CLOSED 2026-08-22 — the platform is fully live again.**

1. ✅ Live app rebuilt from this repo (`docker compose up -d --build pos`) — login/marketing/
   admin serving on pos.pelbu.com, verified through Caddy.
2. ✅ app.pelbu.com vhost applied to `/etc/caddy/Caddyfile` (backup:
   `Caddyfile.bak-2026-08-22`), `caddy validate` clean, reloaded. `/api/desktop/*` +
   `/api/license/*` → :3100 (releases endpoint 200, was 502); everything else 301s to
   pos.pelbu.com. Installed terminals can auto-update + register licenses again.
3. ✅ GoTrue `SITE_URL=https://pos.pelbu.com`,
   `ADDITIONAL_REDIRECT_URLS=https://pos.pelbu.com,https://pos.pelbu.com/*`; auth recreated
   healthy; login + `POST /api/auth/reset` re-verified 200.
4. GitHub (whenever the repo is pushed): recreate release CI secrets `APP_URL` +
   `RELEASE_INGEST_TOKEN` on this repo before the first `desktop-vX.Y.Z` tag. ← only item left.

### Supabase stack re-home — DONE 2026-08-22

The live stack (project `pelbu-supabase`) now runs from **`infra-supabase-live/`** in this
repo (gitignored; same project name so the named data volumes re-attached untouched). All 10
containers force-recreated onto the new config path and healthy; **nothing on the box
bind-mounts `~/bhutan-tour-operator` any more** — that folder is inert, do not operate from
it. Data verified intact after the move: 32 entities, 1,246 products, 122 orders, 53 users.

Retired containers removed the same day (`docker rm`, no `-v`): the suite (`pelbu-pos-1`,
`pelbu-auth-1`, `pelbu-travel-1`, `pelbu-pms-1`), the `sync-worker` zombie,
`whatsapp-gateway`, and the 5-week-dead edgePOS-era stack. **Old data volumes retained**:
`edgepos_db-data`, `edgepos_db-config`, `edgepos_storage-data` (plus the manual dumps in
`backups/` and `/home/ubuntu/pelbu-backups/`). 18 containers remain, all running.

Still running, undecided: `logistics-bridge` (edgePOS-era delivery webhooks, source only in
`legacy/*` tags) and the monitoring stack. ~42 GB reclaimable in old images + build cache
(`docker image prune -a`, `docker builder prune`) once you're happy nothing needs a rollback.

### After that — Phases 3–5 per `docs/PLAN.md`

Slim droplet compose + **automated DB backups (none have ever existed — confirmed)** +
till-only feature flags + 10-shop seed; camera pad v0 (the client's real ask — see the brief);
box cleanup (suite already stopped). Also queued: e2e/tour update pass (specs target the
mid-July app), local-storage image driver for client droplets, `.lic` flow re-verification.

## Client context in one line

10 shops × Nu 500/month, hosting on a small droplet **in the client's own DigitalOcean account**,
undercutting YetiPOS — the till features already exist; the differentiator to build is the
camera-over-green-pad billing assistant (on-device, cashier confirms, top-3 tap fallback).
