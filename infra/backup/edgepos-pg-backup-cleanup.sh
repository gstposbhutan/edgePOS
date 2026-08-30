#!/usr/bin/env bash
# Prune local hourly dumps after the daily S3 push — keep newest 1 (S3 has the daily).
set -euo pipefail
DIR=/var/backups/edgepos/pg
ls -1t "$DIR"/postgres-*.dump 2>/dev/null | tail -n +2 | xargs -r rm -f
logger -t edgepos-backup "local cleanup: kept newest dump, pruned older"
