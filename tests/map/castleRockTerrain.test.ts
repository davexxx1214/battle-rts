import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  coordinateKey,
  getBattlefieldCell,
  hexDistance,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";
import { SCENERY_SCENE_ASSETS } from "../../src/scene/assets";
import { createTerrainTilePlan } from "../../src/scene/terrain/tilePresentation";

const CASTLE_ROCK_COORDINATES = [
  { q: -6, r: 9 },
  { q: -2, r: 9 },
  { q: 6, r: -9 },
  { q: 2, r: -9 },
] as const;

const RESTORED_ADJACENT_COORDINATES = [
  { q: -5, r: 9 },
  { q: -3, r: 9 },
  { q: 5, r: -9 },
  { q: 3, r: -9 },
] as const;

describe("castle rock terrain", () => {
  it("turns both mirrored castle flanks into low light blocked grass", () => {
    const tilesByCoordinate = new Map(
      createTerrainTilePlan(BATTLEFIELD_MAP).map((tile) => [coordinateKey(tile.cell), tile]),
    );

    for (const coordinate of CASTLE_ROCK_COORDINATES) {
      const castle = coordinate.r > 0
        ? BATTLEFIELD_MAP.castles.verdant
        : BATTLEFIELD_MAP.castles.crimson;
      expect(hexDistance(coordinate, castle)).toBe(2);
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        height: 0,
        surface: "grass",
        walkable: false,
        buildable: false,
      });
      expect(tilesByCoordinate.get(coordinateKey(coordinate))).toMatchObject({
        renderHeight: 0,
        tint: "#edf6c8",
      });
    }
  });

  it("restores the cells touching each castle to their original camp terrain", () => {
    for (const coordinate of RESTORED_ADJACENT_COORDINATES) {
      const castle = coordinate.r > 0
        ? BATTLEFIELD_MAP.castles.verdant
        : BATTLEFIELD_MAP.castles.crimson;
      expect(hexDistance(coordinate, castle)).toBe(1);
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        height: 0.72,
        surface: "camp",
        walkable: true,
      });
    }
  });

  it("places one blocking KayKit grass-topped mountain on every flank", () => {
    const mountains = BATTLEFIELD_SCENERY.filter(({ kind }) => kind === "castle-rock");

    expect(mountains.map(({ coordinate }) => coordinate)).toEqual(CASTLE_ROCK_COORDINATES);
    expect(mountains.every(({ offset, scale }) => (
      offset.x === 0 && offset.z === 0 && scale === 1
    ))).toBe(true);
    expect(BLOCKING_SCENERY_KINDS.has("castle-rock")).toBe(true);
    expect(SCENERY_SCENE_ASSETS["castle-rock"]).toEqual({
      url: "/assets/kaykit/medieval-hex/decoration/nature/mountain_A_grass.gltf",
      scale: 1.08,
    });
  });
});
