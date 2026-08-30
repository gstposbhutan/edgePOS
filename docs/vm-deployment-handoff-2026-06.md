# NEXUS BHUTAN — VM Deployment Handoff

You are Claude Code running on the production EC2 instance for NEXUS BHUTAN (edgePOS),
a GST POS + supply-chain SaaS for Bhutan. Your job: deploy the self-hosted Supabase stack
and the app containers per `~/aws-deployment.md`. Work through it top to bottom; this file
records what is already done and what only the operator (Shawn) can provide.

## This machine

- EC2 t4g.large (2 vCPU, 8 GB, arm64), Ubuntu 26.04 LTS, 77 GB gp3 root volume
- Region ap-south-2 (Hyderabad)
- Public DNS: ec2-98-130-46-7.ap-south-2.compute.amazonaws.com

## Already done (2026-06-11)

- Claude Code 2.1.170 installed (~/.local/bin, on PATH via ~/.bashrc)
- docker.io 29.1.3 + docker-compose-v2 + git installed; `ubuntu` added to the docker group
- unattended-upgrades present (Ubuntu default)

## Not done yet — start here

1. 4 GB swap file + fstab entry (runbook §2)
2. Docker log rotation in /etc/docker/daemon.json (runbook §2)
3. Clone the app repo — it is at github.com/gstposbhutan/edgePOS and likely private;
   ask the operator for a deploy token / `gh auth login` if the clone fails
4. Supabase self-host stack (runbook §3) — generate fresh secrets; never reuse the
   dev/demo keys found in the repo (web/supabase/docker/kong.yml, web/.env.docker)
5. Schema apply (§4), app stack (§5), Caddy + TLS (§6), backups (§7)

## Blocked on the operator — ask, don't guess

- Domain name(s) for `app.<domain>` and `supabase.<domain>` + Route 53 / DNS control
- GitHub access for the private repo
- Real GEMINI_API_KEY and WhatsApp credentials (or keep MOCK_WHATSAPP=true for now)
- AWS S3 bucket + IAM instance role for backups (§7)
- Confirm the EC2 security group only opens 22/80/443 before anything goes live

## Cautions

- 2 vCPU box: run `next build` (docker compose build) one service at a time if memory
  pressure appears; swap must exist first
- This VM will hold the only copy of the GST ledger once live — backups (§7) are not
  optional and must be verified with a test restore
- Do not expose Supabase Studio, Postgres :5432, or Kong :8000 publicly; Caddy fronts
  everything (§6)
