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
  battlefieldRightFarmPassageAt,
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
    const rockCells = BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.surface === "rock"
      && !BATTLEFIELD_SCENERY.some((item) => (
        item.zone === "left-mine"
        && item.coordinate.q === cell.q
        && item.coordinate.r === cell.r
      ))
    ));

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
      if (item.kind === "bay-ship") {
        expect(cell?.surface, `${item.id} should stay in water`).toBe("water");
      } else {
        expect(cell?.surface, `${item.id} is placed in water`).not.toBe("water");
        expect(cell?.surface, `${item.id} obstructs the bridge`).not.toBe("bridge");
      }
      if (BLOCKING_SCENERY_KINDS.has(item.kind)) {
        expect(cell?.walkable, `${item.id} must block navigation`).toBe(false);
      }
    }
  });

  it("mirrors shared camp props while the expanded farm stays verdant-only", () => {
    const blue = BATTLEFIELD_SCENERY.filter((item) => item.zone === "verdant-camp");
    const red = BATTLEFIELD_SCENERY.filter((item) => (
      item.zone === "crimson-camp"
      && item.kind !== "farm-dirt"
      && item.kind !== "farm-grain"
      && item.id !== "crimson-field-bush"
    ));

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

  it("keeps the crimson camp farms away from all major structures", () => {
    const structureKeys = new Set(BATTLEFIELD_STRUCTURES.flatMap((structure) => (
      structure.footprint.map(({ q, r }) => `${q},${r}`)
    )));
    const verdantCampFarms = BATTLEFIELD_SCENERY.filter((item) => (
      item.zone === "verdant-camp"
      && (item.kind === "farm-dirt" || item.kind === "farm-grain")
    ));
    const crimsonCampFarms = BATTLEFIELD_SCENERY.filter((item) => (
      item.zone === "crimson-camp"
      && (item.kind === "farm-dirt" || item.kind === "farm-grain")
    ));

    expect(verdantCampFarms).toEqual([]);
    expect(crimsonCampFarms.map(({ coordinate }) => coordinate)).toEqual([
      { q: -1, r: -7 },
      { q: -2, r: -7 },
    ]);
    expect(crimsonCampFarms.every((farm) => !structureKeys.has(
      `${farm.coordinate.q},${farm.coordinate.r}`,
    ))).toBe(true);
  });

  it("turns the oversized outer flanks into dense, non-deployable scenery", () => {
    const blockingKeys = new Set(BATTLEFIELD_SCENERY
      .filter((item) => BLOCKING_SCENERY_KINDS.has(item.kind))
      .map((item) => `${item.coordinate.q},${item.coordinate.r}`));
    const structureKeys = new Set(BATTLEFIELD_STRUCTURES.flatMap((structure) => (
      structure.footprint.map(({ q, r }) => `${q},${r}`)
    )));
    const outerFlanks = BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.territory !== null
      && battlefieldOuterFlankAt(cell.q, cell.r)
    ));
    const blockingOuterFlanks = outerFlanks.filter((cell) => (
      !battlefieldRightFarmPassageAt(cell.q, cell.r)
    ));
    const passageOuterFlanks = outerFlanks.filter((cell) => (
      battlefieldRightFarmPassageAt(cell.q, cell.r)
    ));

    expect(outerFlanks.length).toBeGreaterThanOrEqual(88);
    expect(blockingOuterFlanks.every((cell) => !cell.walkable)).toBe(true);
    expect(blockingOuterFlanks.every((cell) => !cell.buildable)).toBe(true);
    expect(passageOuterFlanks).toHaveLength(1);
    expect(passageOuterFlanks.every((cell) => cell.walkable && cell.buildable)).toBe(true);
    expect(blockingOuterFlanks.every((cell) => {
      const key = `${cell.q},${cell.r}`;
      return blockingKeys.has(key) || structureKeys.has(key);
    })).toBe(true);

    const outerKinds = new Set(BATTLEFIELD_SCENERY
      .filter((item) => blockingOuterFlanks.some((cell) => (
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
      expect(buildable.every((cell) => (
        battlefieldCombatZoneAt(cell.q, cell.r)
        || battlefieldRightFarmPassageAt(cell.q, cell.r)
      ))).toBe(true);
    }
  });
});
