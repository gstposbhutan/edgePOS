# Database backup automation (retired)

Preserved 2026-08-30 from the retired EC2 box, where these lived in `/usr/local/bin` — root-owned,
outside any repo. Kept as a reference for whatever replaces them.

| File | Schedule | What |
|---|---|---|
| `edgepos-pg-backup-local.sh` | hourly | local dump, RPO ~1h |
| `edgepos-pg-backup.sh` | daily 20:00 UTC (02:00 Asia/Thimphu) | offsite push to S3 |
| `edgepos-pg-backup-cleanup.sh` | daily 20:30 UTC | prune local dumps after the push |
| `crontab` | — | the `/etc/cron.d/edgepos-pg-backup` entry that drove all three |

**These stopped when the box did.** Supabase Cloud takes its own backups (daily on Pro; PITR is a
paid add-on) — that is a replacement, not a port. Do not assume backup continuity across the
migration without configuring it explicitly.
