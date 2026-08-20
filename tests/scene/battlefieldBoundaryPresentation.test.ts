import { describe, expect, it } from "vitest";

import {
  HEX_NEIGHBOR_OFFSETS,
  axialToWorld,
  battlefieldWorldBounds,
  coordinateKey,
  hexDistance,
  type BattlefieldCell,
  type BattlefieldMap,
} from "../../src/map/battlefield";
import {
  LEGACY_BATTLEFIELD_DEFINITION,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";
import {
  BATTLEFIELD_WATER_TILE_RADIUS,
  createBattlefieldBoundaryPresentation,
} from "../../src/scene/terrain/battlefieldBoundaryPresentation";

describe("battlefield boundary presentation", () => {
  it("covers every exposed neighbor of the 871-cell clipped sandbox boundary", () => {
    const { map, worldBounds } = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const presentation = createBattlefieldBoundaryPresentation(map, worldBounds);
    const mapKeys = new Set(map.cells.map(coordinateKey));
    const expectedWaterKeys = exposedNeighborKeys(map);
    const actualWaterKeys = new Set(presentation.waterCells.map(coordinateKey));

    expect(map.cells).toHaveLength(871);
    expect(actualWaterKeys).toEqual(expectedWaterKeys);
    expect(actualWaterKeys.size).toBe(presentation.waterCells.length);
    expect([...actualWaterKeys].every((key) => !mapKeys.has(key))).toBe(true);
    expect(presentation.waterCells.every((cell) => hasMapNeighbor(cell, mapKeys))).toBe(true);
  });

  it("uses the true non-regular edge instead of synthesizing a radius ring", () => {
    const { map, worldBounds } = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const presentation = createBattlefieldBoundaryPresentation(map, worldBounds);

    expect(presentation.waterCells.some((cell) => (
      hexDistance(cell, map.center) <= map.radius
    ))).toBe(true);
    expect(presentation.waterCells.every((cell) => (
      cell.surface === "water"
      && cell.height === -0.34
      && !cell.walkable
      && !cell.buildable
      && cell.buildPolicy === "forbidden"
    ))).toBe(true);
  });

  it("covers an arbitrary off-center jagged map and does not depend on radius", () => {
    const cells = [
      cellAt(3, -2),
      cellAt(4, -2),
      cellAt(4, -1),
      cellAt(5, -1),
    ];
    const map: BattlefieldMap = {
      id: "jagged-test-map",
      navigationRevision: 1,
      cells,
      verdantCamp: cells[0]!,
      crimsonCamp: cells.at(-1)!,
      center: cells[1]!,
      bridges: [],
      castles: { verdant: cells[0]!, crimson: cells.at(-1)! },
      castleApproaches: { verdant: cells[0]!, crimson: cells.at(-1)! },
      radius: 999,
    };
    const worldBounds = battlefieldWorldBounds(map);
    const presentation = createBattlefieldBoundaryPresentation(map, worldBounds);

    expect(new Set(presentation.waterCells.map(coordinateKey)))
      .toEqual(exposedNeighborKeys(map));
    expect(presentation.underlay.center).toEqual({
      x: (worldBounds.minX + worldBounds.maxX) / 2,
      z: (worldBounds.minZ + worldBounds.maxZ) / 2,
    });
  });

  it("keeps the legacy water material geometry while deriving its edge cells", () => {
    const { map, worldBounds } = LEGACY_BATTLEFIELD_DEFINITION;
    const presentation = createBattlefieldBoundaryPresentation(map, worldBounds);

    expect(new Set(presentation.waterCells.map(coordinateKey)))
      .toEqual(exposedNeighborKeys(map));
    expect(presentation.underlay).toMatchObject({
      center: { x: 0, z: 0 },
      topRadius: 22,
      bottomRadius: 23.5,
      height: 1.5,
      y: -0.95,
    });
  });

  it("sizes the underlay beyond every map and skirt tile", () => {
    for (const definition of [
      LEGACY_BATTLEFIELD_DEFINITION,
      SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
    ]) {
      const presentation = createBattlefieldBoundaryPresentation(
        definition.map,
        definition.worldBounds,
      );
      const { center, topRadius } = presentation.underlay;
      const cells = [...definition.map.cells, ...presentation.waterCells];

      expect(cells.every((cell) => {
        const point = axialToWorld(cell);
        return Math.hypot(point.x - center.x, point.z - center.z)
          + BATTLEFIELD_WATER_TILE_RADIUS <= topRadius;
      })).toBe(true);
    }
  });
});

function exposedNeighborKeys(map: BattlefieldMap): Set<string> {
  const mapKeys = new Set(map.cells.map(coordinateKey));
  return new Set(map.cells.flatMap((cell) => (
    HEX_NEIGHBOR_OFFSETS
      .map((offset) => ({ q: cell.q + offset.q, r: cell.r + offset.r }))
      .filter((neighbor) => !mapKeys.has(coordinateKey(neighbor)))
      .map(coordinateKey)
  )));
}

function hasMapNeighbor(cell: BattlefieldCell, mapKeys: ReadonlySet<string>): boolean {
  return HEX_NEIGHBOR_OFFSETS.some((offset) => mapKeys.has(coordinateKey({
    q: cell.q + offset.q,
    r: cell.r + offset.r,
  })));
}

function cellAt(q: number, r: number): BattlefieldCell {
  return {
    q,
    r,
    height: 0,
    surface: "grass",
    walkable: true,
    territory: null,
    buildable: false,
    reservedForPath: false,
  };
}
