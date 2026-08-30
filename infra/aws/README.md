# AWS config for the image CDN

Preserved 2026-08-30 from the retired EC2 box. These were loose in the operator's home
directory, in no repo, and would have been lost when the instance was terminated.

| File | What |
|---|---|
| `cloudfront-img-runbook.sh` | The script that **built** `img.pelbu.com` — ACM cert (us-east-1), Origin Access Control `edgepos-img-oac`, the distribution, and `put-bucket-policy`. Run from CloudShell with admin creds; the EC2 instance role deliberately had none of these permissions. |
| `ci-releases-policy.json` | IAM policy scoping CI desktop-release uploads to `releases/*` on the images bucket. |

Bucket `edgepos-images-430286912237-ap-south-2-an`, region `ap-south-2`, served via CloudFront at
`img.pelbu.com`. Block Public Access is ON; only CloudFront can read the bucket, via OAC.

**Why this matters for the migration.** The migration handover records the bucket policy, CORS and
OAC configuration as unreadable from the box (the instance role was scoped to object operations
only) and therefore capturable only from the AWS console. `cloudfront-img-runbook.sh` is that
configuration expressed as the code that created it, which closes most of that gap.

`ci-releases-policy.json` is also the starting point for the IAM user the app now needs: Vercel has
no instance role, so `web/lib/storage/s3.js` requires explicit credentials.
