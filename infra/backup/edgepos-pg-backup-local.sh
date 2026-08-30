#!/usr/bin/env bash
# Hourly LOCAL Postgres backup (low RPO) + Uptime Kuma heartbeat ping on success.
set -euo pipefail
DIR=/var/backups/edgepos/pg
KUMA_PUSH="https://status.16-112-248-61.nip.io/api/push/UCfebaW0fe"
mkdir -p "$DIR"
STAMP=$(date -u +%Y-%m-%d_%H%M)
TMP="$DIR/.postgres-${STAMP}.dump.tmp"
docker exec -i supabase-db pg_dump -U postgres -Fc postgres > "$TMP"
mv "$TMP" "$DIR/postgres-${STAMP}.dump"
SIZE=$(du -h "$DIR/postgres-${STAMP}.dump" | cut -f1)
logger -t edgepos-backup "hourly local backup -> $DIR/postgres-${STAMP}.dump ($SIZE)"
# dead-man's-switch heartbeat: only reached if the dump above succeeded
curl -fsS --max-time 10 "${KUMA_PUSH}?status=up&msg=ok_${SIZE}&ping=" >/dev/null 2>&1 || true
