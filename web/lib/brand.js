// Pelbu brand identity + logo assets.
// Logo imagery is served from the CDN (private S3 bucket via CloudFront, img.pelbu.com).
// For receipts/invoices (PDF capture + offline POS) use the inlined data URI in
// ./pelbu-icon-data instead — a CDN <img> can taint the canvas and won't load offline.

export const BRAND_NAME = 'Pelbu'
export const BRAND_TAGLINE = 'Point of Sale'

const CDN = 'https://img.pelbu.com/branding'

export const LOGO = {
  // Horizontal lockup (emblem + wordmark) — headers, wide spaces
  horizontal:      `${CDN}/pelbu-horizontal.png`,       // 800w default
  horizontal400:   `${CDN}/pelbu-horizontal-400.png`,
  horizontal800:   `${CDN}/pelbu-horizontal-800.png`,
  horizontal1600:  `${CDN}/pelbu-horizontal-1600.png`,
  // Stacked lockup — centered splash (login, signups)
  stacked:         `${CDN}/pelbu-stacked.png`,          // 386w
  stacked192:      `${CDN}/pelbu-stacked-192.png`,
  // Circular seal icon — compact badge spots
  icon:            `${CDN}/pelbu-icon.png`,             // 256 default
  icon64:          `${CDN}/pelbu-icon-64.png`,
  icon128:         `${CDN}/pelbu-icon-128.png`,
  icon256:         `${CDN}/pelbu-icon-256.png`,
}
