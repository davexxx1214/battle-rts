import { describe, expect, it } from "vitest";
import {
  createBattleState,
  createBattleUnit,
  createInitialBattle,
} from "../../src/game/battle";
import { advanceBattleSession } from "../../src/game/battleSession";
import {
  SANDBOX_AI_ATTACK_WAVE_MINIMUM_POPULATION,
  SANDBOX_AI_ATTACK_WAVE_MINIMUM_UNITS,
  SANDBOX_AI_FACTION,
  SANDBOX_AI_FAILURE_RETRY_SECONDS,
  advanceSandboxOpponentAi,
  sandboxAiPopulationTarget,
} from "../../src/game/sandboxOpponentAi";
import { sandboxUsedPopulation } from "../../src/game/population";
import { sandboxProductionPopulation } from "../../src/game/sandboxProductionQueue";
import { battlefieldDefinitionFor } from "../../src/map/battlefieldDefinition";
import { axialToWorld, coordinateKey, getMapCell } from "../../src/map/battlefield";

describe("sandbox opponent AI", () => {
  it("uses the shared transactions for a deterministic mine, barracks, and first unit opening", () => {
    const initial = createInitialBattle({ modeId: "sandbox" });
    const afterMine = advanceSeconds(initial, 1);
    expect(afterMine.sandboxAi).toMatchObject({
      phase: "opening",
      decisionSequence: 1,
      actionSequence: 1,
    });
    expect(afterMine.buildings.filter((building) => (
      building.faction === SANDBOX_AI_FACTION && building.kind === "gold-mine"
    ))).toHaveLength(1);
    expect(afterMine.economy.accounts.crimson.gold).toBe(600);

    const afterBarracks = advanceSeconds(afterMine, 1);
    expect(afterBarracks.buildings.filter((building) => (
      building.faction === SANDBOX_AI_FACTION && building.kind === "barracks"
    ))).toHaveLength(1);
    expect(afterBarracks.economy.accounts.crimson.gold).toBe(200);

    const afterTraining = advanceSeconds(afterBarracks, 17);
    expect(afterTraining.units.some((unit) => unit.faction === "crimson")).toBe(true);
    expect(afterTraining.deploymentCounts.crimson.spearman).toBe(0);
    expect(afterTraining.sandboxAi?.ledger.some((entry) => (
      entry.action === "enqueue-production"
      && entry.outcome === "succeeded"
      && entry.goldBefore - entry.goldAfter === 100
    ))).toBe(true);
  });

  it("builds legal economy and tech, captures neutral ore, and issues route attacks", () => {
    const battle = advanceSeconds(
      fortifyVerdantCastle(createInitialBattle({ modeId: "sandbox" })),
      360,
    );
    const definition = battlefieldDefinitionFor(battle.mapId);
    const crimsonBuildings = battle.buildings.filter((building) => (
      building.faction === "crimson"
      && building.status === "active"
      && building.health > 0
      && building.kind !== "castle"
    ));
    const kinds = new Set(crimsonBuildings.map((building) => building.kind));
    expect(kinds.has("gold-mine")).toBe(true);
    expect(kinds.has("barracks")).toBe(true);
    expect(kinds.has("archery-range")).toBe(true);
    expect(kinds.has("mage-tower")).toBe(true);
    expect(kinds.has("siege-workshop")).toBe(true);
    expect(crimsonBuildings.every((building) => {
      const cell = getMapCell(definition.map, building.coordinate);
      return building.kind === "gold-mine"
        ? cell?.buildPolicy === "mine-only"
        : cell?.buildPolicy === "ordinary" && cell.territory === "crimson";
    })).toBe(true);
    expect(battle.mining && Object.values(battle.mining.pitsById).some((pit) => (
      pit.controller === "crimson"
      && !["E-W", "E-E"].includes(pit.id)
    ))).toBe(true);
    expect(battle.sandboxAi?.ledger.some((entry) => entry.action === "attack-wave")).toBe(true);
    expect(battle.sandboxAi?.ledger.some((entry) => entry.action === "assault")).toBe(true);
    const attackedRoutes = new Set(battle.sandboxAi?.ledger.filter((entry) => (
      entry.action === "attack-wave" && entry.outcome === "succeeded"
    )).map((entry) => entry.subjectId));
    expect(attackedRoutes.size).toBeGreaterThanOrEqual(1);
    expect(attackedRoutes).toContain("center");
    const trainedTroops = new Set(battle.sandboxAi?.ledger.filter((entry) => (
      entry.action === "enqueue-production" && entry.outcome === "succeeded"
    )).map((entry) => entry.subjectId));
    for (const troop of ["spearman", "swordsman", "archer", "mage", "catapult"]) {
      expect(trainedTroops.has(troop)).toBe(true);
    }
    expect(Object.values(battle.deploymentCounts.crimson).every((count) => count === 0)).toBe(true);
  });

  it("is reproducible through long simulation and survives a JSON restore", () => {
    const runs = Array.from({ length: 3 }, () => (
      advanceSeconds(createInitialBattle({ modeId: "sandbox" }), 1_800)
    ));
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);

    const first = advanceSeconds(createInitialBattle({ modeId: "sandbox" }), 300);
    const restored = JSON.parse(JSON.stringify(
      advanceSeconds(createInitialBattle({ modeId: "sandbox" }), 120),
    ));
    const second = advanceSeconds(restored, 180);
    expect(second.sandboxAi).toEqual(first.sandboxAi);
    expect(second.economy).toEqual(first.economy);
    expect(second.mining).toEqual(first.mining);
    expect(second.production).toEqual(first.production);
    expect(second.units).toEqual(first.units);
    expect(second.buildings).toEqual(first.buildings);
  }, 10_000);

  it("never exceeds the population cap and deliberately stops on maintenance thresholds", () => {
    expect(SANDBOX_AI_ATTACK_WAVE_MINIMUM_UNITS).toBe(3);
    expect(SANDBOX_AI_ATTACK_WAVE_MINIMUM_POPULATION).toBe(10);
    expect(sandboxAiPopulationTarget(0, false)).toBe(12);
    expect(sandboxAiPopulationTarget(2, false)).toBe(50);
    expect(sandboxAiPopulationTarget(4, false)).toBe(80);
    expect(sandboxAiPopulationTarget(4, true)).toBe(100);

    let battle = createInitialBattle({ modeId: "sandbox" });
    for (let second = 0; second < 600 && battle.winner === null; second += 1) {
      battle = advanceSeconds(battle, 1);
      const queue = battle.production
        ? sandboxProductionPopulation(battle.production, "crimson")
        : { totalQueuePopulation: 0 };
      expect(
        sandboxUsedPopulation(battle.units, "crimson") + queue.totalQueuePopulation,
      ).toBeLessThanOrEqual(100);
      expect(Object.values(battle.mining?.pitsById ?? {}).every((pit) => (
        pit.remainingOre >= 0 && pit.remainingOre <= pit.capacityOre
      ))).toBe(true);
    }
  });

  it("backs off failed transactions and stops immediately after resolution", () => {
    const initial = createInitialBattle({ modeId: "sandbox" });
    const definition = battlefieldDefinitionFor(initial.mapId);
    const occupied = Object.fromEntries(
      (definition.buildAnchors?.crimson ?? []).map((anchor, index) => [
        coordinateKey(anchor.coordinate),
        {
          buildingId: `occupied-${index}`,
          kind: "barracks" as const,
          faction: "crimson" as const,
          coordinate: anchor.coordinate,
        },
      ]),
    );
    const mine = advanceSeconds(initial, 1);
    const blocked = advanceSandboxOpponentAi({
      ...mine,
      buildingOccupancy: occupied,
      matchElapsed: 2,
    });
    expect(blocked.sandboxAi).toMatchObject({
      lastFailureAction: "construct-building",
      lastFailureReason: "no-legal-anchor",
      repeatedFailureCount: 1,
      retryNotBefore: 2 + SANDBOX_AI_FAILURE_RETRY_SECONDS,
    });
    const duringCooldown = advanceSandboxOpponentAi({ ...blocked, matchElapsed: 3 });
    expect(duringCooldown.sandboxAi?.ledger).toHaveLength(2);

    const resolved = { ...blocked, winner: "verdant" as const, resolvedAt: 2 };
    expect(advanceSandboxOpponentAi(resolved)).toBe(resolved);
  });

  it("uses the same order transaction to defend and resumes the assault afterward", () => {
    const definition = battlefieldDefinitionFor("sandbox-large-v1");
    const battle = createBattleState([
      createBattleUnit({
        id: "crimson-defender",
        squadId: "crimson-defense",
        faction: "crimson",
        role: "spearman",
        position: axialToWorld(definition.map.castleApproaches.crimson),
      }),
      createBattleUnit({
        id: "verdant-raider",
        squadId: "verdant-raid",
        faction: "verdant",
        role: "spearman",
        position: axialToWorld(definition.map.castles.crimson),
      }),
    ], { modeId: "sandbox" });
    const defending = advanceSandboxOpponentAi(battle);
    expect(defending.sandboxAi?.phase).toBe("defend");
    expect(defending.squadOrders?.ordersBySquadId["crimson-defender"]).toMatchObject({
      kind: "attack",
      target: { targetType: "unit", targetId: "verdant-raider" },
    });

    const withoutThreat = {
      ...defending,
      units: defending.units.map((unit) => unit.id === "verdant-raider"
        ? { ...unit, health: 0, status: "dead" as const, diedAt: 1 }
        : unit),
      matchElapsed: 2,
    };
    const resumed = advanceSandboxOpponentAi(withoutThreat);
    expect(resumed.sandboxAi?.phase).toBe("attack");
    expect(resumed.squadOrders?.ordersBySquadId["crimson-defender"]?.kind)
      .toBe("attack-move");
  });

  it("uses the one-shot emergency mine permit without creating free gold", () => {
    const battle = createInitialBattle({ modeId: "sandbox" });
    const broke = {
      ...battle,
      economy: {
        accounts: {
          ...battle.economy.accounts,
          crimson: { ...battle.economy.accounts.crimson, gold: 0 },
        },
      },
    };
    const recovered = advanceSandboxOpponentAi(broke);
    expect(recovered.economy.accounts.crimson.gold).toBe(0);
    expect(recovered.mining?.emergencyPermits.crimson.used).toBe(true);
    expect(recovered.buildings.some((building) => (
      building.faction === "crimson" && building.kind === "gold-mine"
    ))).toBe(true);
    expect(recovered.sandboxAi?.ledger.at(-1)).toMatchObject({
      phase: "recovery",
      action: "construct-mine",
      goldBefore: 0,
      goldAfter: 0,
      outcome: "succeeded",
    });
  });

  it("replaces a depleted economy source instead of treating its building as productive", () => {
    let battle = advanceSeconds(createInitialBattle({ modeId: "sandbox" }), 2);
    const firstMine = battle.buildings.find((building) => (
      building.faction === "crimson" && building.kind === "gold-mine"
    ))!;
    const pit = Object.values(battle.mining!.pitsById).find((candidate) => (
      candidate.occupyingMineId === firstMine.id
    ))!;
    battle = {
      ...battle,
      mining: {
        ...battle.mining!,
        pitsById: {
          ...battle.mining!.pitsById,
          [pit.id]: { ...pit, remainingOre: 0, depleted: true },
        },
      },
      economy: {
        accounts: {
          ...battle.economy.accounts,
          crimson: { ...battle.economy.accounts.crimson, gold: 1_000 },
        },
      },
      matchElapsed: 3,
    };
    const recovered = advanceSandboxOpponentAi(battle);
    expect(recovered.buildings.filter((building) => (
      building.faction === "crimson" && building.kind === "gold-mine"
    ))).toHaveLength(2);
    expect(recovered.sandboxAi?.ledger.at(-1)).toMatchObject({
      action: "construct-mine",
      subjectId: "E-E",
      outcome: "succeeded",
    });
  });

  it("tracks every successful action with auditable before and after snapshots", () => {
    const battle = advanceSeconds(createInitialBattle({ modeId: "sandbox" }), 180);
    const ledger = battle.sandboxAi?.ledger ?? [];
    expect(ledger.length).toBeGreaterThan(10);
    expect(ledger.every((entry, index) => (
      entry.sequence === index + 1
      && entry.decidedAt >= 1
      && entry.goldBefore >= 0
      && entry.goldAfter >= 0
      && entry.remainingOreBefore >= entry.remainingOreAfter
      && entry.livingPopulationBefore <= 100
      && entry.livingPopulationAfter <= 100
      && entry.reservedPopulationBefore <= 100
      && entry.reservedPopulationAfter <= 100
      && entry.queuedOrdersBefore >= 0
      && entry.queuedOrdersAfter >= 0
    ))).toBe(true);
    expect(ledger.filter((entry) => entry.outcome === "succeeded").every((entry) => (
      entry.reason === null
    ))).toBe(true);
  });
});

function advanceSeconds(
  initial: ReturnType<typeof createInitialBattle>,
  seconds: number,
): ReturnType<typeof createInitialBattle> {
  let battle = initial;
  const steps = Math.round(seconds * 10);
  for (let index = 0; index < steps; index += 1) {
    battle = advanceBattleSession(battle, "engaged", 1, 0.1, "normal");
  }
  return battle;
}

function fortifyVerdantCastle(
  battle: ReturnType<typeof createInitialBattle>,
): ReturnType<typeof createInitialBattle> {
  return {
    ...battle,
    buildings: battle.buildings.map((building) => (
      building.kind === "castle" && building.faction === "verdant"
        ? { ...building, health: 1_000_000_000, maxHealth: 1_000_000_000 }
        : building
    )),
  };
}
