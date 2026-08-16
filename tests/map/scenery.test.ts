import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_STRUCTURES,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";
import {
  battlefieldCombatZoneAt,
  battlefieldOuterFlankAt,
} from "../../src/map/battlefieldLayout";

describe("battlefield scenery layout", () => {
  it("covers every forest cell with an official pre-assembled grove", () => {
    const forestCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.surface === "forest");
    const groveKinds = new Set(["grove-a", "grove-b", "hill-grove"]);

    for (const cell of forestCells) {
      const scenery = BATTLEFIELD_SCENERY.filter((item) => (
        item.coordinate.q === cell.q && item.coordinate.r === cell.r
      ));
      expect(scenery.filter((item) => groveKinds.has(item.kind))).toHaveLength(1);
    }
    expect(BATTLEFIELD_SCENERY.some((item) => item.kind === "hill-grove")).toBe(true);
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

  it("moves the two farms away from the castle frontage and all major structures", () => {
    const structureKeys = new Set(BATTLEFIELD_STRUCTURES.flatMap((structure) => (
      structure.footprint.map(({ q, r }) => `${q},${r}`)
    )));

    for (const faction of ["verdant", "crimson"] as const) {
      const mirror = faction === "verdant" ? 1 : -1;
      const farms = BATTLEFIELD_SCENERY.filter((item) => (
        item.zone === `${faction}-camp`
        && (item.kind === "farm-dirt" || item.kind === "farm-grain")
      ));
      expect(farms.map(({ coordinate }) => coordinate)).toEqual([
        { q: 1 * mirror, r: 7 * mirror },
        { q: 2 * mirror, r: 7 * mirror },
      ]);
      expect(farms.every((farm) => !structureKeys.has(
        `${farm.coordinate.q},${farm.coordinate.r}`,
      ))).toBe(true);
      expect(farms.every((farm) => !BATTLEFIELD_SCENERY.some((item) => (
        item.zone !== `${faction}-camp`
        && item.coordinate.q === farm.coordinate.q
        && item.coordinate.r === farm.coordinate.r
      )))).toBe(true);
    }
  });

  it("turns the oversized outer flanks into dense, non-deployable scenery", () => {
    const blockingKeys = new Set(BATTLEFIELD_SCENERY
      .filter((item) => BLOCKING_SCENERY_KINDS.has(item.kind))
      .map((item) => `${item.coordinate.q},${item.coordinate.r}`));
    const outerFlanks = BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.territory !== null
      && battlefieldOuterFlankAt(cell.q, cell.r)
    ));

    expect(outerFlanks.length).toBeGreaterThan(100);
    expect(outerFlanks.every((cell) => !cell.walkable)).toBe(true);
    expect(outerFlanks.every((cell) => !cell.buildable)).toBe(true);
    expect(outerFlanks.every((cell) => blockingKeys.has(`${cell.q},${cell.r}`))).toBe(true);

    const outerKinds = new Set(BATTLEFIELD_SCENERY
      .filter((item) => outerFlanks.some((cell) => (
        cell.q === item.coordinate.q && cell.r === item.coordinate.r
      )))
      .map((item) => item.kind));
    for (const kind of [
      "tree",
      "stone",
      "village-house",
      "village-market",
      "village-farm",
    ] as const) {
      expect(outerKinds.has(kind), `outer flanks should include ${kind}`).toBe(true);
    }

    for (const faction of ["verdant", "crimson"] as const) {
      const buildable = BATTLEFIELD_MAP.cells.filter((cell) => (
        cell.territory === faction && cell.buildable
      ));
      expect(buildable.length).toBeGreaterThanOrEqual(8);
      expect(buildable.length).toBeLessThanOrEqual(45);
      expect(buildable.every((cell) => battlefieldCombatZoneAt(cell.q, cell.r))).toBe(true);
    }
  });
});
