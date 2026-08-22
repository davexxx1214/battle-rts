import { describe, expect, it } from "vitest";

import { coordinateKey } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_MINE_PITS,
} from "../../src/map/sandboxLargeBattlefield";
import { SANDBOX_LARGE_SCENERY } from "../../src/map/sandboxLargeScenery";

describe("sandbox large scenery", () => {
  it("reuses the legacy mine ridge assets across all eight bilateral mine districts", () => {
    const districtKeys = new Set(SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => (
      district.cells.map(coordinateKey)
    )));
    const mineScenery = SANDBOX_LARGE_SCENERY.filter(({ id }) => id.includes("-ridge-")
      || id.includes("-ore-"));
    const ridgeScenery = mineScenery.filter(({ kind }) => kind !== "iron");

    expect(mineScenery).toHaveLength(96);
    expect(ridgeScenery).toHaveLength(64);
    expect(new Set(ridgeScenery.map(({ coordinate }) => coordinateKey(coordinate))))
      .toEqual(districtKeys);
    expect(new Set(ridgeScenery.map(({ kind }) => kind))).toEqual(new Set([
      "mine-mountain-a",
      "mine-mountain-b",
      "mine-mountain-c",
      "mine-rock-c",
      "mine-rock-e",
    ]));
    expect(new Set(mineScenery.map(({ zone }) => zone)))
      .toEqual(new Set(["left-mine", "right-mine"]));
  });

  it("keeps metadata frozen while neutral pits remain factionless", () => {
    const controllerByPit = new Map(SANDBOX_LARGE_MINE_PITS.map((pit) => (
      [pit.id, pit.initialController] as const
    )));

    expect(Object.isFrozen(SANDBOX_LARGE_SCENERY)).toBe(true);
    const mineScenery = SANDBOX_LARGE_SCENERY.filter(({ id }) => id.includes("-ridge-")
      || id.includes("-ore-"));
    expect(mineScenery.every((item) => (
      Object.isFrozen(item)
      && Object.isFrozen(item.coordinate)
      && Object.isFrozen(item.offset)
      && item.faction === (controllerByPit.get(item.id.slice(8, 11)) ?? undefined)
    ))).toBe(true);
    expect(mineScenery.filter((item) => item.id.startsWith("sandbox-N-"))
      .every((item) => item.faction === undefined)).toBe(true);
  });
});
