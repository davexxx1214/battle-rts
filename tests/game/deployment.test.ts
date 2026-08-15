import { describe, expect, it } from "vitest";

import {
  createBuildingOccupancy,
  hasBuildableHex,
  removeBuildingFromOccupancy,
  requestBuildingPlacement,
  type BuildingOccupancy,
} from "../../src/game/deployment";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  coordinateKey,
  type BattlefieldMap,
} from "../../src/map/battlefield";

function firstBuildable(faction: "verdant" | "crimson") {
  const cell = BATTLEFIELD_MAP.cells.find((candidate) => (
    candidate.territory === faction && candidate.buildable
  ));
  if (!cell) throw new Error(`Missing ${faction} buildable cell`);
  return cell;
}

describe("building deployment", () => {
  it("allows a complete empty hex only inside the requesting faction territory", () => {
    const verdantCell = firstBuildable("verdant");
    const crimsonCell = firstBuildable("crimson");
    const placed = requestBuildingPlacement(BATTLEFIELD_MAP, createBuildingOccupancy(), {
      buildingId: "mine-1",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(verdantCell),
    });
    const enemySide = requestBuildingPlacement(BATTLEFIELD_MAP, createBuildingOccupancy(), {
      buildingId: "mine-2",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(crimsonCell),
    });

    expect(placed).toMatchObject({
      ok: true,
      coordinate: { q: verdantCell.q, r: verdantCell.r },
    });
    expect(enemySide).toMatchObject({ ok: false, reason: "enemy-territory" });
  });

  it("rejects bridges, castle cells, occupied cells, and positions outside the map", () => {
    const cell = firstBuildable("verdant");
    const first = requestBuildingPlacement(BATTLEFIELD_MAP, createBuildingOccupancy(), {
      buildingId: "barracks-1",
      kind: "barracks",
      faction: "verdant",
      worldPosition: axialToWorld(cell),
    });
    if (!first.ok) throw new Error(first.reason);

    const occupied = requestBuildingPlacement(BATTLEFIELD_MAP, first.occupancy, {
      buildingId: "mine-occupied",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(cell),
    });
    const bridge = requestBuildingPlacement(BATTLEFIELD_MAP, first.occupancy, {
      buildingId: "mine-bridge",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(BATTLEFIELD_MAP.center),
    });
    const castle = requestBuildingPlacement(BATTLEFIELD_MAP, first.occupancy, {
      buildingId: "mine-castle",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(BATTLEFIELD_MAP.castles.verdant),
    });
    const outside = requestBuildingPlacement(BATTLEFIELD_MAP, first.occupancy, {
      buildingId: "mine-outside",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: { x: 999, z: 999 },
    });

    expect(occupied).toMatchObject({ ok: false, reason: "occupied-hex" });
    expect(bridge).toMatchObject({ ok: false, reason: "unbuildable-hex" });
    expect(castle).toMatchObject({ ok: false, reason: "unbuildable-hex" });
    expect(outside).toMatchObject({ ok: false, reason: "outside-battlefield" });
  });

  it("releases a building hex after the occupying building is removed", () => {
    const cell = firstBuildable("verdant");
    const first = requestBuildingPlacement(BATTLEFIELD_MAP, createBuildingOccupancy(), {
      buildingId: "mine-releasable",
      kind: "gold-mine",
      faction: "verdant",
      worldPosition: axialToWorld(cell),
    });
    if (!first.ok) throw new Error(first.reason);

    const released = removeBuildingFromOccupancy(first.occupancy, "mine-releasable");
    const second = requestBuildingPlacement(BATTLEFIELD_MAP, released, {
      buildingId: "barracks-after-mine",
      kind: "barracks",
      faction: "verdant",
      worldPosition: axialToWorld(cell),
    });

    expect(second.ok).toBe(true);
  });

  it("keeps a reserved route open after every successful placement", () => {
    let occupancy = createBuildingOccupancy();
    for (const cell of BATTLEFIELD_MAP.cells.filter((candidate) => (
      candidate.territory === "verdant" && candidate.buildable
    )).slice(0, 20)) {
      const result = requestBuildingPlacement(BATTLEFIELD_MAP, occupancy, {
        buildingId: `verdant-${coordinateKey(cell)}`,
        kind: "barracks",
        faction: "verdant",
        worldPosition: axialToWorld(cell),
      });
      expect(result.ok).toBe(true);
      if (result.ok) occupancy = result.occupancy;
    }
    expect(hasBuildableHex(BATTLEFIELD_MAP, "verdant", occupancy)).toBe(true);
  });

  it("returns no-buildable-hex when every valid cell is occupied", () => {
    const filled = Object.fromEntries(
      BATTLEFIELD_MAP.cells
        .filter((cell) => cell.territory === "verdant" && cell.buildable)
        .map((cell, index) => [
          coordinateKey(cell),
          {
            buildingId: `filled-${index}`,
            kind: "barracks" as const,
            faction: "verdant" as const,
            coordinate: { q: cell.q, r: cell.r },
          },
        ]),
    ) satisfies BuildingOccupancy;

    expect(hasBuildableHex(BATTLEFIELD_MAP, "verdant", filled)).toBe(false);
    expect(requestBuildingPlacement(BATTLEFIELD_MAP, filled, {
      buildingId: "no-room",
      kind: "barracks",
      faction: "verdant",
      worldPosition: axialToWorld(firstBuildable("verdant")),
    })).toMatchObject({ ok: false, reason: "no-buildable-hex" });
  });

  it("rejects a buildable chokepoint when another safe hex remains", () => {
    const map: BattlefieldMap = {
      cells: [
        {
          q: 0, r: 0, height: 0, surface: "camp", walkable: true,
          territory: "verdant", buildable: false, reservedForPath: true,
        },
        {
          q: 0, r: -1, height: 0, surface: "grass", walkable: true,
          territory: "verdant", buildable: true, reservedForPath: false,
        },
        {
          q: 1, r: 0, height: 0, surface: "grass", walkable: true,
          territory: "verdant", buildable: true, reservedForPath: false,
        },
        {
          q: 0, r: -2, height: 0, surface: "bridge", walkable: true,
          territory: null, buildable: false, reservedForPath: true,
        },
      ],
      verdantCamp: { q: 0, r: 0 },
      crimsonCamp: { q: 0, r: -2 },
      center: { q: 0, r: -2 },
      castles: { verdant: { q: 0, r: 0 }, crimson: { q: 0, r: -2 } },
      castleApproaches: { verdant: { q: 0, r: 0 }, crimson: { q: 0, r: -2 } },
      radius: 2,
    };

    expect(requestBuildingPlacement(map, createBuildingOccupancy(), {
      buildingId: "blocked-choke",
      kind: "barracks",
      faction: "verdant",
      worldPosition: axialToWorld({ q: 0, r: -1 }),
    })).toMatchObject({ ok: false, reason: "blocked-route" });
  });
});
