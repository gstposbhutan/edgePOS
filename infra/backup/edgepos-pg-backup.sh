#!/usr/bin/env bash
# Nightly logical backup of the NEXUS BHUTAN Postgres -> S3 (no local disk).
set -euo pipefail
BUCKET=edgepos-db-backups-430286912237-ap-south-2-an
export AWS_DEFAULT_REGION=ap-south-2
STAMP=$(date -u +%Y-%m-%d_%H%M)
KEY="pg/postgres-${STAMP}.dump"
docker exec -i supabase-db pg_dump -U postgres -Fc postgres \
  | aws s3 cp - "s3://${BUCKET}/${KEY}"
logger -t edgepos-backup "pg backup -> s3://${BUCKET}/${KEY}"
