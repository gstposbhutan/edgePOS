# AI Product Enrichment, Images, Video & Email Notifications

AI-assisted product metadata + default images, taggable video, admin-managed custom-property
templates, and SendGrid transactional email. Shipped 2026-07 on `feat/web-pos-ui-overhaul`.

## AI backend — z.ai / GLM (not Gemini)
OpenAI-compatible API at `https://api.z.ai/api/paas/v4`. Config in `web/.env.docker` (gitignored):
`ZAI_API_KEY`, `ZAI_TEXT_MODEL=glm-5.2`, `ZAI_VISION_MODEL=glm-4.6v`, `ZAI_IMAGE_MODEL=cogview-4-250304`.
> Always send `thinking:{type:"disabled"}` in chat calls — otherwise GLM spends the token budget
> "reasoning" and returns empty content. The `zhipuai` SDK points at the Chinese endpoint (fails for a
> z.ai key), so call z.ai directly via fetch. cogview rate-limits in bursts — loop with sleep + retry.

## Enrichment engine
`web/lib/ai/product-ai.js`:
- `enrichProduct({name, category, condition, price, imageUrl})` → `{description, category,
  subcategory, hsn_code, condition, brand, tags[], specifications{}}`. Specs are
  **category-appropriate** (TV → screen_size/power/…, furniture → material/dimensions/…). Uses the
  vision model when a product image is supplied.
- `resolveHsn(supabase, code)` → matches `hsn_master` by digit prefix for an authoritative HSN + category.
- `generateImageUrl({name, description})` → cogview image URL (re-hosted to S3 by the route).
- Routes (scoped to `created_by`): `POST /api/products/[id]/enrich`, `POST /api/products/[id]/generate-image`.

## Product fields & UI
- `products`: `video_url, brand, tags(jsonb), specifications(jsonb), ai_enriched` (migration 091);
  surfaced via `sellable_products` + search (migration 092).
- Both product-detail cards (shop + POS) show description, condition/brand/subcategory, humanized
  specs, tags, and video (YouTube inline; IG/TikTok link out).
- Product form: video-link field, category custom-property fields (from the template), in-app
  **Enrich with AI** / **Generate image** buttons; Products page has **Enrich all**.

## Admin HSN-category property templates
`category_property_templates` (category unique; `properties` jsonb `[{key,label,type,options}]`,
migration 093, seeded for the in-use categories). Super-admin CRUD at **/admin/property-templates**
(`/api/admin/property-templates`, service-client writes, RLS read-only). The product form fetches a
category's template via `/api/property-templates?category=X`; the AI targets these keys.

## Email notifications (SendGrid)
- **Auth mail** (password reset / confirm / invite): GoTrue SMTP → SendGrid (`web/.env` `SMTP_*`,
  from `noreply@app.pelbu.com`, domain-authenticated `app.pelbu.com`).
- **Transactional** (`web/lib/email/notify.js`, `SENDGRID_API_KEY` in `.env.docker`): on marketplace
  checkout, the customer gets a receipt (only if a **real** email — WhatsApp-only customers have
  `customer_…@example.com` placeholders, skipped), and the vendor owner gets a **new-order alert** +
  **low-stock alert** for ordered items at/below reorder point.

## WhatsApp
The gateway (`web/services/whatsapp-gateway`) prefers **Twilio** when `TWILIO_*` env is set, else
Meta Cloud API, else dev-log. Currently parked (no creds); email covers notifications. Customer OTP
login can be tested with `MOCK_WHATSAPP=true` (code `123456`).

Related: `marketplace-vendor.md`, `hsn-based-specifications.md`, `product-specifications.md`.
