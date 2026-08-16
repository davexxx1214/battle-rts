import { describe, expect, it } from "vitest";

import { findHexPath } from "../../src/game/navigation";
import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_STRUCTURES,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";

const CASTLE_FOREST_COORDINATES = [
  { q: -6, r: 8 },
  { q: -7, r: 9 },
  { q: 6, r: -8 },
  { q: 7, r: -9 },
] as const;

const FLANK_BLACKSMITH_COORDINATES = [
  { q: -7, r: 8, faction: "verdant" },
  { q: 7, r: -8, faction: "crimson" },
] as const;

describe("castle forest barrier", () => {
  it("keeps the mirrored forest cells beyond both mine clearings blocked", () => {
    for (const coordinate of CASTLE_FOREST_COORDINATES) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        territory: coordinate.r > 0 ? "verdant" : "crimson",
        surface: "forest",
        walkable: false,
        buildable: false,
      });
    }
  });

  it("places one KayKit grove on every remaining castle forest cell", () => {
    const groveKinds = new Set(["grove-a", "grove-b", "hill-grove"]);

    for (const coordinate of CASTLE_FOREST_COORDINATES) {
      const groves = BATTLEFIELD_SCENERY.filter((item) => (
        item.coordinate.q === coordinate.q
        && item.coordinate.r === coordinate.r
        && groveKinds.has(item.kind)
      ));
      expect(groves).toHaveLength(1);
    }
  });

  it("replaces the outer matched forest with mirrored permanent blacksmiths", () => {
    for (const { q, r, faction } of FLANK_BLACKSMITH_COORDINATES) {
      expect(getBattlefieldCell({ q, r })).toMatchObject({
        territory: faction,
        surface: "grass",
        walkable: false,
        buildable: false,
      });
      expect(BATTLEFIELD_STRUCTURES).toContainEqual(expect.objectContaining({
        id: `${faction}-flank-blacksmith`,
        kind: "blacksmith",
        faction,
        coordinate: { q, r },
        footprint: [{ q, r }],
      }));
      expect(BATTLEFIELD_SCENERY.filter((item) => (
        item.coordinate.q === q && item.coordinate.r === r
      ))).toEqual([]);
    }
  });

  it("keeps both factions' main attack routes connected", () => {
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
});
