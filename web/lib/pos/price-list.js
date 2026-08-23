"use client"

// The price tiers the till can ring at (Alt+P). The mirror of desktop/lib/price-list.ts — the
// tier NAMES and their order have to match, or the same key on the two tills lands a cashier on
// a different price list.
//
// Resolving a product's actual price is `priceFor` inside web/hooks/use-cart.js, which reads
// the web column names (selling_price / wholesale_price / distributor_price); `repriceCart`
// there moves every existing line to the chosen tier.

export const PRICE_LIST_ORDER = ['RETAIL', 'WHOLESALE', 'DISTRIBUTOR']

export const PRICE_LIST_LABEL = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  DISTRIBUTOR: 'Distributor',
}

const KEY = 'pos_price_list'

/** Parse a persisted price-list mode (localStorage). Defaults to RETAIL. */
export function parsePriceListMode(v) {
  return v === 'WHOLESALE' || v === 'DISTRIBUTOR' ? v : 'RETAIL'
}

export function loadPriceListMode() {
  if (typeof window === 'undefined') return 'RETAIL'
  try {
    return parsePriceListMode(window.localStorage.getItem(KEY))
  } catch {
    return 'RETAIL'
  }
}

export function savePriceListMode(mode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    /* private mode — the tier just doesn't survive a reload */
  }
}

/** The next tier in the cycle. */
export function nextPriceListMode(mode) {
  return PRICE_LIST_ORDER[(PRICE_LIST_ORDER.indexOf(mode) + 1) % PRICE_LIST_ORDER.length]
}
