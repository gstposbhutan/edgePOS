// Shared content for the public marketing site (root home, /features hub + deep dives,
// /sell, /about, /contact). Kept as plain data so pages/components stay presentational.
// Imagery lives in /public/marketing (AI-generated via scripts/gen-marketing-images.js).

export const NAV = [
  { label: 'Features', href: '/features' },
  { label: 'Sell on Pelbu', href: '/sell' },
  { label: 'Marketplace', href: '/shop' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

// The four product pillars — used by the /features hub and each deep-dive page.
export const PILLARS = [
  {
    slug: 'pos',
    eyebrow: 'AI-Vision POS',
    title: 'A point of sale that sees what you sell',
    tagline: 'A 4K, offline-first terminal built for real shop counters — touch or keyboard, camera or barcode.',
    hero: '/marketing/hero-pos.webp',
    highlights: [
      { spot: '/marketing/spot-ai-vision.webp', title: 'Local AI product recognition', body: 'On-device YOLO vision spots items in the frame and matches them to your catalog — no cloud round-trip, no typing SKUs.' },
      { spot: '/marketing/spot-offline.webp', title: 'Offline-first, always', body: 'The register runs on an embedded database and keeps selling through outages, then syncs to the cloud automatically.' },
      { spot: '/marketing/spot-hardware.webp', title: 'Works with your hardware', body: 'Barcode scanners, thermal receipt printers and cash drawers are supported out of the box.' },
      { spot: '/marketing/spot-receipts.webp', title: 'Digital receipts', body: 'Send receipts by WhatsApp or email in a tap — or print a thermal copy for the counter.' },
    ],
    bullets: [
      'Touch POS and fast keyboard modes',
      'Cashier shifts, cash in/out and Z-reports',
      'Weighed goods with a weigh-at-checkout modal',
      'Per-line rate tiers (retail / wholesale / distributor)',
      'Invoice discounts applied before GST',
      'Salesperson tracking per line item',
    ],
  },
  {
    slug: 'marketplace',
    eyebrow: 'Consumer Marketplace',
    title: 'Put your shop online in minutes',
    tagline: 'A curated marketplace where customers browse local Bhutanese stores and order for pickup or delivery.',
    hero: '/marketing/hero-marketplace.webp',
    highlights: [
      { spot: '/marketing/spot-receipts.webp', title: 'Order pickup or delivery', body: 'Each store chooses its own fulfilment mode — collect in-store or send it out with a rider.' },
      { spot: '/marketing/spot-ai-vision.webp', title: 'AI-enriched listings', body: 'Generate product descriptions, categories, specs and default catalog images automatically.' },
    ],
    bullets: [
      'Public, no-account-needed browsing',
      'Platform-curated featured storefronts',
      'Simple email + social sign-in to buy',
      'Self-serve Excel product & stock import',
      'Order tracking and cancellations with stock return',
      'One catalog, sold in-store and online',
    ],
  },
  {
    slug: 'compliance',
    eyebrow: 'GST 2026 & Accounting',
    title: 'Bhutan GST 2026, handled for you',
    tagline: 'Every sale is taxed, signed and filed correctly — so month-end is a click, not a scramble.',
    hero: '/marketing/hero-about.webp',
    highlights: [
      { spot: '/marketing/spot-gst.webp', title: 'Flat 5% GST engine', body: 'Per-line, tax-exclusive GST is calculated automatically on every taxable item.' },
      { spot: '/marketing/spot-offline.webp', title: 'One-click GST reports', body: 'Aggregate the month and export a report formatted for the Ministry of Finance portal.' },
    ],
    bullets: [
      'Input Tax Credit (ITC) tracking for B2B',
      'SHA-256 digital signatures on every invoice',
      'Tamper-evident transaction ledger',
      'Comprehensive audit logs',
      'HSN classification with admin-managed templates',
    ],
  },
  {
    slug: 'supply-chain',
    eyebrow: 'B2B Supply Chain',
    title: 'From distributor to doorstep',
    tagline: 'The whole tier — distributors, wholesalers and retailers — connected on one platform.',
    hero: '/marketing/hero-supplychain.webp',
    highlights: [
      { spot: '/marketing/spot-supplychain.webp', title: 'Multi-tier ordering', body: 'Retailers restock from their wholesalers, wholesalers from distributors — with credit-limit checks built in.' },
      { spot: '/marketing/spot-hardware.webp', title: 'Warehouses & bulk packages', body: 'Manage warehouse stock and buy or sell in pallet, box and piece bulk packages.' },
    ],
    bullets: [
      'Per-category wholesaler relationships',
      'Credit limits enforced at order time',
      'Supplier catalogs and favourites',
      'Predictive low-stock restocking prompts',
      'Bulk package open / split (pallet → box → piece)',
    ],
  },
]

// Home-page value props (short, scannable).
export const HOME_STATS = [
  { value: '5%', label: 'Flat GST, calculated on every line' },
  { value: '100%', label: 'Functional offline — sells through outages' },
  { value: '4-tier', label: 'Distributor → wholesaler → retailer → shopper' },
]

export function pillar(slug) {
  return PILLARS.find(p => p.slug === slug)
}
