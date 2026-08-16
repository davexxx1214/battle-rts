import { describe, expect, it } from "vitest";

import { findHexPath } from "../../src/game/navigation";
import {
  BATTLEFIELD_MAP,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";

const CASTLE_FOREST_COORDINATES = [
  { q: -5, r: 4 },
  { q: -5, r: 5 },
  { q: -5, r: 6 },
  { q: -5, r: 7 },
  { q: -6, r: 8 },
  { q: 5, r: -4 },
  { q: 5, r: -5 },
  { q: 5, r: -6 },
  { q: 5, r: -7 },
  { q: 6, r: -8 },
] as const;

describe("castle forest barrier", () => {
  it("turns the five marked cells and their enemy mirrors into blocked forest", () => {
    for (const coordinate of CASTLE_FOREST_COORDINATES) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        territory: coordinate.r > 0 ? "verdant" : "crimson",
        surface: "forest",
        walkable: false,
        buildable: false,
      });
    }
  });

  it("places one KayKit grove on every new forest cell", () => {
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
