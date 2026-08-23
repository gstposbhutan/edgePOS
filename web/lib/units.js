/**
 * Pcs / Pack / Case unit ladder — the item-master half (cloud migration 134).
 *
 * The terminal's Alt+U sheet reads these factors to let a cashier ring a line in packs or
 * cases; stock stays in PIECES on both sides and only the ticket line is scaled. The mirror of
 * this logic lives in desktop/lib/units.ts, which builds the ladder the sheet shows.
 *
 * Normalising here rather than leaning on the DB CHECKs is deliberate: the constraints exist so
 * a bad factor can never reach the till, but a raw 23514 reaching the product form reads as
 * "something went wrong" instead of telling the shop what to fix.
 */

/** A level of 0 or 1 is not a unit, it is a slip that would make a Case mean one piece. */
function factor(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 1 ? n : null
}

function label(value) {
  const s = typeof value === 'string' ? value.trim() : ''
  return s || null
}

/**
 * The pack/case columns for an insert or update, or an `error` explaining what to fix.
 *
 * @param {object} formData
 * @returns {{ fields: object } | { error: string }}
 */
export function packCaseFields(formData) {
  const weighed = !!formData.sold_by_weight
  const pack = factor(formData.pack_size)
  const cs = factor(formData.case_size)

  // Weighed goods are sold by measure (1.5 kg), never by sealed pack — the DB enforces the
  // same. Clearing rather than erroring keeps "tick sold by weight" from becoming a dead end
  // on a product that once had a pack size.
  if (weighed) {
    return { fields: { pack_size: null, case_size: null, pack_label: null, case_label: null } }
  }

  // A case is counted in PACKS, so a case with no pack has no defined size. Refusing is what
  // keeps the counter's unit sheet from inventing a quantity.
  if (cs && !pack) {
    return { error: 'A case is counted in packs — set the pack size (pieces per pack) first.' }
  }

  // Catch the slip the factor() filter silently dropped, rather than saving a surprise blank.
  if (!pack && formData.pack_size !== '' && formData.pack_size != null && parseInt(formData.pack_size, 10) === 1) {
    return { error: 'A pack of 1 is the same as a piece — leave the pack size blank instead.' }
  }

  return {
    fields: {
      pack_size: pack,
      case_size: pack ? cs : null,
      pack_label: pack ? label(formData.pack_label) : null,
      case_label: pack && cs ? label(formData.case_label) : null,
    },
  }
}
