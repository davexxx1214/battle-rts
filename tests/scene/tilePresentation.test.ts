import { describe, expect, it } from "vitest";
import { MeshStandardMaterial } from "three";

import { BATTLEFIELD_MAP, coordinateKey } from "../../src/map/battlefield";
import {
  BATTLEFIELD_CASTLE_ROCK_COORDINATES,
  BATTLEFIELD_CRIMSON_FOREST_REFERENCE_COORDINATE,
  BATTLEFIELD_LEFT_FARM_COORDINATES,
  BATTLEFIELD_LEFT_FARM_PASSAGE_COORDINATE,
} from "../../src/map/battlefieldLayout";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_VISUAL_ROAD_CELLS,
} from "../../src/map/sandboxLargeBattlefield";
import { UNDEAD_HALLOWEEN_ASSETS } from "../../src/scene/assets";
import {
  TERRAIN_TILE_ASSETS,
  createTerrainTilePlan,
} from "../../src/scene/terrain/tilePresentation";
import {
  CEMETERY_GATE_COORDINATE,
  CEMETERY_GATE_ROTATION,
  CEMETERY_ROAD_GATE_COORDINATE,
  UNDEAD_CASTLE_COURTYARD_DRESSING,
  UNDEAD_CASTLE_EDGE_DRESSING,
  UNDEAD_CASTLE_TERRAIN_REPLACEMENTS,
  UNDEAD_CEMETERY_DRESSING,
  UNDEAD_HALF_OPEN_GATE_NODE_ROTATIONS,
  UNDEAD_MINE_DRESSING,
  UNDEAD_RIVERBANK_DRESSING,
  UNDEAD_SHIPWRECK_DRESSING,
  UNDEAD_CASTLE_HIGHLAND_TINT,
  UNDEAD_TERRAIN_EMISSIVE_COLOR,
  UNDEAD_TERRAIN_EMISSIVE_INTENSITY,
  UNDEAD_TERRAIN_MATERIAL_COLOR,
  applyUndeadTerrainTint,
  applyUndeadTerrainTintForFaction,
  cemeteryFacingRotation,
  sceneryVisibleForMode,
  createUndeadTerrainMaterial,
  undeadFortificationRotation,
  undeadStructureRotation,
} from "../../src/scene/terrain/BattlefieldTerrain";

function grayBrightness(hex: string): number {
  return Number.parseInt(hex.slice(1, 3), 16);
}

describe("terrain tile presentation", () => {
  it("uses a lit rough material so undead terrain keeps visible height shading", () => {
    const material = createUndeadTerrainMaterial();

    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect(`#${material.color.getHexString()}`).toBe(UNDEAD_TERRAIN_MATERIAL_COLOR);
    expect(`#${material.emissive.getHexString()}`).toBe(UNDEAD_TERRAIN_EMISSIVE_COLOR);
    expect(material.emissiveIntensity).toBe(UNDEAD_TERRAIN_EMISSIVE_INTENSITY);
    expect(material.flatShading).toBe(true);
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(0.94);
    expect(material.vertexColors).toBe(true);
    material.dispose();
  });

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

  it("renders every explicit sandbox route cell with the same KayKit road tiles", () => {
    const plan = createTerrainTilePlan(SANDBOX_LARGE_BATTLEFIELD_MAP);
    const roadKeys = new Set(plan.filter(({ assetKey }) => (
      assetKey.startsWith("road-")
    )).map(({ cell }) => coordinateKey(cell)));

    expect(roadKeys).toEqual(new Set(SANDBOX_LARGE_VISUAL_ROAD_CELLS.map(coordinateKey)));
    expect(plan.filter(({ cell }) => cell.surface === "rock").every(({ assetKey }) => (
      assetKey === "grass"
    ))).toBe(true);
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

  it("corrupts only the undead half of the battlefield without changing tile semantics", () => {
    const plan = createTerrainTilePlan(BATTLEFIELD_MAP);
    const themed = plan.map(applyUndeadTerrainTint);

    expect(themed).toHaveLength(plan.length);
    expect(themed.every((tile, index) => (
      tile.cell === plan[index]?.cell
      && tile.assetKey === plan[index]?.assetKey
      && tile.renderHeight === plan[index]?.renderHeight
    ))).toBe(true);
    expect(themed.some((tile, index) => tile.cell.r <= -2 && tile.tint !== plan[index]?.tint))
      .toBe(true);
    expect(themed.every((tile, index) => (
      tile.cell.r <= -2 || tile.tint === plan[index]?.tint
    ))).toBe(true);
    const undeadLandTints = new Set(themed
      .filter(({ cell }) => cell.r <= -2 && cell.surface !== "water")
      .map(({ tint }) => tint));
    expect(undeadLandTints.size).toBeGreaterThan(8);
    expect(undeadLandTints.has("#000000")).toBe(false);
    const groundSample = plan.find(({ assetKey, cell }) => (
      cell.surface === "grass" && !assetKey.startsWith("road-")
    ))!;
    const groundTintAt = (r: number) => applyUndeadTerrainTint({
      ...groundSample,
      cell: { ...groundSample.cell, r },
    }).tint;
    expect(grayBrightness(groundTintAt(-9))).toBeLessThan(grayBrightness(groundTintAt(-5)));
    expect(grayBrightness(groundTintAt(-5))).toBeLessThan(grayBrightness(groundTintAt(-2)));
  });

  it.each(["verdant", "crimson"] as const)(
    "keeps the %s undead castle on mirrored high ground with one deep-gray treatment",
    (faction) => {
      const highlandTiles = createTerrainTilePlan(BATTLEFIELD_MAP).filter(({ cell }) => (
        cell.territory === faction && cell.surface === "camp"
      ));
      const mirroredFaction = faction === "verdant" ? "crimson" : "verdant";
      const mirroredHighlandKeys = new Set(BATTLEFIELD_MAP.cells
        .filter(({ territory, surface }) => (
          territory === mirroredFaction && surface === "camp"
        ))
        .map(({ q, r }) => coordinateKey({ q: -q, r: -r })));

      expect(highlandTiles.length).toBeGreaterThan(0);
      expect(highlandTiles.every(({ cell, renderHeight }) => (
        renderHeight === 0.72
        && mirroredHighlandKeys.has(coordinateKey(cell))
      ))).toBe(true);
      expect(new Set(highlandTiles
        .map((tile) => applyUndeadTerrainTintForFaction(tile, faction).tint)))
        .toEqual(new Set([UNDEAD_CASTLE_HIGHLAND_TINT]));
      expect(highlandTiles.some(({ assetKey }) => assetKey.startsWith("road-"))).toBe(true);
    },
  );

  it("turns the undead rear territory into a KayKit cemetery without blocking its attack lane", () => {
    const plan = createTerrainTilePlan(BATTLEFIELD_MAP);
    const cemeteryTiles = plan
      .filter(({ cell }) => cell.r <= -4 && cell.surface !== "water")
      .map(applyUndeadTerrainTint);
    const farmKeys = new Set(
      BATTLEFIELD_LEFT_FARM_COORDINATES.map(({ q, r }) => `${q},${r}`),
    );
    const dressedFarmKeys = new Set(
      UNDEAD_CEMETERY_DRESSING
        .filter(({ coordinate }) => farmKeys.has(coordinateKey(coordinate)))
        .map(({ coordinate }) => coordinateKey(coordinate)),
    );
    const halloweenAssetKeys = new Set(Object.keys(UNDEAD_HALLOWEEN_ASSETS));

    expect(new Set(cemeteryTiles.map(({ tint }) => tint)).size).toBeGreaterThan(6);
    expect(dressedFarmKeys).toEqual(farmKeys);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ id }) => id === "cemetery-crypt")).toBe(false);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "shrine")).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "gravePit")).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING).toContainEqual(expect.objectContaining({
      id: "cemetery-plot-minus2-6-open-grave",
      asset: "gravePit",
      coordinate: { q: -2, r: -6 },
      offset: [0, 0],
      scale: 0.52,
    }));
    expect(UNDEAD_CEMETERY_DRESSING.some(({ id }) => (
      id === "cemetery-plot-minus2-6"
      || id === "cemetery-plot-minus2-6-pad"
      || id === "cemetery-plot-minus2-6-lantern"
    ))).toBe(false);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "coffinDecorated"))
      .toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "treeDeadLargeDecorated"))
      .toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset.startsWith("treePine")))
      .toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "fenceSeparate")).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.some(({ asset }) => asset === "arch")).toBe(true);
    const cemeteryGate = UNDEAD_CEMETERY_DRESSING.filter(({ id }) => (
      id.startsWith("cemetery-gate")
    ));
    expect(cemeteryGate.length).toBeGreaterThanOrEqual(3);
    expect(cemeteryGate.every(({ coordinate, rotationY }) => (
      coordinate.q === CEMETERY_GATE_COORDINATE.q
      && coordinate.r === CEMETERY_GATE_COORDINATE.r
      && rotationY === CEMETERY_GATE_ROTATION
    ))).toBe(true);
    expect(CEMETERY_GATE_ROTATION).toBeCloseTo(Math.PI / 3);
    const roadGateRotation = cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE);
    expect(UNDEAD_CEMETERY_DRESSING).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cemetery-road-gate",
        asset: "fenceSeparateBroken",
        coordinate: CEMETERY_ROAD_GATE_COORDINATE,
        rotationY: roadGateRotation,
      }),
    ]));
    expect(
      UNDEAD_CEMETERY_DRESSING.filter(({ id }) => id.startsWith("cemetery-road-gate")),
    ).toHaveLength(3);
    expect(roadGateRotation).toBeGreaterThan(0);
    expect(roadGateRotation).toBeLessThan(Math.PI / 2);
    expect(UNDEAD_CEMETERY_DRESSING.every(({ asset }) => halloweenAssetKeys.has(asset)))
      .toBe(true);
    expect(new Set(UNDEAD_CEMETERY_DRESSING.map(({ id }) => id)).size)
      .toBe(UNDEAD_CEMETERY_DRESSING.length);
    expect(UNDEAD_HALF_OPEN_GATE_NODE_ROTATIONS.arch_gate_left).toBeGreaterThan(0);
    expect(UNDEAD_HALF_OPEN_GATE_NODE_ROTATIONS.arch_gate_right).toBeLessThan(0);
    expect(undeadFortificationRotation("wall-gate")).toBe(0);
    expect(undeadFortificationRotation("wall-corner")).toBe(0);
    expect(undeadFortificationRotation("wall-straight")).toBeCloseTo(Math.PI / 2);
    expect(undeadStructureRotation("blacksmith", Math.PI + Math.PI / 3))
      .toBeCloseTo(Math.PI / 6);
    expect(UNDEAD_CASTLE_COURTYARD_DRESSING.every(({ asset, coordinate }) => (
      asset === "fencePillar"
      && coordinate.q >= 2
      && coordinate.r <= -7
    ))).toBe(true);
    expect(UNDEAD_CASTLE_EDGE_DRESSING).toEqual([
      expect.objectContaining({
        id: "undead-castle-edge-orange-pine",
        asset: "treePineOrangeLarge",
        coordinate: BATTLEFIELD_CRIMSON_FOREST_REFERENCE_COORDINATE,
        offset: [0, 0],
        scale: 1.04,
      }),
    ]);
    expect(UNDEAD_CASTLE_TERRAIN_REPLACEMENTS).toHaveLength(2);
    expect(UNDEAD_CASTLE_TERRAIN_REPLACEMENTS.every(({ asset, scale }) => (
      asset === "shrine" && scale === 1.18
    ))).toBe(true);
    expect(UNDEAD_CASTLE_TERRAIN_REPLACEMENTS.map(({ coordinate }) => coordinate))
      .toEqual(BATTLEFIELD_CASTLE_ROCK_COORDINATES.filter(({ r }) => r < 0));
    expect(UNDEAD_CEMETERY_DRESSING.every(({ coordinate }) => (
      coordinate.q <= 1 && coordinate.r <= -2
    ))).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.every(({ coordinate }) => (
      BATTLEFIELD_MAP.cells.some(({ q, r }) => q === coordinate.q && r === coordinate.r)
    ))).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.every(({ coordinate }) => (
      Math.abs(2 * coordinate.q + coordinate.r) > 2
    ))).toBe(true);
    expect(UNDEAD_CEMETERY_DRESSING.every(({ coordinate }) => (
      coordinate.q !== BATTLEFIELD_LEFT_FARM_PASSAGE_COORDINATE.q
      || coordinate.r !== BATTLEFIELD_LEFT_FARM_PASSAGE_COORDINATE.r
    ))).toBe(true);
    const roadKeys = new Set(plan
      .filter(({ assetKey }) => assetKey.startsWith("road-"))
      .map(({ cell }) => coordinateKey(cell)));
    expect(UNDEAD_CEMETERY_DRESSING
      .filter(({ coordinate }) => roadKeys.has(coordinateKey(coordinate)))
      .map(({ id }) => id)).toEqual([]);
    expect(UNDEAD_MINE_DRESSING).toHaveLength(3);
    expect(UNDEAD_MINE_DRESSING.every(({ asset, coordinate }) => (
      asset === "cursedCrystal"
      && coordinate.q >= 5
      && coordinate.q <= 7
      && coordinate.r >= -7
      && coordinate.r <= -2
    ))).toBe(true);
    expect(UNDEAD_MINE_DRESSING
      .filter(({ coordinate }) => roadKeys.has(coordinateKey(coordinate)))
      .map(({ id }) => id)).toEqual([]);
    expect(UNDEAD_RIVERBANK_DRESSING).toHaveLength(3);
    expect(UNDEAD_RIVERBANK_DRESSING.every(({ asset, coordinate }) => (
      asset.startsWith("pumpkin")
      && coordinate.q === 3
      && coordinate.r === -2
    ))).toBe(true);
    expect(UNDEAD_RIVERBANK_DRESSING.map(({ asset }) => asset)).toEqual([
      "pumpkinYellowJack",
      "pumpkinOrangeSmall",
      "pumpkinYellowSmall",
    ]);
    expect(UNDEAD_RIVERBANK_DRESSING.map(({ scale }) => scale)).toEqual([
      0.13,
      0.2,
      0.175,
    ]);
    expect(UNDEAD_SHIPWRECK_DRESSING).toMatchObject({
      asset: "shipwreck",
      coordinate: { q: -5, r: 0 },
      scale: [3, 6.1, 2.5],
      heightOffset: 2,
    });
  });

  it("removes human settlement scenery from the undead half only", () => {
    const humanSettlementKinds = new Set([
      "farm-cargo-wagon",
      "farm-dirt",
      "farm-grain",
      "farm-home-a",
      "farm-home-b",
      "farm-watermill",
      "farm-windmill",
      "tent",
      "village-farm",
      "village-house",
      "village-market",
      "wheelbarrow",
    ]);
    const undeadHumanScenery = BATTLEFIELD_SCENERY.filter((item) => (
      item.coordinate.r <= -2 && humanSettlementKinds.has(item.kind)
    ));
    const humanSideScenery = BATTLEFIELD_SCENERY.filter((item) => (
      item.coordinate.r >= 2 && humanSettlementKinds.has(item.kind)
    ));

    expect(undeadHumanScenery.length).toBeGreaterThan(0);
    expect(undeadHumanScenery.every((item) => !sceneryVisibleForMode(item, true))).toBe(true);
    const cemeteryScenery = BATTLEFIELD_SCENERY.filter((item) => (
      item.coordinate.r <= -2 && item.coordinate.q <= 1
    ));
    expect(cemeteryScenery.length).toBeGreaterThan(0);
    expect(cemeteryScenery.every((item) => !sceneryVisibleForMode(item, true))).toBe(true);
    expect(humanSideScenery.length).toBeGreaterThan(0);
    expect(humanSideScenery.every((item) => sceneryVisibleForMode(item, true))).toBe(true);
    expect(BATTLEFIELD_SCENERY.filter((item) => (
      item.coordinate.r < 0 && item.kind === "castle-rock"
    )).every((item) => !sceneryVisibleForMode(item, true))).toBe(true);
    expect(BATTLEFIELD_SCENERY.filter((item) => (
      item.coordinate.r > 0 && item.kind === "castle-rock"
    )).every((item) => sceneryVisibleForMode(item, true))).toBe(true);
  });
});
