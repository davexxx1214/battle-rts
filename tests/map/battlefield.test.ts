import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_STRUCTURES,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../../src/map/battlefield";
import { findHexPath } from "../../src/game/navigation";

describe("battlefield island", () => {
  it("contains unique cells, three land elevations, and two separated water basins", () => {
    const keys = BATTLEFIELD_MAP.cells.map((cell) => `${cell.q},${cell.r}`);
    const landHeights = new Set(
      BATTLEFIELD_MAP.cells.filter((cell) => cell.walkable).map((cell) => cell.height),
    );
    const waterSides = new Set(
      BATTLEFIELD_MAP.cells
        .filter((cell) => cell.surface === "water")
        .map((cell) => Math.sign(cell.q)),
    );

    expect(new Set(keys).size).toBe(keys.length);
    expect(landHeights.size).toBeGreaterThanOrEqual(3);
    expect(waterSides).toEqual(new Set([-1, 1]));
  });

  it("keeps both camps connected to the central bridge without crossing blocked cells", () => {
    for (const camp of [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.crimsonCamp]) {
      const path = findHexPath(BATTLEFIELD_MAP, camp, BATTLEFIELD_MAP.center);
      expect(path.length).toBeGreaterThan(1);
      expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
    }
  });

  it("marks every battlefield structure footprint as blocked terrain", () => {
    expect(BATTLEFIELD_STRUCTURES).toHaveLength(2);
    for (const structure of BATTLEFIELD_STRUCTURES) {
      for (const coordinate of structure.footprint) {
        expect(getBattlefieldCell(coordinate)?.walkable).toBe(false);
      }
    }
  });

  it("round-trips battlefield hex centers through world coordinates", () => {
    for (const coordinate of [
      BATTLEFIELD_MAP.verdantCamp,
      BATTLEFIELD_MAP.center,
      BATTLEFIELD_MAP.crimsonCamp,
    ]) {
      expect(worldToAxial(axialToWorld(coordinate))).toEqual(coordinate);
    }
  });
});
