import { describe, expect, it } from "vitest";

import { axialToWorld, coordinateKey, hexDistance } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BATTLE_STRUCTURES,
  SANDBOX_LARGE_CASTLE_FORTIFICATIONS,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_NEUTRAL_ENCOUNTERS,
  SANDBOX_LARGE_OASIS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_VISUAL_ROAD_CELLS,
} from "../../src/map/sandboxLargeBattlefield";
import {
  SANDBOX_LARGE_DRESSING_SCENERY,
  SANDBOX_LARGE_WILDLIFE,
} from "../../src/map/sandboxLargeDressing";
import {
  SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO,
  SANDBOX_LARGE_ENVIRONMENT_COVERAGE_TARGET,
  SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT,
  SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY,
  SANDBOX_LARGE_MINE_SHAFT_SCENERY,
  SANDBOX_LARGE_SCENERY,
} from "../../src/map/sandboxLargeScenery";

describe("sandbox large scenery", () => {
  it("reuses the legacy mine ridge assets across all eight bilateral mine districts", () => {
    const districtKeys = new Set(SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => (
      district.cells.map(coordinateKey)
    )));
    const mineScenery = SANDBOX_LARGE_SCENERY.filter(({ id }) => id.includes("-ridge-")
      || id.includes("-ore-"));
    const ridgeScenery = mineScenery.filter(({ kind }) => kind !== "iron");
    const shaftKeys = new Set(SANDBOX_LARGE_MINE_SHAFT_SCENERY.map(({ coordinate }) => (
      coordinateKey(coordinate)
    )));
    const visibleRidgeKeys = new Set([...districtKeys].filter((key) => !shaftKeys.has(key)));

    expect(mineScenery).toHaveLength(94);
    expect(ridgeScenery).toHaveLength(62);
    expect(new Set(ridgeScenery.map(({ coordinate }) => coordinateKey(coordinate))))
      .toEqual(visibleRidgeKeys);
    expect(new Set(ridgeScenery.map(({ kind }) => kind))).toEqual(new Set([
      "mine-mountain-a",
      "mine-mountain-b",
      "mine-mountain-c",
      "mine-rock-c",
      "mine-rock-e",
    ]));
    expect(new Set(mineScenery.map(({ zone }) => zone)))
      .toEqual(new Set(["left-mine", "right-mine"]));
  });

  it("keeps metadata frozen while neutral pits remain factionless", () => {
    const controllerByPit = new Map(SANDBOX_LARGE_MINE_PITS.map((pit) => (
      [pit.id, pit.initialController] as const
    )));

    expect(Object.isFrozen(SANDBOX_LARGE_SCENERY)).toBe(true);
    const mineScenery = SANDBOX_LARGE_SCENERY.filter(({ id }) => id.includes("-ridge-")
      || id.includes("-ore-"));
    expect(mineScenery.every((item) => (
      Object.isFrozen(item)
      && Object.isFrozen(item.coordinate)
      && Object.isFrozen(item.offset)
      && item.faction === (controllerByPit.get(item.id.slice(8, 11)) ?? undefined)
    ))).toBe(true);
    expect(mineScenery.filter((item) => item.id.startsWith("sandbox-N-"))
      .every((item) => item.faction === undefined)).toBe(true);
  });

  it("places each mine entrance one clear hex above with its mouth facing down", () => {
    const shafts = SANDBOX_LARGE_MINE_SHAFT_SCENERY;
    const rockAccents = SANDBOX_LARGE_SCENERY.filter(({ id }) => (
      id.includes("-rock-accent-")
    ));
    const roadKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
    const mapKeys = new Set(SANDBOX_LARGE_BATTLEFIELD_MAP.cells.map(coordinateKey));
    const dressingKeys = new Set(SANDBOX_LARGE_DRESSING_SCENERY.map(({ coordinate }) => (
      coordinateKey(coordinate)
    )));
    const buildKeys = new Set(Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flatMap((anchors) => (
      anchors.map(({ coordinate }) => coordinateKey(coordinate))
    )));
    const entranceKeys = new Set(SANDBOX_LARGE_MINE_PITS.flatMap(({ entrances }) => (
      entrances.map(coordinateKey)
    )));
    const ridgeKeys = new Set(SANDBOX_LARGE_SCENERY.filter(({ id }) => (
      id.includes("-ridge-")
    )).map(({ coordinate }) => coordinateKey(coordinate)));

    expect(shafts).toHaveLength(8);
    expect(rockAccents).toHaveLength(24);
    for (const pit of SANDBOX_LARGE_MINE_PITS) {
      const shaft = shafts.find(({ id }) => id.startsWith(`sandbox-${pit.id}-`));
      const accents = rockAccents.filter(({ id }) => id.startsWith(`sandbox-${pit.id}-`));
      const district = SANDBOX_LARGE_MINE_DISTRICTS.find(({ pitId }) => pitId === pit.id)!;
      const shaftWorld = axialToWorld(shaft!.coordinate);
      const pitWorld = axialToWorld(pit.coordinate);
      const expectedRotation = Math.atan2(
        pitWorld.x - shaftWorld.x,
        pitWorld.z - shaftWorld.z,
      );

      expect(shaft).toBeDefined();
      expect(shaft!.coordinate.r).toBe(pit.coordinate.r - 1);
      expect(hexDistance(shaft!.coordinate, pit.coordinate)).toBe(1);
      expect(Math.abs(shaftWorld.x - pitWorld.x)).toBeLessThanOrEqual(1);
      expect(Math.hypot(shaft!.offset.x, shaft!.offset.z)).toBeCloseTo(0.14);
      expect(shaft!.rotationY).toBeCloseTo(expectedRotation);
      expect(mapKeys.has(coordinateKey(shaft!.coordinate))).toBe(true);
      expect(roadKeys.has(coordinateKey(shaft!.coordinate))).toBe(false);
      expect(buildKeys.has(coordinateKey(shaft!.coordinate))).toBe(false);
      expect(dressingKeys.has(coordinateKey(shaft!.coordinate))).toBe(false);
      expect(entranceKeys.has(coordinateKey(shaft!.coordinate))).toBe(false);
      expect(ridgeKeys.has(coordinateKey(shaft!.coordinate))).toBe(false);
      expect(accents).toHaveLength(3);
      expect(accents.every(({ coordinate, kind }) => (
        district.cells.some((cell) => coordinateKey(cell) === coordinateKey(coordinate))
        && (kind === "mine-rock-c" || kind === "mine-rock-e")
      ))).toBe(true);
    }
  });

  it("covers at least half of every map zone with readable environment art", () => {
    const coveredKeys = new Set([
      ...SANDBOX_LARGE_VISUAL_ROAD_CELLS.map(coordinateKey),
      ...SANDBOX_LARGE_SCENERY.map(({ coordinate }) => coordinateKey(coordinate)),
      ...SANDBOX_LARGE_BATTLE_STRUCTURES.flatMap(({ footprint }) => (
        footprint.map(coordinateKey)
      )),
      ...SANDBOX_LARGE_CASTLE_FORTIFICATIONS.flatMap(({ footprint }) => (
        footprint.map(coordinateKey)
      )),
      ...SANDBOX_LARGE_MINE_PITS.map(({ coordinate }) => coordinateKey(coordinate)),
      coordinateKey(SANDBOX_LARGE_OASIS.coordinate),
      ...SANDBOX_LARGE_WILDLIFE.map(({ coordinate }) => coordinateKey(coordinate)),
    ]);

    expect(SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO).toBe(0.5);
    expect(SANDBOX_LARGE_ENVIRONMENT_COVERAGE_TARGET).toBe(436);
    expect(SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT).toBe(491);
    expect(coveredKeys.size).toBe(SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT);
    expect(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY).toHaveLength(84);
    expect(SANDBOX_LARGE_SCENERY).toHaveLength(499);

    for (const zoneId of ["verdant-base", "neutral", "crimson-base"]) {
      const zoneCells = SANDBOX_LARGE_BATTLEFIELD_MAP.cells.filter((cell) => (
        cell.zoneId === zoneId
      ));
      const coveredCount = zoneCells.filter((cell) => (
        coveredKeys.has(coordinateKey(cell))
      )).length;
      expect(coveredCount / zoneCells.length, `${zoneId} should reach 50% coverage`)
        .toBeGreaterThanOrEqual(SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO);
    }
  });

  it("keeps environment fill outside routes, build anchors, and neutral arenas", () => {
    const mapKeys = new Set(SANDBOX_LARGE_BATTLEFIELD_MAP.cells.map(coordinateKey));
    const forbiddenKeys = new Set([
      ...SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey),
      ...Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flatMap((anchors) => (
        anchors.map(({ coordinate }) => coordinateKey(coordinate))
      )),
      ...SANDBOX_LARGE_MINE_DISTRICTS.flatMap(({ cells }) => cells.map(coordinateKey)),
      ...SANDBOX_LARGE_MINE_PITS.map(({ coordinate }) => coordinateKey(coordinate)),
      ...SANDBOX_LARGE_BATTLE_STRUCTURES.flatMap(({ footprint }) => footprint.map(coordinateKey)),
      ...SANDBOX_LARGE_CASTLE_FORTIFICATIONS.flatMap(({ footprint }) => (
        footprint.map(coordinateKey)
      )),
    ]);

    expect(new Set(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.map(({ id }) => id)).size)
      .toBe(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.length);
    expect(new Set(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.map(({ coordinate }) => (
      coordinateKey(coordinate)
    ))).size).toBe(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.length);
    expect(new Set(SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.map(({ kind }) => kind)))
      .toEqual(new Set(["bush", "tree", "grove-a", "grove-b", "rock-hills"]));

    for (const item of SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY) {
      const key = coordinateKey(item.coordinate);
      expect(mapKeys.has(key), `${key} should remain on the map`).toBe(true);
      expect(forbiddenKeys.has(key), `${key} should preserve interaction space`).toBe(false);
      expect(SANDBOX_LARGE_NEUTRAL_ENCOUNTERS.every((encounter) => (
        hexDistance(item.coordinate, encounter.anchor) > encounter.guardRadiusCells
      )), `${key} should stay outside neutral guard arenas`).toBe(true);
      expect(Object.isFrozen(item)).toBe(true);
      expect(Object.isFrozen(item.coordinate)).toBe(true);
      expect(Object.isFrozen(item.offset)).toBe(true);
    }
  });
});
