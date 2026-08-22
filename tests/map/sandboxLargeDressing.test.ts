import { describe, expect, it } from "vitest";

import { coordinateKey } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT,
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_ROAD_RESERVE,
} from "../../src/map/sandboxLargeBattlefield";
import {
  SANDBOX_LARGE_DRESSING_SCENERY,
  SANDBOX_LARGE_FARM_FIELD_CELLS,
  SANDBOX_LARGE_FOREST_BANK_CELLS,
  SANDBOX_LARGE_RIVER_CELLS,
  SANDBOX_LARGE_WILDLIFE,
} from "../../src/map/sandboxLargeDressing";

describe("sandbox large stage 10 dressing", () => {
  const mapKeys = new Set(SANDBOX_LARGE_BATTLEFIELD_MAP.cells.map(coordinateKey));
  const roadKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
  const mineDistrictKeys = new Set(SANDBOX_LARGE_MINE_DISTRICTS.flatMap(({ cells }) => (
    cells.map(coordinateKey)
  )));
  const minePitKeys = new Set(SANDBOX_LARGE_MINE_PITS.map(({ coordinate }) => (
    coordinateKey(coordinate)
  )));
  const buildKeys = new Set(Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flatMap((anchors) => (
    anchors.map(({ coordinate }) => coordinateKey(coordinate))
  )));

  it("adds mirrored KayKit farm belts outside roads, mines, and castle build anchors", () => {
    expect(SANDBOX_LARGE_FARM_FIELD_CELLS.verdant).toHaveLength(12);
    expect(SANDBOX_LARGE_FARM_FIELD_CELLS.crimson).toEqual(
      SANDBOX_LARGE_FARM_FIELD_CELLS.verdant.map(({ q, r }) => ({ q: -q, r: -r })),
    );
    for (const coordinate of Object.values(SANDBOX_LARGE_FARM_FIELD_CELLS).flat()) {
      const key = coordinateKey(coordinate);
      expect(mapKeys.has(key), `${key} should remain on the map`).toBe(true);
      expect(roadKeys.has(key), `${key} should stay off road reserve`).toBe(false);
      expect(mineDistrictKeys.has(key), `${key} should stay outside mine ridges`).toBe(false);
      expect(minePitKeys.has(key), `${key} should not cover a mine pit`).toBe(false);
      expect(buildKeys.has(key), `${key} should not consume a build anchor`).toBe(false);
    }
    expect(SANDBOX_LARGE_DRESSING_SCENERY.filter(({ zone }) => zone === "sandbox-farm"))
      .toHaveLength(30);
  });

  it("keeps the east river and forest art-only and outside the locked road reserve", () => {
    expect(SANDBOX_LARGE_RIVER_CELLS).toHaveLength(15);
    expect(SANDBOX_LARGE_FOREST_BANK_CELLS).toHaveLength(8);
    for (const coordinate of [
      ...SANDBOX_LARGE_RIVER_CELLS,
      ...SANDBOX_LARGE_FOREST_BANK_CELLS,
    ]) {
      const key = coordinateKey(coordinate);
      const cell = SANDBOX_LARGE_BATTLEFIELD_MAP.cells.find((candidate) => (
        coordinateKey(candidate) === key
      ));
      expect(cell, `${key} should remain on the map`).toBeDefined();
      expect(roadKeys.has(key), `${key} should stay off road reserve`).toBe(false);
      expect(mineDistrictKeys.has(key), `${key} should stay outside mine ridges`).toBe(false);
      expect(minePitKeys.has(key), `${key} should not cover a mine pit`).toBe(false);
      expect(cell?.blocker).toBe("none");
    }
    expect(SANDBOX_LARGE_DRESSING_SCENERY.filter(({ kind }) => kind === "shallow-water"))
      .toHaveLength(SANDBOX_LARGE_RIVER_CELLS.length);
    expect(SANDBOX_LARGE_DRESSING_SCENERY.filter(({ kind }) => kind === "river-bridge"))
      .toHaveLength(1);
  });

  it("adds animated wildlife without changing navigation or the map fingerprint", () => {
    expect(SANDBOX_LARGE_WILDLIFE).toHaveLength(5);
    expect(new Set(SANDBOX_LARGE_WILDLIFE.map(({ kind }) => kind)))
      .toEqual(new Set(["cow", "deer", "fox"]));
    expect(SANDBOX_LARGE_WILDLIFE.every(({ coordinate }) => (
      mapKeys.has(coordinateKey(coordinate))
    ))).toBe(true);
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.cells).toHaveLength(871);
    expect(SANDBOX_LARGE_ROAD_RESERVE).toHaveLength(331);
    expect(SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
  });

  it("freezes deterministic art metadata and keeps every id unique", () => {
    expect(SANDBOX_LARGE_DRESSING_SCENERY).toHaveLength(78);
    expect(new Set(SANDBOX_LARGE_DRESSING_SCENERY.map(({ id }) => id)).size)
      .toBe(SANDBOX_LARGE_DRESSING_SCENERY.length);
    expect(Object.isFrozen(SANDBOX_LARGE_DRESSING_SCENERY)).toBe(true);
    expect(SANDBOX_LARGE_DRESSING_SCENERY.every((item) => (
      Object.isFrozen(item)
      && Object.isFrozen(item.coordinate)
      && Object.isFrozen(item.offset)
    ))).toBe(true);
    expect(Object.isFrozen(SANDBOX_LARGE_WILDLIFE)).toBe(true);
  });
});
