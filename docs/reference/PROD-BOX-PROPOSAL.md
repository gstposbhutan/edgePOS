# Approval request — production server for the PELBU platform

**Status:** awaiting approval · **Date:** 2026-07-20 · **Owner:** shawn.manuel@gmail.com

**Ask:** one AWS EC2 instance in **ap-south-2 (Hyderabad)** to run production for pelbu.com — total **~$30/month ≈ ₹3,100/month (~₹38,000/year), GST included.**

## What it will host

The full platform, on one box:

- The four apps: **travel.pelbu.com** (tour-operator storefronts + booking suite), **pos.pelbu.com** (POS + marketplace), **hotel.pelbu.com** (PMS), **app.pelbu.com** (login/SSO + admin + desktop-app licensing)
- The self-hosted **Supabase** stack (Postgres, auth, REST API, file storage) behind Caddy
- Serving **SilverPine as tenant #1**, with capacity for the next several operators

## Requested spec & monthly cost

| Item | Spec | USD/mo |
|---|---|---|
| EC2 instance | **t4g.medium** (2 vCPU Graviton, 4 GB RAM, on-demand) | $16.35 |
| Disk | 80 GB gp3 EBS | $7.30 |
| Static IP | Elastic IP | $3.65 |
| Backups | daily EBS snapshots, 7-day retention | ~$3.00 |
| Data transfer | first 100 GB/mo free | ~$0 |
| **Total** | | **~$30.30** |

**≈ ₹3,100/month incl. 18% GST** (at ~₹87/USD). After 30 days of stable usage we'll buy a 1-yr no-upfront savings plan, dropping it to **~₹2,600/month**.

## Why this size is safe (evidence, not guesswork)

We ran the **entire platform on our dev server and measured it** (2026-07-20): the lean production footprint is **~2.5 GB RAM steady**, well inside 4 GB. Deploy builds run in **GitHub Actions** (free tier — the same pipeline already used for our desktop app), so the server only ever runs the apps; it never builds them.

## Scale path (why approving small is low-risk)

If traffic or tenant growth demands it, resizing to the next tier (**t4g.large**, 8 GB, **+₹1,400/mo**) is a 5-minute stop-resize-start with **no re-architecture**. We'd rather start right-sized and scale on evidence than pay for idle headroom.

## Alternative considered

The managed equivalent (Supabase Pro + Vercel + managed Postgres) starts around **$70–150/month** for the same workload — 3–5× the cost at our stage. Self-hosting on one Graviton box is the cost-efficient choice now, and nothing about it blocks moving to managed services later.

**Fallback option** (if we prefer on-box builds, no CI dependency): **t4g.large** at **~₹4,800/month** all-in incl. GST — otherwise identical.

## Pricing notes

EC2 rates are live on-demand quotes from 2026-07-20 (identical in ap-south-1 Mumbai and ap-south-2 Hyderabad — Hyderabad chosen because our S3 bucket + CDN, img.pelbu.com, already live there). EBS/IP/snapshot rates are AWS list prices; INR figures float with FX.

---

## Appendix A — day-one provisioning checklist (once approved)

1. Ubuntu 24.04 **ARM64** (Graviton) AMI · Docker + Caddy · create 4 GB swapfile · attach **Elastic IP before DNS**
2. Supabase from `infra/supabase/docker-compose.yml` **minus** studio/meta/realtime/supavisor (measured: zero consumers) — but **with storage + imgproxy** (POS bill-parse uploads bill photos to Supabase Storage)
3. The four apps from the root `docker-compose.yml`; per-app envs copied from the dev box; uptime-kuma for down-alerts
4. **GitHub Actions deploy pipeline** (reuse the keyless desktop-CI pattern) — the 4 GB box never runs `next build`
5. Data migration: `pg_dump`/restore + storage volume tgz (same procedure as the edgePOS→pelbu move), then flip Cloudflare A records (grey-cloud/DNS-only)
6. Post-checks: all four vhosts 200 over TLS, POS sync + desktop update endpoints healthy, snapshot schedule confirmed
7. ~30 days after stable: purchase 1-yr no-upfront Compute Savings Plan (≈ −30%)
