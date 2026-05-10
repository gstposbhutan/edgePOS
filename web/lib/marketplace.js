/**
 * Marketplace utility functions.
 * @module lib/marketplace
 */

/**
 * Generate a URL-safe slug from a business name.
 * Lowercase, hyphenated, max 3 words.
 * @param {string} businessName
 * @returns {string}
 */
export function generateSlug(businessName) {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-')
}

/**
 * Build a WhatsApp deep link with pre-filled order message.
 * @param {string} shopPhone - E.164 format (e.g. +97517123456)
 * @param {string} productName
 * @param {string} shopName
 * @returns {string} WhatsApp URL
 */
export function buildWhatsAppLink(shopPhone, productName, shopName) {
  const phone = shopPhone.replace(/^\+/, '')
  const message = encodeURIComponent(
    `Hi! I'd like to order:\n- ${productName} × 1\nFrom ${shopName}`
  )
  return `https://wa.me/${phone}?text=${message}`
}
