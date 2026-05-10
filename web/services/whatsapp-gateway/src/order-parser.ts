/**
 * WhatsApp Order Message Parser
 *
 * Extracts product names and quantities from free-form WhatsApp messages.
 * Supports formats:
 *   - "2x Product Name"
 *   - "Product Name x2"
 *   - "2 Product Name"
 *   - "Product Name" (quantity defaults to 1)
 *   - Multi-line lists (one item per line)
 *
 * @module order-parser
 */

export interface ParsedItem {
  rawName: string;
  quantity: number;
}

/**
 * Parse a WhatsApp message into a list of items with quantities.
 * Strips greeting text, "I'd like to order", etc.
 */
export function parseOrderMessage(text: string): ParsedItem[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  for (const line of lines) {
    // Skip non-item lines
    if (/^(hi|hello|hey|order|i'd like|ref:|from|thanks|please)/i.test(line)) continue;
    // Remove leading dash/bullet/emoji
    const cleaned = line.replace(/^[-•*\s]+/, '').trim();
    if (!cleaned) continue;

    const item = parseLine(cleaned);
    if (item) items.push(item);
  }

  return items;
}

/**
 * Parse a single line into { rawName, quantity }.
 */
function parseLine(line: string): ParsedItem | null {
  // Pattern: "2x Product Name" or "2× Product Name"
  let match = line.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (match) return { quantity: parseInt(match[1]), rawName: match[2].trim() };

  // Pattern: "Product Name x2" or "Product Name ×2"
  match = line.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
  if (match) return { quantity: parseInt(match[2]), rawName: match[1].trim() };

  // Pattern: "2 Product Name" (number followed by text, no x)
  match = line.match(/^(\d+)\s+([a-zA-Z].+)$/);
  if (match) return { quantity: parseInt(match[1]), rawName: match[2].trim() };

  // Pattern: bare product name (quantity = 1)
  if (line.length >= 2 && /[a-zA-Z]/.test(line)) {
    return { quantity: 1, rawName: line };
  }

  return null;
}

/**
 * Fuzzy-match parsed items against a store's product catalog using pg_trgm.
 * Threshold: 70% similarity. Returns best match per item.
 */
export async function fuzzyMatchProducts(
  supabase: any,
  entityId: string,
  items: ParsedItem[]
): Promise<FuzzyMatchResult[]> {
  const results: FuzzyMatchResult[] = [];

  for (const item of items) {
    const { data: matches } = await supabase
      .rpc('fuzzy_match_product', {
        p_name: item.rawName,
        p_entity_id: entityId,
        p_threshold: 0.7,
      });

    if (matches && matches.length > 0) {
      const best = matches[0];
      results.push({
        rawName: item.rawName,
        quantity: item.quantity,
        matched: true,
        productId: best.id,
        productName: best.name,
        mrp: parseFloat(best.mrp),
        confidence: parseFloat(best.score),
      });
    } else {
      results.push({
        rawName: item.rawName,
        quantity: item.quantity,
        matched: false,
        productId: null,
        productName: item.rawName,
        mrp: 0,
        confidence: 0,
      });
    }
  }

  return results;
}

export interface FuzzyMatchResult {
  rawName: string;
  quantity: number;
  matched: boolean;
  productId: string | null;
  productName: string;
  mrp: number;
  confidence: number;
}
