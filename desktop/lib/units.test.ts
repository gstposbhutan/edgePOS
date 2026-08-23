import { describe, it, expect } from "vitest";
import {
  baseUnitLabel,
  unitLadder,
  hasUnitChoice,
  levelForLine,
  lineFactor,
  piecesFor,
  unitsAvailable,
  repriceForLevel,
} from "./units";

// A carton of 12, ten cartons to a case → 120 pieces per case.
const rice = { unit: "Pcs", pack_size: 12, case_size: 10 };

describe("baseUnitLabel", () => {
  it("prefers the product's own unit", () => {
    expect(baseUnitLabel({ unit: "Btl" })).toBe("Btl");
  });
  it("falls back to Kg for weighed goods and Pcs otherwise", () => {
    expect(baseUnitLabel({ sold_by_weight: true })).toBe("Kg");
    expect(baseUnitLabel({})).toBe("Pcs");
    expect(baseUnitLabel(null)).toBe("Pcs");
  });
});

describe("unitLadder", () => {
  it("builds Pcs → Pack → Case, with the case counted in PACKS", () => {
    expect(unitLadder(rice)).toEqual([
      { id: "PCS", label: "Pcs", factor: 1 },
      { id: "PACK", label: "Pack", factor: 12 },
      { id: "CASE", label: "Case", factor: 120 },
    ]);
  });

  it("uses the shop's own wording when it set some", () => {
    const l = unitLadder({ ...rice, pack_label: "Carton", case_label: "Pallet" });
    expect(l.map((x) => x.label)).toEqual(["Pcs", "Carton", "Pallet"]);
  });

  it("omits a level the shop has not configured rather than guessing one", () => {
    expect(unitLadder({ unit: "Pcs" })).toHaveLength(1);
    expect(unitLadder({ unit: "Pcs", pack_size: 12 }).map((l) => l.id)).toEqual(["PCS", "PACK"]);
  });

  it("drops a case with no pack — a case is counted in packs, so it has no size", () => {
    expect(unitLadder({ unit: "Pcs", case_size: 10 }).map((l) => l.id)).toEqual(["PCS"]);
  });

  it("treats a factor of 1 or less as not configured, like the DB CHECK does", () => {
    expect(unitLadder({ pack_size: 1 })).toHaveLength(1);
    expect(unitLadder({ pack_size: 0 })).toHaveLength(1);
    expect(unitLadder({ pack_size: -5 })).toHaveLength(1);
  });

  it("never gives weighed goods a pack level", () => {
    expect(unitLadder({ unit: "Kg", sold_by_weight: true, pack_size: 12 })).toEqual([
      { id: "PCS", label: "Kg", factor: 1 },
    ]);
  });

  it("reports whether there is anything to choose", () => {
    expect(hasUnitChoice(rice)).toBe(true);
    expect(hasUnitChoice({ unit: "Pcs" })).toBe(false);
  });
});

describe("levelForLine", () => {
  it("reads a line with no stored unit as the base level", () => {
    expect(levelForLine(rice, null, null).factor).toBe(1);
  });
  it("matches the stored factor", () => {
    expect(levelForLine(rice, "Case", 120).id).toBe("CASE");
  });
  it("honours what was rung when the shop later changed pack_size", () => {
    // Line rung at 12/pack; the item master now says 6. The line stays a 12.
    const level = levelForLine({ unit: "Pcs", pack_size: 6 }, "Pack", 12);
    expect(level.factor).toBe(12);
    expect(level.label).toBe("Pack");
  });
});

describe("piece maths", () => {
  it("defaults a missing or bad factor to 1 rather than 0", () => {
    expect(lineFactor(undefined)).toBe(1);
    expect(lineFactor({ unit_factor: null })).toBe(1);
    expect(lineFactor({ unit_factor: 0 })).toBe(1);
    expect(lineFactor({ unit_factor: -3 })).toBe(1);
  });

  it("converts a line to the pieces it consumes", () => {
    expect(piecesFor({ quantity: 2, unit_factor: 120 })).toBe(240);
    expect(piecesFor({ quantity: 3 })).toBe(3);
  });

  it("floors availability — 11 pieces is zero full cartons of 12", () => {
    expect(unitsAvailable(11, 12)).toBe(0);
    expect(unitsAvailable(25, 12)).toBe(2);
    expect(unitsAvailable(240, 120)).toBe(2);
  });

  it("treats untracked stock as uncapped", () => {
    expect(unitsAvailable(null, 12)).toBeNull();
    expect(unitsAvailable(undefined, 12)).toBeNull();
  });
});

describe("repriceForLevel", () => {
  it("keeps the price per piece when the level changes", () => {
    expect(repriceForLevel(100, 1, 12)).toBe(1200);
    expect(repriceForLevel(1200, 12, 1)).toBe(100);
    expect(repriceForLevel(1200, 12, 120)).toBe(12000);
  });

  it("round-trips a rate the cashier overrode with F5", () => {
    const caseRate = repriceForLevel(99.5, 1, 120);
    expect(caseRate).toBe(11940);
    expect(repriceForLevel(caseRate, 120, 1)).toBe(99.5);
  });
});
