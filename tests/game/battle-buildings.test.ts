import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { createBattleBuilding, type BattleBuilding } from "../../src/game/buildings";
import type { BuildingOccupancy } from "../../src/game/deployment";
import {
  BATTLEFIELD_MAP,
  coordinateKey,
  hexDistance,
  type HexCoordinate,
} from "../../src/map/battlefield";

const BUILDING_COORDINATE = findBuildingCoordinate();

describe("battle building integration", () => {
  it("advances mine health, production, economy, and events in the fixed battle step", () => {
    const mine = createBattleBuilding({
      id: "integrated-mine",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: BUILDING_COORDINATE,
      createdAt: 0,
    });
    let state = withBuilding(createUnresolvedBattle(), mine);

    state = advance(state, 40);

    expect(state.buildings[0]).toMatchObject({
      id: mine.id,
      status: "active",
      productionSequence: 1,
    });
    expect(state.buildings[0]!.health).toBeLessThan(mine.maxHealth);
    expect(state.economy.accounts.verdant.gold).toBe(700);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "building-gold-produced",
      buildingId: mine.id,
      productionSequence: 1,
      producedAmount: 100,
    }));
  });

  it("turns barracks spawn requests into deterministic battle units", () => {
    const barracks = createBattleBuilding({
      id: "integrated-barracks",
      kind: "barracks",
      faction: "verdant",
      coordinate: BUILDING_COORDINATE,
      createdAt: 0,
    });
    let state = withBuilding(createUnresolvedBattle(), barracks);

    state = advance(state, 50);

    const spawned = state.units.find((unit) => unit.id === `${barracks.id}-swordsman-1`);
    expect(spawned).toMatchObject({
      faction: "verdant",
      role: "knight",
      squadId: `${barracks.id}-spawned`,
      status: "idle",
    });
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "building-unit-spawned",
      buildingId: barracks.id,
      unitId: spawned!.id,
      spawnSequence: 1,
    }));
  });

  it("releases a destroyed building when its authoritative removal time arrives", () => {
    const mine = {
      ...createBattleBuilding({
        id: "destroyed-mine",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: BUILDING_COORDINATE,
        createdAt: 0,
      }),
      health: 0,
      status: "destroyed" as const,
      diedAt: 1,
      removeAt: 1 + 0.8,
    };
    const seeded = withBuilding(createUnresolvedBattle(), mine);

    const state = stepBattle({
      ...seeded,
      elapsed: 1.7,
      matchElapsed: 1.7,
    }, 0.1);

    expect(state.buildings).toEqual([]);
    expect(state.buildingOccupancy[coordinateKey(mine.coordinate)]).toBeUndefined();
    expect(state.revision).toBe(seeded.revision + 1);
  });

  it("does not run building production past the three-minute match boundary", () => {
    const barracks = createBattleBuilding({
      id: "boundary-barracks",
      kind: "barracks",
      faction: "verdant",
      coordinate: BUILDING_COORDINATE,
      createdAt: 175.02,
    });
    const seeded = withBuilding(createUnresolvedBattle(), barracks);
    const state = stepBattle({
      ...seeded,
      elapsed: 179.95,
      matchElapsed: 179.95,
    }, 0.1);

    expect(state.matchElapsed).toBe(180);
    expect(state.buildings[0]?.productionSequence).toBe(0);
    expect(state.units.some((unit) => unit.id.startsWith(`${barracks.id}-swordsman-`))).toBe(false);
  });

  it("cleans destroyed building occupancy during frozen post-battle presentation", () => {
    const mine = {
      ...createBattleBuilding({
        id: "post-battle-wreck",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: BUILDING_COORDINATE,
        createdAt: 0,
      }),
      health: 0,
      status: "destroyed" as const,
      diedAt: 0,
      removeAt: 0.2,
    };
    let state = withBuilding(createBattleState([
      createBattleUnit({
        id: "winner",
        faction: "verdant",
        role: "knight",
        position: { x: 0, z: 0 },
      }),
    ]), mine);
    state = { ...state, matchElapsed: 179.95 };

    state = stepBattle(stepBattle(state, 0.1), 0.1);

    expect(state.winner).toBe("draw");
    expect(state.buildings).toEqual([]);
    expect(state.buildingOccupancy[coordinateKey(mine.coordinate)]).toBeUndefined();
  });
});

function createUnresolvedBattle(): BattleState {
  return createBattleState([
    createBattleUnit({
      id: "verdant-anchor",
      faction: "verdant",
      role: "knight",
      position: { x: -20, z: 15 },
    }),
    createBattleUnit({
      id: "crimson-anchor",
      faction: "crimson",
      role: "knight",
      position: { x: 20, z: -15 },
    }),
  ]);
}

function withBuilding(state: BattleState, building: BattleBuilding): BattleState {
  const occupancy: BuildingOccupancy = {
    [coordinateKey(building.coordinate)]: {
      buildingId: building.id,
      kind: building.kind === "castle" ? "barracks" : building.kind,
      faction: building.faction,
      coordinate: building.coordinate,
    },
  };
  return { ...state, buildings: [building], buildingOccupancy: occupancy };
}

function advance(state: BattleState, steps: number): BattleState {
  let next = state;
  for (let index = 0; index < steps; index += 1) next = stepBattle(next, 0.1);
  return next;
}

function findBuildingCoordinate(): HexCoordinate {
  const coordinate = BATTLEFIELD_MAP.cells.find((cell) => (
    cell.territory === "verdant"
    && cell.buildable
    && BATTLEFIELD_MAP.cells.filter((candidate) => (
      candidate.walkable && hexDistance(candidate, cell) === 1
    )).length >= 3
  ));
  if (!coordinate) throw new Error("Expected a buildable integration-test coordinate.");
  return { q: coordinate.q, r: coordinate.r };
}
