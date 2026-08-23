// The Pcs / Pack / Case unit ladder behind the counter's Alt+U sheet (spec WF-05).
//
// MODEL. Stock is held in PIECES and only ever moves in pieces. A ticket line records which
// level it was rung at plus that level's `factor` (pieces per one of it), so:
//
//     line.quantity  is in the SOLD unit          (2 cases)
//     line.unit_price is the price of ONE of it   (a case rate)
//     pieces moved   = quantity * factor          (240)
//
// Keeping quantity in the sold unit means `quantity * unit_price = total` still holds, so the
// GST maths, the totals and every report stay exactly as they were — the factor only enters
// where stock is read or written.
//
// This is deliberately NOT the vendor-console package model (cloud migrations 084/085), where a
// pallet, a box and a piece are three separate stock-carrying products (Model B). A retail
// counter has one stock pool per item, so the ladder is two integers on the item master
// (cloud migration 134 / PB 027) rather than a tree of products.
//
// A level the shop has not configured is ABSENT from the ladder rather than defaulted. That is
// the whole point: a Pcs/Pack/Case sheet with guessed factors would invent quantities and
// silently mis-deduct stock.

export type UnitLevelId = "PCS" | "PACK" | "CASE";

export interface UnitLevel {
  id: UnitLevelId;
  /** What the cashier sees — the shop's own wording where it set one. */
  label: string;
  /** Pieces per one of this unit. Always >= 1; the base level is 1. */
  factor: number;
}

/** Just the fields the ladder needs, so this stays usable from a cart line's expanded product. */
export interface UnitSource {
  unit?: string | null;
  sold_by_weight?: boolean;
  pack_size?: number | null;
  case_size?: number | null;
  pack_label?: string | null;
  case_label?: string | null;
}

/** The base unit's display name: the product's own unit, else Kg for weighed goods, else Pcs. */
export function baseUnitLabel(p: UnitSource | null | undefined): string {
  const own = (p?.unit || "").trim();
  if (own) return own;
  return p?.sold_by_weight ? "Kg" : "Pcs";
}

/**
 * The levels this product can be sold at, base first.
 *
 * Weighed goods (rice by the kilo) never get pack levels — you sell 1.5 kg, not 1.5 cartons —
 * and the cloud CHECK enforces the same, so this is a mirror of the DB rule, not a second
 * opinion. A factor of 1 or less is treated as "not configured" for the same reason the DB
 * rejects it: a Case that means one piece is a data-entry slip, not a unit.
 */
export function unitLadder(p: UnitSource | null | undefined): UnitLevel[] {
  const base: UnitLevel = { id: "PCS", label: baseUnitLabel(p), factor: 1 };
  if (!p || p.sold_by_weight) return [base];

  const pack = Number(p.pack_size) || 0;
  if (pack <= 1) return [base];
  const levels: UnitLevel[] = [base, { id: "PACK", label: (p.pack_label || "").trim() || "Pack", factor: pack }];

  // A case is counted in PACKS, so it only exists on top of a pack — same rule as the cloud's
  // products_case_requires_pack_check.
  const cs = Number(p.case_size) || 0;
  if (cs > 1) levels.push({ id: "CASE", label: (p.case_label || "").trim() || "Case", factor: pack * cs });

  return levels;
}

/** True when there is anything to choose — the sheet says so instead of opening on one row. */
export function hasUnitChoice(p: UnitSource | null | undefined): boolean {
  return unitLadder(p).length > 1;
}

/**
 * Which level a ticket line is currently rung at. Falls back to the base level, which is how
 * every line written before the ladder existed must be read — `unit_factor` absent means 1.
 */
export function levelForLine(
  p: UnitSource | null | undefined,
  unitLabel?: string | null,
  unitFactor?: number | null,
): UnitLevel {
  const ladder = unitLadder(p);
  const factor = Number(unitFactor) || 1;
  return (
    ladder.find((l) => l.factor === factor && (!unitLabel || l.label === unitLabel)) ??
    ladder.find((l) => l.factor === factor) ??
    // The line's stored unit is no longer on the ladder (the shop changed pack_size after the
    // sale was rung). Honour what was RUNG rather than silently repricing history.
    (factor > 1 ? { id: "PACK" as UnitLevelId, label: unitLabel || "Pack", factor } : ladder[0])
  );
}

/** Pieces per sold unit for a line. Always >= 1, so callers can multiply unconditionally. */
export function lineFactor(item: { unit_factor?: number | null } | null | undefined): number {
  const f = Number(item?.unit_factor) || 1;
  return f > 0 ? f : 1;
}

/** Pieces a line consumes from stock. */
export function piecesFor(item: { quantity: number; unit_factor?: number | null }): number {
  return item.quantity * lineFactor(item);
}

/**
 * How many whole `factor`-sized units the given piece stock covers.
 *
 * Floor, never round: 11 pieces is zero full cartons of 12, and offering to sell one would
 * oversell. Untracked stock (null) has no cap.
 */
export function unitsAvailable(pieceStock: number | null | undefined, factor: number): number | null {
  if (typeof pieceStock !== "number") return null;
  return Math.floor(pieceStock / Math.max(1, factor));
}

/** Re-rate a line for a new level, keeping the price per PIECE the cashier already has. */
export function repriceForLevel(unitPrice: number, fromFactor: number, toFactor: number): number {
  const perPiece = unitPrice / Math.max(1, fromFactor);
  return parseFloat((perPiece * Math.max(1, toFactor)).toFixed(2));
}
