import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { buildSquads } from "../../src/game/squads";
import {
  battleBuildingConstructionPhaseAt,
  createBattleBuilding,
} from "../../src/game/buildings";
import { advanceArrowTowerAttacks } from "../../src/game/arrowTowerCombat";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import {
  startSandboxBuildingConstruction,
} from "../../src/game/sandboxBattleTransactions";
import {
  enqueueSandboxBattleProduction,
  setSandboxBattleRallyPoint,
} from "../../src/game/sandboxProductionTransactions";
import {
  sandboxProductionPopulation,
  sandboxProductionQueueFor,
} from "../../src/game/sandboxProductionQueue";
import {
  createSandboxProductionExitFan,
} from "../../src/game/sandboxProductionExit";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_ROAD_RESERVE,
} from "../../src/map/sandboxLargeBattlefield";
import { axialToWorld } from "../../src/map/battlefield";

describe("sandbox production battle integration", () => {
  it("normalizes imported sandbox units into independent one-unit control groups", () => {
    const units = [
      createBattleUnit({
        id: "unit-alpha",
        faction: "verdant",
        role: "spearman",
        squadId: "legacy-shared-squad",
        position: { x: 0, z: 0 },
      }),
      createBattleUnit({
        id: "unit-bravo",
        faction: "verdant",
        role: "spearman",
        squadId: "legacy-shared-squad",
        position: { x: 1, z: 0 },
      }),
    ];

    const battle = createBattleState(units, { modeId: "sandbox" });

    expect(battle.units.map((unit) => unit.squadId)).toEqual([
      "unit-alpha",
      "unit-bravo",
    ]);
    expect(battle.squads.map((controlGroup) => controlGroup.memberIds))
      .toEqual([["unit-alpha"], ["unit-bravo"]]);
  });

  it("keeps a guard-tower worksite from firing before construction completes", () => {
    const coordinate = SANDBOX_LARGE_BUILD_ANCHORS.verdant[0]!.coordinate;
    const tower = createBattleBuilding({
      id: "guard-worksite",
      kind: "guard-tower",
      faction: "verdant",
      coordinate,
      createdAt: 0,
      constructionSeconds: 8,
    }, battleModeDefinitionFor("sandbox").buildingLifecyclePolicy);
    const target = createBattleUnit({
      id: "guard-target",
      faction: "crimson",
      role: "spearman",
      position: { x: tower.position.x, z: tower.position.z - 2 },
    });
    expect(advanceArrowTowerAttacks([tower], [target], 0.1, 7.99).attacks).toEqual([]);
    expect(advanceArrowTowerAttacks([tower], [target], 0.1, 8).attacks).toHaveLength(1);
  });

  it("locks new advanced construction to a completed living barracks only", () => {
    let battle = createInitialBattle({ modeId: "sandbox" });
    const noBarracks = startSandboxBuildingConstruction(battle, {
      faction: "verdant",
      slot: "archery-range",
      worldPosition: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant.at(-1)!.coordinate),
    });
    expect(noBarracks).toMatchObject({ ok: false, reason: "missing-prerequisite" });

    battle = construct(battle, "barracks", 0);
    const constructingBarracks = startSandboxBuildingConstruction(battle, {
      faction: "verdant",
      slot: "archery-range",
      worldPosition: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant.at(-1)!.coordinate),
    });
    expect(constructingBarracks).toMatchObject({
      ok: false,
      reason: "missing-prerequisite",
    });

    battle = advanceSeconds(battle, 8);
    const range = startSandboxBuildingConstruction(battle, {
      faction: "verdant",
      slot: "archery-range",
      worldPosition: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant.at(-1)!.coordinate),
    });
    expect(range.ok).toBe(true);
    if (!range.ok) return;
    battle = {
      ...range.battle,
      buildings: range.battle.buildings.map((building) => (
        building.id === "verdant-barracks-1"
          ? {
              ...building,
              health: 0,
              status: "destroyed" as const,
              diedAt: range.battle.elapsed,
              removeAt: range.battle.elapsed + 1,
            }
          : building
      )),
    };
    battle = advanceSeconds(battle, 10);
    const existingRange = battle.buildings.find((building) => (
      building.id === "verdant-archery-range-2"
    ));
    expect(existingRange).toBeDefined();
    expect(battleBuildingConstructionPhaseAt(
      existingRange!,
      battle.matchElapsed,
    )).toBe("operational");
    const newMageTower = startSandboxBuildingConstruction(battle, {
      faction: "verdant",
      slot: "mage-tower",
      worldPosition: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant.at(-2)!.coordinate),
    });
    expect(newMageTower).toMatchObject({ ok: false, reason: "missing-prerequisite" });
  });

  it("runs the paid barracks queue and spawns one independently controlled unit", () => {
    let battle = createInitialBattle({ modeId: "sandbox" });
    battle = construct(battle, "barracks", 0);
    expect(battle.economy.accounts.verdant.gold).toBe(600);
    battle = advanceSeconds(battle, 8);

    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "spearman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = enqueue.battle;
    expect(battle.economy.accounts.verdant.gold).toBe(500);
    expect(sandboxProductionPopulation(battle.production!, "verdant")).toMatchObject({
      reservedPopulation: 1,
      readyBlockedPopulation: 0,
    });

    battle = advanceSeconds(battle, 3);
    const recruits = battle.units.filter((unit) => (
      unit.id === "verdant-barracks-1:unit:1"
    ));
    expect(recruits).toHaveLength(1);
    expect(recruits[0]).toMatchObject({
      role: "spearman",
      squadId: "verdant-barracks-1:unit:1",
    });
    expect(recruits.every((unit) => unit.status === "idle")).toBe(true);
    expect(sandboxProductionQueueFor(
      battle.production!,
      "verdant-barracks-1",
    )?.entries).toEqual([]);
  });

  it("restores a paid in-flight queue from plain JSON without runtime objects", () => {
    let battle = advanceSeconds(
      construct(createInitialBattle({ modeId: "sandbox" }), "barracks", 0),
      8,
    );
    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "swordsman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = JSON.parse(JSON.stringify(enqueue.battle)) as BattleState;
    expect(JSON.stringify(battle)).not.toContain("BattleModeDefinition");
    expect(sandboxProductionQueueFor(
      battle.production!,
      "verdant-barracks-1",
    )?.entries[0]).toMatchObject({
      troopKind: "swordsman",
      status: "training",
    });

    battle = advanceSeconds(battle, 4);
    expect(battle.units.filter((unit) => (
      unit.id === "verdant-barracks-1:unit:1"
    ))).toHaveLength(1);
  });

  it("uses living population for mining until completion, then taxes the same tick", () => {
    const populationUnits = SANDBOX_LARGE_BATTLEFIELD_MAP.cells
      .filter((cell) => (
        cell.territory === "verdant"
        && cell.walkable
        && cell.buildPolicy === "forbidden"
      ))
      .slice(0, 20)
      .map((cell, index) => createBattleUnit({
        id: `population-${index + 1}`,
        faction: "verdant",
        role: "spearman",
        squadId: `population-squad-${index + 1}`,
        position: axialToWorld(cell),
      }));
    let battle = createInitialBattle({ modeId: "sandbox" });
    battle = {
      ...battle,
      units: populationUnits,
      squads: buildSquads(populationUnits),
    };
    const mine = startSandboxBuildingConstruction(battle, {
      faction: "verdant",
      slot: "mine",
      worldPosition: axialToWorld(SANDBOX_LARGE_MINE_PITS[0]!.coordinate),
    });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    battle = construct(mine.battle, "barracks", 0);
    expect(battle.economy.accounts.verdant.gold).toBe(200);
    battle = advanceSeconds(battle, 8);

    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-2",
      troopKind: "spearman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = advanceSeconds(enqueue.battle, 6);

    const settlements = battle.miningLedger.filter((event) => (
      event.faction === "verdant" && event.mineId === "verdant-gold-mine-1"
    ));
    expect(settlements.slice(-2).map((event) => ({
      used: event.usedPopulation,
      reserved: event.reservedPopulation,
      rate: event.incomeMultiplier,
      net: event.netCredited,
    }))).toEqual([
      { used: 20, reserved: 1, rate: 1, net: 100 },
      { used: 21, reserved: 0, rate: 0.8, net: 80 },
    ]);
    expect(battle.economy.accounts.verdant.gold).toBe(280);
  });

  it("keeps a completed order ready-blocked and releases it exactly once", () => {
    let battle = createInitialBattle({ modeId: "sandbox" });
    battle = advanceSeconds(construct(battle, "barracks", 0), 8);
    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "spearman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = enqueue.battle;
    const barracks = battle.buildings.find((building) => (
      building.id === "verdant-barracks-1"
    ))!;
    const fan = createSandboxProductionExitFan(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      SANDBOX_LARGE_ROAD_RESERVE,
      barracks.coordinate,
    );
    if (!fan.ok) throw new Error(fan.reason);
    const blockers = fan.fan.candidates.map((coordinate, index) => createBattleUnit({
      id: `exit-blocker-${index + 1}`,
      faction: "verdant",
      role: "spearman",
      squadId: `exit-blocker-squad-${index + 1}`,
      position: axialToWorld(coordinate),
    }));
    battle = {
      ...battle,
      units: blockers,
      squads: buildSquads(blockers),
    };
    battle = advanceSeconds(battle, 3);
    const blockedQueue = sandboxProductionQueueFor(
      battle.production!,
      barracks.id,
    );
    expect(blockedQueue?.entries[0]?.status).toBe("ready-blocked");
    expect(sandboxProductionPopulation(battle.production!, "verdant")).toMatchObject({
      reservedPopulation: 0,
      readyBlockedPopulation: 1,
    });
    expect(battle.units).toHaveLength(4);

    battle = {
      ...battle,
      units: battle.units.map((unit) => ({
        ...unit,
        health: 0,
        status: "dead" as const,
        diedAt: battle.elapsed,
      })),
    };
    battle = stepBattle(battle, 0.1);
    expect(battle.units.filter((unit) => unit.id.includes(":production:"))).toHaveLength(0);
    expect(battle.units.filter((unit) => unit.id === `${barracks.id}:unit:1`)).toHaveLength(1);
    expect(sandboxProductionPopulation(battle.production!, "verdant")).toMatchObject({
      reservedPopulation: 0,
      readyBlockedPopulation: 0,
    });
    const afterReleaseCount = battle.units.length;
    battle = stepBattle(battle, 0.1);
    expect(battle.units).toHaveLength(afterReleaseCount);
  });

  it("clears destroyed producer queues without refunding gold", () => {
    let battle = advanceSeconds(
      construct(createInitialBattle({ modeId: "sandbox" }), "barracks", 0),
      8,
    );
    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "swordsman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = enqueue.battle;
    const goldAfterEnqueue = battle.economy.accounts.verdant.gold;
    battle = {
      ...battle,
      buildings: battle.buildings.map((building) => building.id === "verdant-barracks-1"
        ? {
            ...building,
            health: 0,
            status: "destroyed" as const,
            diedAt: battle.elapsed,
            removeAt: battle.elapsed + 1,
          }
        : building),
    };
    battle = stepBattle(battle, 0.1);
    expect(sandboxProductionQueueFor(
      battle.production!,
      "verdant-barracks-1",
    )).toBeNull();
    expect(battle.economy.accounts.verdant.gold).toBe(goldAfterEnqueue);
    expect(battle.units).toHaveLength(0);
  });

  it("moves recruits to an optional rally point and then returns them to idle", () => {
    let battle = advanceSeconds(
      construct(createInitialBattle({ modeId: "sandbox" }), "barracks", 0),
      8,
    );
    const barracks = battle.buildings.find((building) => (
      building.id === "verdant-barracks-1"
    ))!;
    const fan = createSandboxProductionExitFan(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      SANDBOX_LARGE_ROAD_RESERVE,
      barracks.coordinate,
    );
    if (!fan.ok) throw new Error(fan.reason);
    const rally = setSandboxBattleRallyPoint(battle, {
      faction: "verdant",
      buildingId: barracks.id,
      worldPosition: axialToWorld(fan.fan.roadTarget),
    });
    expect(rally.ok).toBe(true);
    if (!rally.ok) return;
    const enqueue = enqueueSandboxBattleProduction(rally.battle, {
      faction: "verdant",
      buildingId: barracks.id,
      troopKind: "spearman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;
    battle = advanceSeconds(enqueue.battle, 3);
    expect(battle.units).toHaveLength(1);
    expect(battle.units.some((unit) => unit.status === "moving")).toBe(true);

    battle = advanceSeconds(battle, 5);
    expect(battle.units.every((unit) => unit.status === "idle")).toBe(true);
    const rallyWorld = axialToWorld(fan.fan.roadTarget);
    expect(battle.units.every((unit) => (
      Math.hypot(unit.position.x - rallyWorld.x, unit.position.z - rallyWorld.z) < 1
    ))).toBe(true);
  });
});

function construct(
  battle: BattleState,
  slot: "barracks" | "archery-range" | "mage-tower" | "siege-workshop" | "guard-tower",
  anchorIndex: number,
): BattleState {
  const result = startSandboxBuildingConstruction(battle, {
    faction: "verdant",
    slot,
    worldPosition: axialToWorld(
      SANDBOX_LARGE_BUILD_ANCHORS.verdant[anchorIndex]!.coordinate,
    ),
  });
  expect(result.ok, result.ok ? undefined : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.battle;
}

function advanceSeconds(battle: BattleState, seconds: number): BattleState {
  let next = battle;
  const steps = Math.round(seconds / 0.1);
  for (let index = 0; index < steps; index += 1) {
    next = stepBattle(next, 0.1);
  }
  return next;
}
