"use client";

export type PriceListMode = "RETAIL" | "WHOLESALE" | "DISTRIBUTOR";

export const PRICE_LIST_ORDER: PriceListMode[] = ["RETAIL", "WHOLESALE", "DISTRIBUTOR"];

export const PRICE_LIST_LABEL: Record<PriceListMode, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  DISTRIBUTOR: "Distributor",
};

type Priced = {
  sale_price?: number;
  mrp?: number;
  wholesale_price?: number;
  distributor_price?: number;
};

/**
 * Resolve a product's unit price for the active price-list tier, with a
 * fallback ladder so an unset tier degrades gracefully:
 *   RETAIL      → sale_price → mrp → wholesale_price
 *   WHOLESALE   → wholesale_price → mrp
 *   DISTRIBUTOR → distributor_price → wholesale_price → mrp
 * A falsy/0 value means "unset" (matches the existing sale_price || mrp
 * convention, and PB number fields default to 0).
 */
export function priceFor(p: Priced, mode: PriceListMode): number {
  switch (mode) {
    case "WHOLESALE":
      return p.wholesale_price || p.mrp || 0;
    case "DISTRIBUTOR":
      return p.distributor_price || p.wholesale_price || p.mrp || 0;
    case "RETAIL":
    default:
      return p.sale_price || p.mrp || p.wholesale_price || 0;
  }
}

/** Parse a persisted price-list mode (localStorage). Defaults to RETAIL. */
export function parsePriceListMode(v: string | null): PriceListMode {
  return v === "WHOLESALE" || v === "DISTRIBUTOR" ? v : "RETAIL";
}
