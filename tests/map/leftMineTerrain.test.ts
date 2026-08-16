import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";
import {
  battlefieldCoordinates,
  battlefieldLeftMineAt,
} from "../../src/map/battlefieldLayout";
import { SCENERY_SCENE_ASSETS } from "../../src/scene/assets";

const LEFT_MINE_COORDINATES = [-7, -6, -5].flatMap((q) => (
  [2, 3, 4, 5, 6, 7].map((r) => ({ q, r }))
)).filter(({ q, r }) => r !== 7 || (q !== -7 && q !== -6));

const LEFT_MINE_SCENERY_KINDS = new Set([
  "mine-mountain-a",
  "mine-mountain-b",
  "mine-mountain-c",
  "mine-rock-c",
  "mine-rock-e",
]);

describe("left mine terrain", () => {
  it("removes the two westernmost columns from the battlefield island", () => {
    const coordinates = battlefieldCoordinates();

    expect(coordinates).toHaveLength(250);
    expect(coordinates.some(([q]) => q === -9 || q === -8)).toBe(false);
    expect(BATTLEFIELD_MAP.cells.some(({ q }) => q === -9 || q === -8)).toBe(false);
    expect(Math.min(...BATTLEFIELD_MAP.cells.map(({ q }) => q))).toBe(-7);
  });

  it("turns the remaining left flank into a blocked rock field around the mine clearing", () => {
    const mineCells = BATTLEFIELD_MAP.cells.filter(({ q, r }) => battlefieldLeftMineAt(q, r));

    expect(mineCells.map(({ q, r }) => ({ q, r }))).toEqual(LEFT_MINE_COORDINATES);
    expect(mineCells.every((cell) => (
      cell.surface === "rock" && !cell.walkable && !cell.buildable
    ))).toBe(true);
    expect(getBattlefieldCell({ q: -4, r: 4 })?.surface).not.toBe("rock");
    expect(getBattlefieldCell({ q: -7, r: 8 })?.surface).not.toBe("rock");
  });

  it("fills every left-mine cell with blocking KayKit cliff or boulder scenery", () => {
    const mineScenery = BATTLEFIELD_SCENERY.filter(({ zone }) => zone === "left-mine");
    const mineCoordinateKeys = new Set(
      LEFT_MINE_COORDINATES.map(({ q, r }) => `${q},${r}`),
    );

    expect(new Set(mineScenery.map(({ coordinate }) => (
      `${coordinate.q},${coordinate.r}`
    )))).toEqual(mineCoordinateKeys);
    expect(mineScenery.every(({ kind }) => BLOCKING_SCENERY_KINDS.has(kind))).toBe(true);
    for (const coordinate of LEFT_MINE_COORDINATES) {
      const scenery = mineScenery.filter((item) => (
        item.coordinate.q === coordinate.q && item.coordinate.r === coordinate.r
      ));
      expect(scenery.some(({ kind }) => LEFT_MINE_SCENERY_KINDS.has(kind))).toBe(true);
    }
    expect(mineScenery.some(({ kind }) => kind.startsWith("mine-mountain-"))).toBe(true);
    expect(mineScenery.some(({ kind }) => kind.startsWith("mine-rock-"))).toBe(true);
    expect(mineScenery.some(({ kind }) => kind === "iron")).toBe(true);
  });

  it("maps the mine ridge to the purchased unpainted KayKit rock set", () => {
    expect(SCENERY_SCENE_ASSETS["mine-mountain-a"].url)
      .toBe("/assets/kaykit/medieval-hex/decoration/nature/mountain_A.gltf");
    expect(SCENERY_SCENE_ASSETS["mine-mountain-b"].url)
      .toBe("/assets/kaykit/medieval-hex/decoration/nature/mountain_B.gltf");
    expect(SCENERY_SCENE_ASSETS["mine-mountain-c"].url)
      .toBe("/assets/kaykit/medieval-hex/decoration/nature/mountain_C.gltf");
    expect(SCENERY_SCENE_ASSETS["mine-rock-c"].url)
      .toBe("/assets/kaykit/medieval-hex/decoration/nature/rock_single_C.gltf");
    expect(SCENERY_SCENE_ASSETS["mine-rock-e"].url)
      .toBe("/assets/kaykit/medieval-hex/decoration/nature/rock_single_E.gltf");
  });
});
