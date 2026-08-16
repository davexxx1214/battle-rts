import { describe, expect, it } from "vitest";

import { BATTLEFIELD_MAP, coordinateKey } from "../../src/map/battlefield";
import {
  TERRAIN_TILE_ASSETS,
  createTerrainTilePlan,
} from "../../src/scene/terrain/tilePresentation";

describe("terrain tile presentation", () => {
  it("gives every map cell an official KayKit tile without changing terrain semantics", () => {
    const plan = createTerrainTilePlan(BATTLEFIELD_MAP);

    expect(plan).toHaveLength(BATTLEFIELD_MAP.cells.length);
    expect(new Set(plan.map(({ cell }) => coordinateKey(cell))).size).toBe(plan.length);
    expect(plan.filter(({ cell }) => cell.surface === "water")
      .every(({ assetKey }) => assetKey === "water")).toBe(true);
    expect(plan.filter(({ cell }) => cell.surface === "bridge")
      .every(({ assetKey, renderHeight }) => (
        assetKey.startsWith("road-") && renderHeight === 0.36
      ))).toBe(true);
    expect(plan.filter(({ cell }) => cell.surface !== "water")
      .every(({ assetKey }) => assetKey !== "water")).toBe(true);
    expect(Object.values(TERRAIN_TILE_ASSETS)
      .every(({ url }) => url.startsWith("/assets/kaykit/medieval-hex/tiles/"))).toBe(true);
  });

  it("lays a deterministic connected road from both camps through both crossings", () => {
    const plan = createTerrainTilePlan(BATTLEFIELD_MAP);
    const roads = plan.filter(({ assetKey }) => assetKey.startsWith("road-"));
    const roadKeys = new Set(roads.map(({ cell }) => coordinateKey(cell)));
    const bridgeKeys = BATTLEFIELD_MAP.bridges.flatMap(({ cells }) => cells.map(coordinateKey));

    expect(roads.length).toBeGreaterThan(10);
    expect(bridgeKeys.every((key) => roadKeys.has(key))).toBe(true);
    expect(roads.every(({ connections, rotationY }) => (
      connections.length > 0
      && connections.length <= 6
      && Number.isFinite(rotationY)
    ))).toBe(true);
    expect(createTerrainTilePlan(BATTLEFIELD_MAP)).toEqual(plan);
  });

  it("aligns two land road exits with both lanes of every bridge", () => {
    const planByCoordinate = new Map(
      createTerrainTilePlan(BATTLEFIELD_MAP).map((tile) => [coordinateKey(tile.cell), tile]),
    );
    const directions = [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
      { q: -1, r: 0 },
      { q: 0, r: -1 },
      { q: 1, r: -1 },
    ] as const;

    for (const bridge of BATTLEFIELD_MAP.bridges) {
      const bridgeKeys = new Set(bridge.cells.map(coordinateKey));
      for (const landing of [
        ...bridge.landings.verdant,
        ...bridge.landings.crimson,
      ]) {
        const landingTile = planByCoordinate.get(coordinateKey(landing));
        const directionIntoBridge = directions.findIndex(({ q, r }) => (
          bridgeKeys.has(coordinateKey({ q: landing.q + q, r: landing.r + r }))
        ));

        expect(directionIntoBridge).toBeGreaterThanOrEqual(0);
        expect(landingTile?.assetKey.startsWith("road-")).toBe(true);
        expect(landingTile?.connections).toContain(directionIntoBridge);
      }
    }
  });
});
