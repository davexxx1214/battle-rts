import { describe, expect, it } from "vitest";

import { findHexPath } from "../../src/game/navigation";
import {
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_MAP,
  BATTLEFIELD_STRUCTURES,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";

const VERDANT_MATCHED_FORESTS = [
  { q: -6, r: 8 },
] as const;
const VERDANT_FLANK_BLACKSMITH = { q: -7, r: 8 } as const;
const VERDANT_MINE_COORDINATES = [
  { q: -7, r: 7 },
  { q: -6, r: 7 },
] as const;
const CRIMSON_MINE_COORDINATES = [
  { q: 6, r: -7 },
  { q: 7, r: -7 },
] as const;
const CRIMSON_MATCHED_FORESTS = [
  { q: 6, r: -8 },
] as const;
const CRIMSON_FLANK_BLACKSMITH = { q: 7, r: -8 } as const;
const VERDANT_FOREST_REFERENCE = { q: -7, r: 9 } as const;
const CRIMSON_FOREST_REFERENCE = { q: 7, r: -9 } as const;

function normalizedSceneryAt(coordinate: { q: number; r: number }) {
  return BATTLEFIELD_SCENERY.filter((item) => (
    item.coordinate.q === coordinate.q && item.coordinate.r === coordinate.r
  )).map(({ kind, offset, rotationY, scale }) => ({
    kind,
    offset,
    rotationY,
    scale,
  })).sort((left, right) => left.kind.localeCompare(right.kind));
}

describe("mirrored camp revisions", () => {
  it("keeps the old barracks removed and replaces their forests with blacksmiths", () => {
    const verdantBarracks = BATTLEFIELD_STRUCTURES.find((structure) => (
      structure.faction === "verdant" && structure.kind === "barracks"
    ));
    const crimsonBarracks = BATTLEFIELD_STRUCTURES.find((structure) => (
      structure.faction === "crimson" && structure.kind === "barracks"
    ));
    expect(verdantBarracks).toBeUndefined();
    expect(crimsonBarracks).toBeUndefined();
    for (const [coordinate, faction] of [
      [VERDANT_FLANK_BLACKSMITH, "verdant"],
      [CRIMSON_FLANK_BLACKSMITH, "crimson"],
    ] as const) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        surface: "grass",
        walkable: false,
        buildable: false,
      });
      expect(BATTLEFIELD_STRUCTURES).toContainEqual(expect.objectContaining({
        id: `${faction}-flank-blacksmith`,
        kind: "blacksmith",
        faction,
        coordinate,
      }));
      expect(normalizedSceneryAt(coordinate)).toEqual([]);
    }
  });

  it("places two mirrored mines in each cleared rock ridge", () => {
    const verdantMines = BATTLEFIELD_STRUCTURES.filter((structure) => (
      structure.faction === "verdant" && structure.kind === "mine"
    )).sort((left, right) => left.coordinate.q - right.coordinate.q);
    const crimsonMines = BATTLEFIELD_STRUCTURES.filter((structure) => (
      structure.faction === "crimson" && structure.kind === "mine"
    )).sort((left, right) => left.coordinate.q - right.coordinate.q);

    expect(verdantMines.map(({ coordinate }) => coordinate))
      .toEqual(VERDANT_MINE_COORDINATES);
    expect(verdantMines.map(({ footprint }) => footprint))
      .toEqual(VERDANT_MINE_COORDINATES.map((coordinate) => [coordinate]));
    expect(crimsonMines.map(({ coordinate }) => coordinate)).toEqual(CRIMSON_MINE_COORDINATES);
    for (const coordinate of [...VERDANT_MINE_COORDINATES, ...CRIMSON_MINE_COORDINATES]) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        surface: "grass",
        walkable: false,
        buildable: false,
      });
      expect(BATTLEFIELD_SCENERY.some((item) => (
        item.coordinate.q === coordinate.q && item.coordinate.r === coordinate.r
      ))).toBe(false);
    }
  });

  it("matches both requested forest tiles to the dense forest below", () => {
    for (const coordinate of VERDANT_MATCHED_FORESTS) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        surface: "forest",
        walkable: false,
        buildable: false,
      });
      expect(normalizedSceneryAt(coordinate))
        .toEqual(normalizedSceneryAt(VERDANT_FOREST_REFERENCE));
      expect(normalizedSceneryAt(coordinate))
        .not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "hill-grove" })]));
    }
    for (const coordinate of CRIMSON_MATCHED_FORESTS) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        surface: "forest",
        walkable: false,
        buildable: false,
      });
      expect(normalizedSceneryAt(coordinate))
        .toEqual(normalizedSceneryAt(CRIMSON_FOREST_REFERENCE));
    }
  });

  it("removes the old mine cart and ore props from both sides", () => {
    expect(BATTLEFIELD_DECORATIONS).toEqual([]);
  });

  it("keeps both main attack routes connected after the camp revision", () => {
    for (const [start, goal] of [
      [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.castleApproaches.crimson],
      [BATTLEFIELD_MAP.crimsonCamp, BATTLEFIELD_MAP.castleApproaches.verdant],
    ] as const) {
      const path = findHexPath(BATTLEFIELD_MAP, start, goal);
      expect(path.length).toBeGreaterThan(1);
      expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
    }
  });
});
