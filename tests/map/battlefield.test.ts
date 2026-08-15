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

  it("keeps a complete attack route from each camp to the enemy castle approach", () => {
    const routes = [
      [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.castleApproaches.crimson],
      [BATTLEFIELD_MAP.crimsonCamp, BATTLEFIELD_MAP.castleApproaches.verdant],
    ] as const;
    for (const [start, goal] of routes) {
      const path = findHexPath(BATTLEFIELD_MAP, start, goal);
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

  it("assigns fixed territories while keeping the river and bridge neutral", () => {
    const verdantCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "verdant");
    const crimsonCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "crimson");

    expect(verdantCells.length).toBeGreaterThan(0);
    expect(crimsonCells.length).toBe(verdantCells.length);
    expect(verdantCells.every((cell) => cell.r >= 2)).toBe(true);
    expect(crimsonCells.every((cell) => cell.r <= -2)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => Math.abs(cell.r) <= 1)
      .every((cell) => cell.territory === null)).toBe(true);
  });

  it("marks reserved routes, obstacles, bridges, and castle cells as unbuildable", () => {
    const reserved = BATTLEFIELD_MAP.cells.filter((cell) => cell.reservedForPath);
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved.every((cell) => !cell.buildable)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.surface === "water"
      || cell.surface === "bridge"
      || cell.surface === "forest"
      || cell.surface === "rock"
    )).every((cell) => !cell.buildable)).toBe(true);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.verdant)?.buildable).toBe(false);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.crimson)?.buildable).toBe(false);
  });
});
