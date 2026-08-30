#!/usr/bin/env bash
# =====================================================================
# §D — CloudFront for img.pelbu.com  (RUN IN AWS CLOUDSHELL, admin creds)
# The EC2 box's edgepos-ec2-role has NO cloudfront/acm/bucket-policy perms,
# so these must be run from CloudShell or an admin session.
# Run STEP BY STEP — steps 1 and 5 require a manual Cloudflare DNS edit.
# =====================================================================
set -euo pipefail

ACCOUNT=430286912237
BUCKET=edgepos-images-430286912237-ap-south-2-an
BUCKET_DOMAIN=edgepos-images-430286912237-ap-south-2-an.s3.ap-south-2.amazonaws.com
DOMAIN=img.pelbu.com

# ---------------------------------------------------------------------
# STEP 1 — ACM certificate (MUST be us-east-1 for CloudFront)
# ---------------------------------------------------------------------
CERT_ARN=$(aws acm request-certificate --region us-east-1 \
  --domain-name "$DOMAIN" --validation-method DNS \
  --query CertificateArn --output text)
echo "CERT_ARN=$CERT_ARN"

# Get the DNS validation CNAME, then add it in Cloudflare (DNS only / grey cloud):
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json
# -> In Cloudflare add: Type=CNAME, Name=<the "Name" minus the zone>, Content=<the "Value">, DNS only.
# Then block until validated:
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT_ARN"
echo "cert validated."

# ---------------------------------------------------------------------
# STEP 2 — Origin Access Control (OAC)
# ---------------------------------------------------------------------
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config \
    Name=edgepos-img-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3 \
  --query 'OriginAccessControl.Id' --output text)
echo "OAC_ID=$OAC_ID"

# ---------------------------------------------------------------------
# STEP 3 — CloudFront distribution
# ---------------------------------------------------------------------
CALLER="edgepos-img-$(date +%s)"
cat > /tmp/dist-config.json <<JSON
{
  "CallerReference": "$CALLER",
  "Aliases": { "Quantity": 1, "Items": ["$DOMAIN"] },
  "DefaultRootObject": "",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-edgepos-images",
      "DomainName": "$BUCKET_DOMAIN",
      "OriginAccessControlId": "$OAC_ID",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10,
      "OriginShield": { "Enabled": false }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-edgepos-images",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "Comment": "edgePOS product images",
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  }
}
JSON

read -r DIST_ID DIST_DOMAIN < <(aws cloudfront create-distribution \
  --distribution-config file:///tmp/dist-config.json \
  --query '[Distribution.Id,Distribution.DomainName]' --output text)
echo "DIST_ID=$DIST_ID  DIST_DOMAIN=$DIST_DOMAIN"

# ---------------------------------------------------------------------
# STEP 4 — Bucket policy: allow ONLY this distribution to read (OAC).
# Block Public Access stays ON; this is the OAC SourceArn grant.
# ---------------------------------------------------------------------
cat > /tmp/bucket-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*",
    "Condition": { "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::$ACCOUNT:distribution/$DIST_ID" } }
  }]
}
JSON
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/bucket-policy.json
echo "bucket policy applied."

# ---------------------------------------------------------------------
# STEP 5 — Cloudflare DNS (MANUAL):
#   Add CNAME:  img  ->  $DIST_DOMAIN   (DNS only / GREY cloud, NOT proxied)
# ---------------------------------------------------------------------

# ---------------------------------------------------------------------
# STEP 6 — wait for the distribution to finish deploying (~5-15 min)
# ---------------------------------------------------------------------
aws cloudfront wait distribution-deployed --id "$DIST_ID"
echo "distribution deployed. Once the Cloudflare CNAME resolves, test:"
echo "  curl -I https://$DOMAIN/products/<some-key>"
