# Feature: 1-Page Instant Marketplace

**Feature ID**: F-MARKET-001
**Phase**: 6
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

A per-store, luxury-minimal public web page that turns any retailer's inventory into a browsable product showcase. Think Aman resort website, not Amazon. Single-page infinite scroll. Full-width imagery. One "Order via WhatsApp" button per product. No login, no cart, no filters, no search bar.

This is **not** the full multi-vendor marketplace from DEV_PLAN. This is a lightweight lead-generation and ordering channel. Customers browse, tap WhatsApp, and the conversation continues in the chat where it belongs.

**URL pattern**: `[shopname].innovates.bt` — dynamic subdomain routing. Each store gets its own branded page.

**Dependencies**: WhatsApp gateway (F-WA-001, for ordering), product management UI (for the "Show on Web" toggle).

---

## Design Philosophy

The page must feel like scrolling through a high-end editorial lookbook. Slow, intentional, luxurious. Every product is given room to breathe.

### Visual Principles

- **No chrome**. No sidebars, no category tabs, no sticky headers. The product image is the interface.
- **Obsidian canvas**. Background uses the `obsidian` token (#0F172A). Content floats above it in clean, spacious blocks.
- **Gold punctuation**. Accents, dividers, and the CTA button use the `gold` token (#D4AF37). Nothing else glows.
- **Noto Serif headers**. Product names set in `font-serif` at large scale. Body copy in `font-sans`.
- **Infinite scroll**. Products load as the user scrolls. No pagination UI. Categories appear as subtle section dividers.

### Layout Anatomy

```
+----------------------------------------------------------+
|                                                          |
|  [Store Logo]                                            |
|  [Store Name — Noto Serif, gold]                         |
|  [Store Bio — short, centered, light slate]              |
|                                                          |
|  ——— Category Divider (e.g. "Electronics") ———           |
|                                                          |
|  +------------------------------------------------------+|
|  |                                                      ||
|  |  [Full-width product image — 16:9 or 1:1]            ||
|  |                                                      ||
|  +------------------------------------------------------+|
|  |  Product Name            Nu. 350                     ||
|  |  [Order via WhatsApp] — gold outlined button          ||
|  +------------------------------------------------------+|
|                                                          |
|  ——— Category Divider (e.g. "Grocery") ———               |
|                                                          |
|  [Next product card...]                                  |
|                                                          |
+----------------------------------------------------------+
```

---

## URL and Routing

### Subdomain Pattern

Each store receives a URL-safe slug derived from their business name.

```
wangchuk-general.innovates.bt
druk-electronics.innovates.bt
lotus-superstore.innovates.bt
```

### Slug Resolution

1. Extract subdomain from `Host` header.
2. Query `entities.shop_slug` for a match.
3. If no match, serve the platform landing page (or 404).
4. If match found, load store data and render the marketplace page.

### Slug Generation

Slugs are auto-generated on first marketplace activation but can be customised by the store owner.

```javascript
// Auto-generation: lowercase, hyphenated, max 3 words
function generateSlug(businessName) {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('-');
}
```

Slug uniqueness enforced by `UNIQUE` constraint on `entities.shop_slug`.

---

## Product Visibility

### Query Logic

Products appear on the marketplace page only when both conditions are met:

```sql
WHERE p.visible_on_web = TRUE
  AND p.current_stock > 0
  AND p.entity_id = :store_id
ORDER BY c.name ASC, p.created_at DESC
```

Sorted by category name alphabetically, then by most recently added within each category.

### Inventory-to-Web Toggle

In the product management screen (both desktop POS and PWA), each product row displays a single toggle:

| Field | Value |
|-------|-------|
| Label | "Show on Web" |
| Type | Toggle switch (on/off) |
| Default | OFF |
| Effect | Toggling ON sets `visible_on_web = TRUE`; product appears on next ISR revalidation. Toggling OFF removes it. |
| Feedback | Toast: "Product visible on your marketplace page" / "Product hidden from marketplace" |

The toggle writes directly to the `products` table. No approval queue, no publish flow. One click, live.

---

## "Order via WhatsApp" Button

### Button Behaviour

Each product card includes an "Order via WhatsApp" button. Clicking it opens WhatsApp (web or app) with a pre-filled message.

### Pre-filled Message Format

```
Hi! I'd like to order:
- [Product Name] × 1
From [Shop Name]
```

The customer can edit the quantity before sending. The shop receives the message on their WhatsApp Business number.

### WhatsApp Deep Link

```javascript
function buildWhatsAppLink(shopPhone, productName, shopName) {
  const message = encodeURIComponent(
    `Hi! I'd like to order:\n- ${productName} × 1\nFrom ${shopName}`
  );
  return `https://wa.me/${shopPhone}?text=${message}`;
}
```

`shopPhone` comes from `entities.whatsapp_no` (E.164 format, already stored).

---

## SEO and Meta Tags

### Per-Store Meta

Each marketplace page includes:

| Tag | Value |
|-----|-------|
| `<title>` | `[Shop Name] — innovates.bt` |
| `<meta name="description">` | `entities.marketplace_bio` (truncated to 160 chars) |
| `<meta property="og:title">` | `[Shop Name]` |
| `<meta property="og:description">` | `entities.marketplace_bio` |
| `<meta property="og:image">` | `entities.marketplace_logo_url`, fallback to first visible product image |
| `<meta property="og:url">` | `https://[slug].innovates.bt` |

### Structured Data (JSON-LD)

Product listings include `Product` schema for search engine indexing:

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "[Shop Name] Products",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "[Product Name]",
        "offers": {
          "@type": "Offer",
          "price": "350",
          "priceCurrency": "BTN",
          "availability": "https://schema.org/InStock"
        }
      }
    }
  ]
}
```

---

## Analytics

Lightweight tracking. No event spam, no complex funnels.

| Event | Trigger | Properties |
|-------|---------|------------|
| `page_view` | Marketplace page loaded | `shop_slug`, `shop_name` |
| `product_impression` | Product card enters viewport | `product_id`, `product_name`, `category` |
| `whatsapp_click` | "Order via WhatsApp" button clicked | `product_id`, `product_name`, `shop_slug` |

Implementation: GA4 via `gtag.js`. Events batched via `requestIdleCallback` to avoid blocking scroll.

No user identification. No cookie consent required (GA4 in anonymised mode, no ads, no personal data collected).

---

## Performance and Rendering

### Static Generation with ISR

The marketplace page uses Next.js Incremental Static Regeneration (ISR). Each store page is pre-rendered at build time and revalidated on a timer.

```javascript
// Next.js page config
export const revalidate = 300; // 5 minutes
```

### Rationale

- Products change infrequently (a few edits per day at most).
- 5-minute staleness is acceptable for a browse-and-order channel.
- ISR avoids per-request database hits while keeping content reasonably fresh.
- On-demand revalidation triggered when "Show on Web" toggle changes:

```javascript
import { revalidateTag } from 'next/cache';

// Called after product toggle update
revalidateTag(`marketplace-${entityId}`);
```

### Image Optimisation

- Product images served via Next.js `<Image>` component with automatic WebP/AVIF conversion.
- Lazy loading with `loading="lazy"` on all product cards below the fold.
- Blur placeholder generated at build time for smooth load-in.

---

## Database Changes

### Column Additions — `products` table

```sql
ALTER TABLE products
ADD COLUMN visible_on_web BOOLEAN NOT NULL DEFAULT FALSE;
```

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `visible_on_web` | BOOLEAN | FALSE | Controls whether product appears on marketplace page |

Index for marketplace queries:

```sql
CREATE INDEX idx_products_marketplace
ON products (entity_id, visible_on_web, current_stock)
WHERE visible_on_web = TRUE AND current_stock > 0;
```

### Column Additions — `entities` table

```sql
ALTER TABLE entities
ADD COLUMN shop_slug TEXT UNIQUE,
ADD COLUMN marketplace_bio TEXT,
ADD COLUMN marketplace_logo_url TEXT;
```

| Column | Type | Purpose |
|--------|------|---------|
| `shop_slug` | TEXT UNIQUE | URL-friendly identifier for subdomain routing (e.g. `wangchuk-general`) |
| `marketplace_bio` | TEXT | Short store description shown at top of marketplace page |
| `marketplace_logo_url` | TEXT | Store logo displayed on marketplace header and OG meta |

### Slug uniqueness constraint

```sql
CREATE UNIQUE INDEX idx_entities_shop_slug
ON entities (shop_slug)
WHERE shop_slug IS NOT NULL;
```

Partial index ensures `NULL` slugs (stores that haven't activated marketplace) don't conflict.

---

## Scope Boundaries

This feature explicitly does **not** include:

- **Cart or checkout flow.** Ordering happens in WhatsApp. The web page is a showroom.
- **Search or filtering.** Scroll and discover. Categories are section dividers, not filters.
- **User accounts or login.** Browsing is anonymous. No registration, no wishlists.
- **Online payment.** Payment terms are negotiated between customer and store in the WhatsApp conversation.
- **Inventory sync UI.** The "Show on Web" toggle is a simple boolean on the product row. It does not manage stock levels.
- **Multi-store aggregation.** Each page is one store. There is no cross-store search, comparison, or recommendation engine.
- **Order tracking.** Once the customer lands in WhatsApp, order tracking is outside the scope of this page.

---

## Implementation Checklist

- [ ] Add `visible_on_web` column to `products` table with partial index
- [ ] Add `shop_slug`, `marketplace_bio`, `marketplace_logo_url` columns to `entities` table
- [ ] Build slug generation utility with uniqueness check
- [ ] Create `GET /api/marketplace/[slug]` endpoint returning store + visible products
- [ ] Build marketplace page component with infinite scroll layout
- [ ] Implement category section dividers with gold accent styling
- [ ] Implement product card component with full-width image, name, price, WhatsApp button
- [ ] Wire "Order via WhatsApp" button to `wa.me` deep link with pre-filled message
- [ ] Add ISR configuration (5-minute revalidate) with on-demand revalidation on toggle
- [ ] Implement "Show on Web" toggle in desktop product management UI
- [ ] Implement "Show on Web" toggle in PWA product management UI
- [ ] Add per-store meta tags (title, description, OG image, canonical URL)
- [ ] Add JSON-LD structured data for product listings
- [ ] Integrate GA4 anonymised tracking (page_view, product_impression, whatsapp_click)
- [ ] Configure subdomain routing in Next.js middleware
- [ ] Test with multiple stores to verify slug isolation and data boundaries
- [ ] Verify WhatsApp deep link works on Android, iOS, and desktop browsers

---

## Resolved Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Full marketplace vs single-store page | Single-store page | DEV_PLAN multi-vendor marketplace is Phase 7+. This is a lightweight, per-store showcase that can ship independently. |
| Cart and checkout | No cart; WhatsApp ordering | Bhutan commerce runs on WhatsApp chat. Adding a cart would duplicate the conversation that already happens naturally. |
| Rendering strategy | ISR at 5 minutes | Products change slowly. Full SSR on every request is unnecessary cost. ISR with on-demand revalidation gives the best balance. |
| Search and filters | None | The page is designed for browse-first discovery. A small inventory (typical Bhutan retailer: 50-300 SKUs) does not need search. |
| Authentication | None required | Anonymous browsing removes friction. The store captures the lead when the customer opens WhatsApp. |
| Analytics depth | GA4 anonymised, 3 events | Light tracking. No user identification, no cookie consent complexity. Product impressions and WhatsApp clicks tell the store everything they need. |
