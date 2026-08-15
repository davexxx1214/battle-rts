import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";

describe("battlefield scenery layout", () => {
  it("covers every forest cell with a layered tree cluster", () => {
    const forestCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.surface === "forest");

    for (const cell of forestCells) {
      const scenery = BATTLEFIELD_SCENERY.filter((item) => (
        item.coordinate.q === cell.q && item.coordinate.r === cell.r
      ));
      expect(scenery.filter((item) => item.kind === "tree")).toHaveLength(2);
    }
    expect(BATTLEFIELD_SCENERY.filter((item) => item.kind === "bush").length)
      .toBeGreaterThanOrEqual(Math.floor(forestCells.length / 2));
  });

  it("replaces every procedural rock cell with KayKit stone and iron details", () => {
    const rockCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.surface === "rock");

    for (const cell of rockCells) {
      const kinds = BATTLEFIELD_SCENERY
        .filter((item) => item.coordinate.q === cell.q && item.coordinate.r === cell.r)
        .map((item) => item.kind);
      expect(kinds).toContain("stone");
      expect(kinds).toContain("iron");
    }
  });

  it("keeps scenery deterministic, on-map, and blocks solid props", () => {
    expect(new Set(BATTLEFIELD_SCENERY.map((item) => item.id)).size)
      .toBe(BATTLEFIELD_SCENERY.length);
    for (const item of BATTLEFIELD_SCENERY) {
      const cell = getBattlefieldCell(item.coordinate);
      expect(cell, `${item.id} is outside the battlefield`).toBeDefined();
      expect(cell?.surface, `${item.id} is placed in water`).not.toBe("water");
      expect(cell?.surface, `${item.id} obstructs the bridge`).not.toBe("bridge");
      if (BLOCKING_SCENERY_KINDS.has(item.kind)) {
        expect(cell?.walkable, `${item.id} must block navigation`).toBe(false);
      }
    }
  });

  it("mirrors the camp scenery around both factions", () => {
    const blue = BATTLEFIELD_SCENERY.filter((item) => item.zone === "verdant-camp");
    const red = BATTLEFIELD_SCENERY.filter((item) => item.zone === "crimson-camp");

    expect(blue).toHaveLength(red.length);
    expect(red.map((item) => ({
      kind: item.kind,
      q: -item.coordinate.q,
      r: -item.coordinate.r,
    }))).toEqual(blue.map((item) => ({
      kind: item.kind,
      q: item.coordinate.q,
      r: item.coordinate.r,
    })));
  });
});
