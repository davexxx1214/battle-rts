import { describe, expect, it } from "vitest";

import {
  advanceBuildings,
  createBattleBuilding,
  type BattleBuilding,
} from "../../src/game/buildings";
import type { BuildingOccupancy } from "../../src/game/deployment";
import { createEconomyState } from "../../src/game/economy";
import { GAME_RULES } from "../../src/game/rules";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  coordinateKey,
  hexDistance,
  type HexCoordinate,
} from "../../src/map/battlefield";

const MINE_COORDINATE = findBuildingCoordinate(2);
const BARRACKS_COORDINATE = findBuildingCoordinate(4);

describe("building simulation", () => {
  it("rejects non-finite building identity coordinates and creation time", () => {
    expect(() => createBattleBuilding({
      id: "invalid-time",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: MINE_COORDINATE,
      createdAt: Number.NaN,
    })).toThrow("finite creation time");
    expect(() => createBattleBuilding({
      id: "invalid-coordinate",
      kind: "barracks",
      faction: "verdant",
      coordinate: { q: Number.POSITIVE_INFINITY, r: 0 },
      createdAt: 0,
    })).toThrow("finite integer hex coordinate");
    expect(() => createBattleBuilding({
      id: "   ",
      kind: "barracks",
      faction: "verdant",
      coordinate: BARRACKS_COORDINATE,
      createdAt: 0,
    })).toThrow("non-empty id");
  });

  it("produces nine mine ticks before expiring at 36 seconds", () => {
    const mine = createBattleBuilding({
      id: "verdant-mine-1",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: MINE_COORDINATE,
      createdAt: 0,
    });

    const result = advanceBuildings({
      buildings: [mine],
      economy: createEconomyState(),
      occupancy: occupy(mine),
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: GAME_RULES.buildings.goldMine.lifetimeSeconds,
      damageIntents: [],
    });
    const production = result.events.filter((event) => event.type === "building-gold-produced");
    const destroyed = result.events.filter((event) => event.type === "building-destroyed");

    expect(production).toHaveLength(9);
    expect(production.map((event) => event.scheduledAt)).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36]);
    expect(production.reduce((total, event) => total + event.creditedAmount, 0)).toBe(500);
    expect(production.reduce((total, event) => total + event.wastedAmount, 0)).toBe(400);
    expect(result.economy.accounts.verdant.gold).toBe(1000);
    expect(result.buildings[0]).toMatchObject({ health: 0, status: "destroyed", diedAt: 36 });
    expect(destroyed).toHaveLength(1);
    expect(result.events.at(-2)).toMatchObject({
      type: "building-gold-produced",
      scheduledAt: 36,
    });
    expect(result.events.at(-1)).toMatchObject({
      type: "building-destroyed",
      buildingId: mine.id,
      scheduledAt: 36,
    });
  });

  it("stops mine production after early combat destruction", () => {
    const mine = createBattleBuilding({
      id: "verdant-mine-early",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: MINE_COORDINATE,
      createdAt: 0,
    });
    const destroyed = advanceBuildings({
      buildings: [mine],
      economy: createEconomyState(),
      occupancy: occupy(mine),
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 2,
      damageIntents: [{
        targetType: "building",
        targetId: mine.id,
        amount: mine.maxHealth,
        sourceId: "enemy",
        sourceType: "unit",
      }],
    });
    const advanced = advanceBuildings({
      buildings: destroyed.buildings,
      economy: destroyed.economy,
      occupancy: destroyed.occupancy,
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 2,
      deltaSeconds: 34,
      damageIntents: [],
    });

    expect(destroyed.events.filter((event) => event.type === "building-destroyed")).toHaveLength(1);
    expect(advanced.events.filter((event) => event.type === "building-gold-produced")).toHaveLength(0);
    expect(advanced.events.filter((event) => event.type === "building-destroyed")).toHaveLength(0);
  });

  it("spawns three deterministic friendly swordsmen from a full-lived barracks", () => {
    const barracks = createBattleBuilding({
      id: "verdant-barracks-1",
      kind: "barracks",
      faction: "verdant",
      coordinate: BARRACKS_COORDINATE,
      createdAt: 10,
    });
    const input = {
      buildings: [barracks],
      economy: createEconomyState(),
      occupancy: occupy(barracks),
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 10,
      deltaSeconds: GAME_RULES.buildings.barracks.lifetimeSeconds,
      damageIntents: [],
    } as const;

    const first = advanceBuildings(input);
    const second = advanceBuildings(input);

    expect(first.unitSpawns).toEqual(second.unitSpawns);
    expect(first.unitSpawns).toHaveLength(3);
    expect(first.unitSpawns.map((spawn) => spawn.unitId)).toEqual([
      `${barracks.id}-swordsman-1`,
      `${barracks.id}-swordsman-2`,
      `${barracks.id}-swordsman-3`,
    ]);
    expect(first.unitSpawns.every((spawn) => (
      spawn.faction === "verdant" && spawn.role === "knight"
    ))).toBe(true);
    expect(new Set(first.unitSpawns.map((spawn) => JSON.stringify(spawn.position))).size).toBe(3);
  });

  it("skips a blocked barracks spawn without queueing it for later", () => {
    const barracks = createBattleBuilding({
      id: "verdant-barracks-blocked",
      kind: "barracks",
      faction: "verdant",
      coordinate: BARRACKS_COORDINATE,
      createdAt: 0,
    });
    const blocked = occupyNeighbors(occupy(barracks), barracks.coordinate);
    const first = advanceBuildings({
      buildings: [barracks],
      economy: createEconomyState(),
      occupancy: blocked,
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 5,
      damageIntents: [],
    });
    const second = advanceBuildings({
      buildings: first.buildings,
      economy: first.economy,
      occupancy: occupy(barracks),
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 5,
      deltaSeconds: 10,
      damageIntents: [],
    });

    expect(first.unitSpawns).toEqual([]);
    expect(first.events).toContainEqual(expect.objectContaining({
      type: "building-unit-spawn-skipped",
      spawnSequence: 1,
    }));
    expect(second.unitSpawns.map((spawn) => spawn.unitId)).toEqual([
      `${barracks.id}-swordsman-2`,
    ]);
  });

  it("settles natural and combat damage once, then releases occupancy on simulation time", () => {
    const mine = createBattleBuilding({
      id: "verdant-mine-combined",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: MINE_COORDINATE,
      createdAt: 0,
    });
    const occupancy = occupy(mine);
    const aged = advanceBuildings({
      buildings: [mine],
      economy: createEconomyState(),
      occupancy,
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 35.9,
      damageIntents: [],
    });
    const result = advanceBuildings({
      buildings: aged.buildings,
      economy: aged.economy,
      occupancy,
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 35.9,
      deltaSeconds: 0.1,
      damageIntents: [{
        targetType: "building",
        targetId: mine.id,
        amount: 1,
        sourceId: "enemy",
        sourceType: "unit",
      }],
    });

    expect(result.events.filter((event) => event.type === "building-destroyed")).toHaveLength(1);
    expect(result.occupancy).toBe(occupancy);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "building-destroyed",
      coordinate: mine.coordinate,
      position: axialToWorld(mine.coordinate),
      removeAt: 36 + GAME_RULES.buildings.destructionSeconds,
    }));
    const removed = advanceBuildings({
      buildings: result.buildings,
      economy: result.economy,
      occupancy: result.occupancy,
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 36,
      deltaSeconds: GAME_RULES.buildings.destructionSeconds,
      damageIntents: [],
    });
    expect(removed.buildings).toEqual([]);
    expect(removed.occupancy[coordinateKey(mine.coordinate)]).toBeUndefined();
    expect(removed.events.filter((event) => event.type === "building-destroyed")).toHaveLength(0);
  });

  it("creates castles as permanent building entities", () => {
    const castle = createBattleBuilding({
      id: "verdant-castle",
      kind: "castle",
      faction: "verdant",
      coordinate: BATTLEFIELD_MAP.castles.verdant,
      createdAt: 0,
    });

    expect(castle).toMatchObject({
      kind: "castle",
      maxHealth: GAME_RULES.castle.maxHealth,
      health: GAME_RULES.castle.maxHealth,
      lifetimeSeconds: null,
      status: "active",
    });
    const advanced = advanceBuildings({
      buildings: [castle],
      economy: createEconomyState(),
      occupancy: {},
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 3600,
      damageIntents: [],
    });
    expect(advanced.buildings[0]).toEqual(castle);
    expect(advanced.events).toEqual([]);
  });

  it("produces the same mine state with one large update or fixed small updates", () => {
    const mine = createBattleBuilding({
      id: "granularity-mine",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: MINE_COORDINATE,
      createdAt: 0,
    });
    const initialEconomy = createEconomyState();
    const large = advanceBuildings({
      buildings: [mine],
      economy: initialEconomy,
      occupancy: occupy(mine),
      map: BATTLEFIELD_MAP,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 36,
      damageIntents: [],
    });
    let buildings: readonly BattleBuilding[] = [mine];
    let economy = initialEconomy;
    const events = [] as typeof large.events[number][];
    for (let index = 0; index < 360; index += 1) {
      const small = advanceBuildings({
        buildings,
        economy,
        occupancy: occupy(mine),
        map: BATTLEFIELD_MAP,
        units: [],
        elapsedSeconds: index / 10,
        deltaSeconds: 0.1,
        damageIntents: [],
      });
      buildings = small.buildings;
      economy = small.economy;
      events.push(...small.events);
    }

    expect(buildings[0]).toMatchObject({
      health: large.buildings[0]!.health,
      status: large.buildings[0]!.status,
      productionSequence: large.buildings[0]!.productionSequence,
    });
    expect(economy).toEqual(large.economy);
    expect(events).toEqual(large.events);
  });
});

function occupy(building: BattleBuilding): BuildingOccupancy {
  return {
    [coordinateKey(building.coordinate)]: {
      buildingId: building.id,
      kind: building.kind === "castle" ? "barracks" : building.kind,
      faction: building.faction,
      coordinate: building.coordinate,
    },
  };
}

function occupyNeighbors(
  occupancy: BuildingOccupancy,
  origin: HexCoordinate,
): BuildingOccupancy {
  return BATTLEFIELD_MAP.cells
    .filter((cell) => hexDistance(cell, origin) === 1)
    .reduce<BuildingOccupancy>((current, cell, index) => ({
      ...current,
      [coordinateKey(cell)]: {
        buildingId: `blocker-${index}`,
        kind: "barracks",
        faction: "verdant",
        coordinate: cell,
      },
    }), occupancy);
}

function findBuildingCoordinate(minimumWalkableNeighbors: number): HexCoordinate {
  const coordinate = BATTLEFIELD_MAP.cells.find((cell) => (
    cell.territory === "verdant"
    && cell.buildable
    && BATTLEFIELD_MAP.cells.filter((candidate) => (
      candidate.walkable && hexDistance(candidate, cell) === 1
    )).length >= minimumWalkableNeighbors
    && Number.isFinite(axialToWorld(cell).x)
  ));
  if (!coordinate) throw new Error("Expected a buildable test coordinate.");
  return { q: coordinate.q, r: coordinate.r };
}
