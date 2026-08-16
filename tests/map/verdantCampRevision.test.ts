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
  { q: -7, r: 8 },
  { q: -6, r: 8 },
] as const;
const VERDANT_BARRACKS_FOREST = VERDANT_MATCHED_FORESTS[0];
const VERDANT_MINE_COORDINATES = [
  { q: -7, r: 7 },
  { q: -6, r: 7 },
] as const;
const VERDANT_FOREST_REFERENCE = { q: -7, r: 9 } as const;

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

describe("verdant camp revision", () => {
  it("replaces only the verdant camp barracks with blocked forest", () => {
    const verdantBarracks = BATTLEFIELD_STRUCTURES.find((structure) => (
      structure.faction === "verdant" && structure.kind === "barracks"
    ));
    const crimsonBarracks = BATTLEFIELD_STRUCTURES.find((structure) => (
      structure.faction === "crimson" && structure.kind === "barracks"
    ));
    const groveKinds = new Set(["grove-a", "grove-b", "hill-grove"]);

    expect(verdantBarracks).toBeUndefined();
    expect(crimsonBarracks?.coordinate).toEqual({ q: 7, r: -8 });
    expect(getBattlefieldCell(VERDANT_BARRACKS_FOREST)).toMatchObject({
      surface: "forest",
      walkable: false,
      buildable: false,
    });
    expect(BATTLEFIELD_SCENERY.some((item) => (
      item.coordinate.q === VERDANT_BARRACKS_FOREST.q
      && item.coordinate.r === VERDANT_BARRACKS_FOREST.r
      && groveKinds.has(item.kind)
    ))).toBe(true);
  });

  it("adds a second verdant mine on the cleared rock cell beside the existing mine", () => {
    const verdantMines = BATTLEFIELD_STRUCTURES.filter((structure) => (
      structure.faction === "verdant" && structure.kind === "mine"
    )).sort((left, right) => left.coordinate.q - right.coordinate.q);
    const crimsonMine = BATTLEFIELD_STRUCTURES.find((structure) => (
      structure.faction === "crimson" && structure.kind === "mine"
    ));

    expect(verdantMines.map(({ coordinate }) => coordinate))
      .toEqual(VERDANT_MINE_COORDINATES);
    expect(verdantMines.map(({ footprint }) => footprint))
      .toEqual(VERDANT_MINE_COORDINATES.map((coordinate) => [coordinate]));
    expect(crimsonMine?.coordinate).toEqual({ q: 1, r: -8 });
    for (const coordinate of VERDANT_MINE_COORDINATES) {
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
  });

  it("removes the old verdant mine cart and ore props without changing crimson", () => {
    expect(BATTLEFIELD_DECORATIONS.filter(({ faction }) => faction === "verdant"))
      .toEqual([]);
    expect(BATTLEFIELD_DECORATIONS.filter(({ faction }) => faction === "crimson")
      .map(({ kind }) => kind))
      .toEqual(["mining-cart", "ore-pile"]);
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
