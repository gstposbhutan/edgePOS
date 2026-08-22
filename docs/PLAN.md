# POS homecoming — standalone edgePOS repo, restructured for the 10-shop client brief

Status: **Phases 0–1 EXECUTED 2026-08-22** (edgePOS `v2` branch, commit `90db965`, build-verified,
not pushed). Phase 2 (auth fold-in) next. Shawn's calls during execution: suite retired entirely;
old project no longer public — **"just keep the backup"**, so no in-tree salvage curation
(backup = `~/edgepos-pre-homecoming-2026-08-22.bundle` + `legacy/*` tags + `~/edgepos-salvage/`
with the 13 gitignored tour videos + env files; old dirs parked in `~/edgePOS-trash-pre-v2/`).
Audit findings folded in below: desktop was ALREADY ported (monorepo `desktop` branch is newer —
used it), `sync-worker` is a zombie (source deleted 2026-07-06; kill container at Phase 5),
`whatsapp-gateway`/`logistics-bridge` sources stay in legacy tags, **no automated DB backups have
ever existed** (add to Phase 3), Caddyfile lives only at `/etc/caddy/Caddyfile` (worth committing
to the repo at Phase 5). Companion to `pos-brief.html`
(client requirements) + `pos-brief-response.html` (our reply) + the 2026-08-22 pivot
(scale down to POS-only; travel/hotel develop separately).

## The call being made

**The POS's home returns to the edgePOS repo — by transplanting the CURRENT code, never by
upgrading the old code.** Facts that force the mechanism:

- The live POS already runs from THIS monorepo (`pelbu-pos-1` container = `apps/pos`, port 3100).
- edgePOS is dormant since **2026-07-14** (last commit: desktop v1.4.0). Its `web/` predates the
  `pos` schema flip (121), product register (129), FEFO/FIFO (129–131), category consolidation
  (132–133), and the security patches. Back-porting ≈6 weeks of verified work = all risk, no gain.
- The **`desktop` branch lives in the monorepo** (local + origin), not edgePOS — edgePOS's
  `desktop/` is also stale. Homecoming reunites current web + current desktop in one product repo.
- edgePOS-era containers still running from old images: monitoring stack (grafana/prometheus/
  uptime-kuma/exporters), `sync-worker`, `logistics-bridge` — their sources need locating (Phase 1).

End state: **edgePOS repo = the whole POS product** (web till, desktop terminal, pos migrations,
droplet deploy). **The suite is RETIRED (Shawn, 2026-08-22)** — travel/PMS/auth apps stop at
cutover; the monorepo is parked as the suite's archive, maybe revived "when we have clients".
Anonymous commits remain the edgePOS rule.
SilverPine's live site was **never on this box** (hosted separately, not being developed) — the
suite retirement has no external-stakeholder dependency.

---

## Phase 0 — Decisions + safety (½ day)

- [ ] Shawn confirms: edgePOS repo as home; transplant mechanism; client gets a **fresh DB on
      their droplet** (10 shops = 10 orgs), Pelbu box keeps its own instance for existing users.
- [ ] Tag edgePOS `legacy/pre-homecoming` on every branch tip; full repo backup to
      `/home/ubuntu/pelbu-backups/`.
- [ ] **Salvage audit**: diff edgePOS `web/` @ 2026-07-14 against the cutover snapshot
      (`docs/pelbu/EDGEPOS-CUTOVER.md`) for anything never ported — candidates: guided-tour specs,
      e2e coverage (`test/e2e-coverage-and-optimization`), `infra/aws-selfhost-deployment` scripts,
      the monitoring compose. Salvage list goes into Phase 1.

## Phase 1 — Transplant (repo surgery, zero behavior change) (1–2 days)

- [ ] New `v2` branch in edgePOS (becomes `main` at cutover). Layout:
      `web/` ← monorepo `apps/pos` (as-is) · `desktop/` ← monorepo `desktop` branch content ·
      `packages/sync-core/` ← `packages/sync-core` (shared by web + desktop + sync-worker) ·
      `db/` ← `db/public/` migration lineage · `infra/` ← Dockerfile target, Caddy snippet,
      compose · salvaged tests/tours.
- [ ] Dependency cuts: inline `@pelbu/db` (42 lines) into `web/lib`; drop `@pelbu/types` /
      `@pelbu/ui` (verify near-zero usage first). No turbo — plain npm workspaces (web, desktop,
      sync-core).
- [ ] Locate + adopt `sync-worker` and `logistics-bridge` sources (edgePOS-era images) into
      `infra/`; rebuild from the new tree.
- [ ] DB source-of-truth flips to edgePOS `db/` **at cutover**; until then migrations continue
      here. Also generate a **squashed clean baseline schema** for fresh client deploys (the full
      lineage stays for the Pelbu box).
- [ ] Verify: `web` builds, container runs against dev Supabase, smoke: login → sale → GST bill →
      stock deduction → sync bootstrap/ingest.

## Phase 2 — Standalone-ize: cut the `apps/auth` dependency (2–3 days)

- [ ] Login/logout/password-reset pages inside the POS (`/login`); remove the `AUTH_URL` redirect
      from `web/proxy.js`. BFF auth routes already live in the POS.
- [ ] **Reactivate** the dormant super-admin surface (`app/api/admin/*`, `/pos/licenses` — do NOT
      delete them as previously planned): license approval, entities/users, desktop releases,
      units, property templates. SUPER_ADMIN-gated.
- [ ] Email (SendGrid env) + image storage: keep S3/img.pelbu.com for the Pelbu box; add a
      local-storage driver option for client droplets. `.env.example` documenting every var.

## Phase 3 — Fit the client brief: cost + scale (2–3 days)

- [ ] **Slim deploy profile** (`infra/droplet-compose.yml`): Postgres + GoTrue + PostgREST +
      Kong + storage only — no Studio/Realtime/analytics/imgproxy/monitoring. Target ≤2 GB RAM on
      a small DigitalOcean droplet in the **client's account**, weekly backups on. Publish the
      real Nu cost sheet (client build-order item 4).
- [ ] **Till-only feature flags** (env-driven, default off for client deploys): marketplace,
      riders, B2B consoles, face-ID, AI enrichment. The brief buys a till, not the platform.
- [ ] Seed script: 10 shops as orgs with per-shop GST invoice serials + stock; owner/cashier
      accounts. Verify serials + reports per shop.

## Phase 4 — Camera pad v0 (the genuinely new build) (biggest chunk)

- [ ] Green-pad **chroma segmentation** (replaces YOLO on the pad — controlled background; the
      shipped-model gap becomes moot for this path), even-light calibration step.
- [ ] Barcode when face-up: `BarcodeDetector` with ZXing fallback, on-device.
- [ ] Crop → embedding → match against the shop's own photos (existing `lib/vision` pipeline +
      IndexedDB store — **actually ship the model assets** this time).
- [ ] Unit-by-size (Case / Pcs / Pack) + blob count; proposal UI on `/pos/touch` with **top-3
      tap** fallback; cashier confirms before it becomes a line (camera never invents prices).
- [ ] Enrollment flow: "owner photographs packs once" — fast capture UI, re-shoot on packaging
      change. Optional Google Product Search for unsure stills behind a config flag (client's
      Google project).
- [ ] Deliverables per the brief: demo scene (1 Case + 3 bottles + 3 pkt) at one pilot shop +
      the uncut sale video.

## Phase 5 — Cutover + monorepo cleanup (½ day + monitoring)

- [ ] Pelbu box: build `pelbu-pos` from the edgePOS repo `v2`; retire the monorepo build.
- [ ] **Retire the suite**: stop `pelbu-auth`, `pelbu-travel`, `pelbu-pms` containers (no
      SilverPine dependency — its site was never on this box); slim the Supabase stack;
      **downsize the box instance** — the real cost saving lands here.
- [ ] Monorepo: parked as the suite archive — freeze `apps/pos` (README pointer to edgePOS), keep
      all history; `desktop` branch archived after its content lands in edgePOS (port the keyless
      CI workflow + `desktop-vX.Y.Z` tag convention).
- [ ] Memory/docs updated: edgePOS = POS home; monorepo = parked suite archive.

## Risks

- **Transplant regressions** — mitigated: file moves not rewrites, same DB, Phase 1 smoke list.
- **Two migration lineages during transition** — single rule: edgePOS `db/` is truth from cutover;
  no new POS migrations here after Phase 1 starts.
- **Salvage misses** (tours/e2e/infra never ported) — that's what the Phase 0 audit is for.
- **Client droplet ≠ Pelbu box drift** — one compose file parameterized by env, not two forks.

## Open questions for Shawn

1. Fresh client DB on their droplet (recommended) — confirmed?
2. edgePOS `v2`: replace `main` at cutover, or keep old `main` and make `v2` the default branch?
3. Should the monitoring stack (grafana/prometheus) move to edgePOS `infra/` too, or stay
   Pelbu-box-only?
4. RLS/security hardening (deferred backlog): does the client deployment finally force it, since
   that droplet is in *their* account? (Recommended: yes, at least anon-key lockdown before
   client handover.)
