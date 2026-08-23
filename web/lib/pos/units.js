// The Pcs / Pack / Case unit ladder behind the till's Alt+U sheet (spec WF-05).
//
// This is the WEB mirror of desktop/lib/units.ts — same model, same rules, so a shop that
// configures a carton once gets the same ladder on the terminal and in the browser. Keep the
// two in step; the desktop file carries the long-form rationale and the 18 unit tests.
//
// MODEL. Stock is held in PIECES and only ever moves in pieces. A ticket line records which
// level it was rung at plus that level's `factor` (pieces per one of it), so:
//
//     line.quantity   is in the SOLD unit         (2 cases)
//     line.unit_price is the price of ONE of it   (a case rate)
//     pieces moved    = quantity * factor         (240)
//
// Keeping quantity in the sold unit means `quantity * unit_price = total` still holds, so the
// GST maths, the totals and every report stay exactly as they were — the factor only enters
// where stock is read or written.
//
// Deliberately NOT the vendor-console package model (migrations 084/085), where a pallet, a box
// and a piece are three separate stock-carrying products. A retail counter has ONE stock pool
// per item, so the ladder is two integers on the item master (migration 134).
//
// A level the shop has not configured is ABSENT rather than defaulted — a sheet built on a
// guessed factor would invent quantities and silently mis-deduct stock.
//
// The item-master half (validating what the product form saves) lives in web/lib/units.js.

/** The base unit's display name: the product's own unit, else Kg for weighed goods, else Pcs. */
export function baseUnitLabel(p) {
  const own = (p?.unit || '').trim()
  if (own) return own
  return p?.sold_by_weight ? 'Kg' : 'Pcs'
}

/**
 * The levels this product can be sold at, base first.
 *
 * Weighed goods (rice by the kilo) never get pack levels — you sell 1.5 kg, not 1.5 cartons —
 * mirroring the cloud CHECK rather than offering a second opinion. A factor of 1 or less is
 * "not configured" for the same reason the DB rejects it: a Case that means one piece is a
 * data-entry slip, not a unit.
 */
export function unitLadder(p) {
  const base = { id: 'PCS', label: baseUnitLabel(p), factor: 1 }
  if (!p || p.sold_by_weight) return [base]

  const pack = Number(p.pack_size) || 0
  if (pack <= 1) return [base]
  const levels = [base, { id: 'PACK', label: (p.pack_label || '').trim() || 'Pack', factor: pack }]

  // A case is counted in PACKS, so it only exists on top of a pack — the same rule as the
  // cloud's products_case_requires_pack_check.
  const cs = Number(p.case_size) || 0
  if (cs > 1) levels.push({ id: 'CASE', label: (p.case_label || '').trim() || 'Case', factor: pack * cs })

  return levels
}

/** True when there is anything to choose — the sheet says so instead of opening on one row. */
export function hasUnitChoice(p) {
  return unitLadder(p).length > 1
}

/**
 * Which level a ticket line is currently rung at. Falls back to the base level, which is how
 * every line written before the ladder existed must be read — `unit_factor` absent means 1.
 */
export function levelForLine(p, unitLabel, unitFactor) {
  const ladder = unitLadder(p)
  const factor = Number(unitFactor) || 1
  return (
    ladder.find(l => l.factor === factor && (!unitLabel || l.label === unitLabel)) ??
    ladder.find(l => l.factor === factor) ??
    // The line's stored unit is no longer on the ladder (the shop changed pack_size after the
    // sale was rung). Honour what was RUNG rather than silently repricing history.
    (factor > 1 ? { id: 'PACK', label: unitLabel || 'Pack', factor } : ladder[0])
  )
}

/** Pieces per sold unit for a line. Always >= 1, so callers can multiply unconditionally. */
export function lineFactor(item) {
  const f = Number(item?.unit_factor) || 1
  return f > 0 ? f : 1
}

/** Pieces a line consumes from stock. */
export function piecesFor(item) {
  return item.quantity * lineFactor(item)
}

/**
 * How many whole `factor`-sized units the given piece stock covers.
 *
 * Floor, never round: 11 pieces is zero full cartons of 12, and offering to sell one would
 * oversell. Untracked stock (null/undefined) has no cap.
 */
export function unitsAvailable(pieceStock, factor) {
  if (typeof pieceStock !== 'number') return null
  return Math.floor(pieceStock / Math.max(1, factor))
}

/** Re-rate a line for a new level, keeping the price per PIECE the cashier already has. */
export function repriceForLevel(unitPrice, fromFactor, toFactor) {
  const perPiece = unitPrice / Math.max(1, fromFactor)
  return parseFloat((perPiece * Math.max(1, toFactor)).toFixed(2))
}
