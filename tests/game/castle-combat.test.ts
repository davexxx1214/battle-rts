import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import type { BattleBuilding } from "../../src/game/buildings";
import { createBattleBuilding } from "../../src/game/buildings";
import { GAME_RULES, MATCH_POLICIES, UNIT_SPECS } from "../../src/game/rules";
import { BATTLEFIELD_MAP, axialToWorld } from "../../src/map/battlefield";
import type { Faction, WorldPoint } from "../../src/game/types";

function castleWorld(faction: Faction): WorldPoint {
  return axialToWorld(BATTLEFIELD_MAP.castles[faction]);
}

function castle(state: BattleState, faction: Faction): BattleBuilding {
  const result = state.buildings.find((building) => (
    building.kind === "castle" && building.faction === faction
  ));
  if (!result) throw new Error(`Missing ${faction} castle.`);
  return result;
}

function activateCastle(
  state: BattleState,
  faction: Faction,
  health: number = GAME_RULES.castle.maxHealth,
): BattleState {
  return {
    ...state,
    buildings: state.buildings.map((building) => (
      building.kind === "castle" && building.faction === faction
        ? {
            ...building,
            health,
            castleCombat: { activatedAt: 0, cooldownRemaining: 0 },
          }
        : building
    )),
  };
}

function setCastleHealth(
  state: BattleState,
  faction: Faction,
  health: number,
): BattleState {
  return {
    ...state,
    buildings: state.buildings.map((building) => (
      building.kind === "castle" && building.faction === faction
        ? { ...building, health }
        : building
    )),
  };
}

describe("authoritative castle combat", () => {
  it("creates one permanent dormant castle for each faction outside deployment occupancy", () => {
    const state = createBattleState([]);
    const castles = state.buildings.filter((building) => building.kind === "castle");

    expect(castles).toHaveLength(2);
    expect(castles.map((building) => building.faction).sort())
      .toEqual(["crimson", "verdant"]);
    expect(castles.every((building) => (
      building.lifetimeSeconds === null
      && building.castleCombat?.activatedAt === null
    ))).toBe(true);
    expect(state.buildingOccupancy).toEqual({});
  });

  it("does not attack an enemy in range before receiving damage", () => {
    const origin = castleWorld("verdant");
    const enemy = createBattleUnit({
      id: "crimson-scout",
      faction: "crimson",
      role: "ranger",
      position: { x: origin.x, z: origin.z - 7.5 },
    });
    const initial = createBattleState([enemy]);

    const next = stepBattle(initial, 0.1);

    expect(next.units[0]?.health).toBe(enemy.health);
    expect(castle(next, "verdant").castleCombat?.activatedAt).toBeNull();
    expect(next.events.some((event) => (
      event.type === "attack-started" && event.attackerId === "verdant-castle"
    ))).toBe(false);
  });

  it("activates once on first damage, retaliates, and never returns to dormancy", () => {
    const origin = castleWorld("verdant");
    const attacker = createBattleUnit({
      id: "crimson-waker",
      faction: "crimson",
      role: "knight",
      position: { x: origin.x, z: origin.z - 1 },
    });
    const first = stepBattle(createBattleState([attacker]), 0.1);
    const activatedAt = castle(first, "verdant").castleCombat?.activatedAt;

    expect(activatedAt).toBeCloseTo(0.1);
    expect(first.events.filter((event) => event.type === "castle-activated"))
      .toHaveLength(1);
    expect(first.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: "verdant-castle",
      targetId: attacker.id,
      targetType: "unit",
    }));
    expect(first.units[0]?.health).toBe(
      attacker.health - GAME_RULES.castle.damage * (1 - UNIT_SPECS.knight.damageReduction),
    );

    let quiet: BattleState = {
      ...first,
      units: first.units.map((unit) => ({ ...unit, position: { x: 0, z: 0 } })),
    };
    for (let index = 0; index < 10; index += 1) quiet = stepBattle(quiet, 0.1);
    expect(castle(quiet, "verdant").castleCombat?.activatedAt).toBe(activatedAt);
    expect(quiet.events.filter((event) => event.type === "castle-activated"))
      .toHaveLength(1);
  });

  it("attacks the nearest enemy and breaks equal-distance ties by stable id", () => {
    const origin = castleWorld("verdant");
    const second = createBattleUnit({
      id: "crimson-b",
      faction: "crimson",
      role: "knight",
      position: { x: origin.x - 3, z: origin.z - 4 },
    });
    const first = createBattleUnit({
      id: "crimson-a",
      faction: "crimson",
      role: "knight",
      position: { x: origin.x + 3, z: origin.z - 4 },
    });
    const state = activateCastle(createBattleState([second, first]), "verdant");

    const next = stepBattle(state, 0.1);

    expect(next.units.find((unit) => unit.id === first.id)?.health)
      .toBe(first.health - GAME_RULES.castle.damage * (1 - UNIT_SPECS.knight.damageReduction));
    expect(next.units.find((unit) => unit.id === second.id)?.health).toBe(second.health);
  });

  it("does not retaliate after being destroyed in the same fixed step", () => {
    const origin = castleWorld("verdant");
    const attacker = createBattleUnit({
      id: "crimson-finisher",
      faction: "crimson",
      role: "knight",
      position: { x: origin.x, z: origin.z - 1 },
    });
    const state = activateCastle(createBattleState([attacker]), "verdant", 1);

    const next = stepBattle(state, 0.1);

    expect(castle(next, "verdant").health).toBe(0);
    expect(next.units[0]?.health).toBe(attacker.health);
    expect(next.winner).toBe("crimson");
  });

  it("creates a terminal barrier before surviving castles, economy, or barracks advance", () => {
    const verdantCastle = castleWorld("verdant");
    const crimsonCastle = castleWorld("crimson");
    const finisher = createBattleUnit({
      id: "crimson-finisher",
      faction: "crimson",
      role: "knight",
      position: { x: verdantCastle.x, z: verdantCastle.z - 1 },
    });
    const wouldBeCastleTarget = createBattleUnit({
      id: "verdant-survivor",
      faction: "verdant",
      role: "ranger",
      position: { x: crimsonCastle.x, z: crimsonCastle.z + 7.5 },
    });
    const barracks = createBattleBuilding({
      id: "verdant-barracks",
      kind: "barracks",
      faction: "verdant",
      coordinate: { q: -5, r: 6 },
      createdAt: 0,
    });
    let state = activateCastle(
      createBattleState([finisher, wouldBeCastleTarget]),
      "verdant",
      1,
    );
    state = activateCastle(state, "crimson");
    state = {
      ...state,
      buildings: [...state.buildings, barracks],
      elapsed: 4.9,
      matchElapsed: 4.9,
    };

    const next = stepBattle(state, 0.1);

    expect(next.winner).toBe("crimson");
    expect(next.units.find((unit) => unit.id === wouldBeCastleTarget.id)?.health)
      .toBe(wouldBeCastleTarget.health);
    expect(next.units.some((unit) => unit.id.startsWith(`${barracks.id}-`))).toBe(false);
    expect(next.events.some((event) => event.type === "building-unit-spawned")).toBe(false);
    expect(next.economy).toEqual(state.economy);
  });

  it("draws when both castles are destroyed in the same fixed step and freezes the result", () => {
    const verdantCastle = castleWorld("verdant");
    const crimsonCastle = castleWorld("crimson");
    const verdant = createBattleUnit({
      id: "verdant-finisher",
      faction: "verdant",
      role: "knight",
      position: { x: crimsonCastle.x, z: crimsonCastle.z + 1 },
    });
    const crimson = createBattleUnit({
      id: "crimson-finisher",
      faction: "crimson",
      role: "knight",
      position: { x: verdantCastle.x, z: verdantCastle.z - 1 },
    });
    let state = activateCastle(createBattleState([verdant, crimson]), "verdant", 1);
    state = activateCastle(state, "crimson", 1);

    const resolved = stepBattle(state, 0.1);
    const frozen = stepBattle(resolved, 0.1);

    expect(castle(resolved, "verdant").health).toBe(0);
    expect(castle(resolved, "crimson").health).toBe(0);
    expect(resolved.winner).toBe("draw");
    expect(frozen.matchElapsed).toBe(resolved.matchElapsed);
    expect(frozen.units).toEqual(resolved.units);
    expect(frozen.economy).toEqual(resolved.economy);
  });

  it.each([
    { faction: "verdant" as const, verdantHealth: 1_400, crimsonHealth: 900 },
    { faction: "crimson" as const, verdantHealth: 750, crimsonHealth: 1_250 },
  ])("awards a timeout victory to the healthier $faction castle", ({
    faction,
    verdantHealth,
    crimsonHealth,
  }) => {
    let state = createBattleState([]);
    state = setCastleHealth(state, "verdant", verdantHealth);
    state = setCastleHealth(state, "crimson", crimsonHealth);
    state = {
      ...state,
      matchElapsed: MATCH_POLICIES.normal.durationSeconds - 0.05,
    };

    const resolved = stepBattle(state, 0.1);
    const frozen = stepBattle(resolved, 0.1);

    expect(resolved.matchElapsed).toBe(MATCH_POLICIES.normal.durationSeconds);
    expect(resolved.winner).toBe(faction);
    expect(resolved.resolvedAt).toBe(resolved.elapsed);
    expect(frozen.matchElapsed).toBe(resolved.matchElapsed);
    expect(frozen.economy).toEqual(resolved.economy);
  });

  it.each([
    { mode: "campaign", policy: MATCH_POLICIES.campaign },
    { mode: "normal", policy: MATCH_POLICIES.normal },
    { mode: "arena", policy: MATCH_POLICIES.arena },
  ])("resolves $mode at its configured time by castle health", ({ policy }) => {
    let state = createBattleState([], { matchPolicy: policy });
    state = setCastleHealth(state, "verdant", 1_300);
    state = setCastleHealth(state, "crimson", 900);
    state = {
      ...state,
      matchElapsed: policy.durationSeconds - 0.05,
    };

    const resolved = stepBattle(state, 0.1);

    expect(resolved.matchElapsed).toBe(policy.durationSeconds);
    expect(resolved.winner).toBe("verdant");
  });

  it("does not time out an unlimited battle but still ends when a castle falls", () => {
    const origin = castleWorld("verdant");
    const attacker = createBattleUnit({
      id: "infinite-crimson-finisher",
      faction: "crimson",
      role: "knight",
      position: { x: origin.x, z: origin.z - 1 },
    });
    const longRunning = stepBattle({
      ...createBattleState([], { matchPolicy: MATCH_POLICIES.infinite }),
      elapsed: 600,
      matchElapsed: 600,
    }, 0.1);
    const finishingState = activateCastle(
      createBattleState([attacker], { matchPolicy: MATCH_POLICIES.infinite }),
      "verdant",
      1,
    );
    const finished = stepBattle(finishingState, 0.1);

    expect(longRunning.matchElapsed).toBeCloseTo(600.1);
    expect(longRunning.winner).toBeNull();
    expect(finished.winner).toBe("crimson");
  });
});
