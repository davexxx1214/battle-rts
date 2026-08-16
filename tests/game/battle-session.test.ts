import { describe, expect, it } from "vitest";

import { createBattleState, createBattleUnit, createInitialBattle } from "../../src/game/battle";
import {
  advanceBattleSession,
  beginBattleSession,
  getBattlePhaseAccess,
} from "../../src/game/battleSession";
import { DEFAULT_AI_DIFFICULTY } from "../../src/game/rules";

describe("battle session gate", () => {
  it("creates isolated clean state for repeated battle restarts", () => {
    const restarts = [createInitialBattle(), createInitialBattle(), createInitialBattle()];

    expect(restarts[1]).toEqual(restarts[0]);
    expect(restarts[2]).toEqual(restarts[0]);
    expect(restarts[1]).not.toBe(restarts[0]);
    for (const battle of restarts) {
      expect(battle.elapsed).toBe(0);
      expect(battle.events).toEqual([]);
      expect(battle.buildingOccupancy).toEqual({});
      expect(battle.buildings.every((building) => (
        building.kind === "castle" || building.kind === "arrow-tower"
      ))).toBe(true);
      expect(battle.units.every((unit) => (
        unit.behavior === "charging" && unit.currentTarget === null && unit.health > 0
      ))).toBe(true);
    }
  });

  it("keeps the battle frozen until the player engages", () => {
    const initial = createInitialBattle();

    expect(advanceBattleSession(initial, "briefing", 4, 0.05)).toBe(initial);

    const engaged = advanceBattleSession(initial, "engaged", 4, 0.05);
    expect(engaged.elapsed).toBeCloseTo(0.2);
    expect(engaged.revision).toBeGreaterThan(initial.revision);
  });

  it("allows inspection before engagement and deployment only after engagement", () => {
    expect(getBattlePhaseAccess("briefing")).toEqual({
      inspectField: true,
      deployEntities: false,
    });
    expect(getBattlePhaseAccess("engaged")).toEqual({
      inspectField: true,
      deployEntities: true,
    });
  });

  it("starts automatic combat without applying player commands", () => {
    const friendly = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const enemy = createBattleUnit({
      id: "c-1",
      faction: "crimson",
      role: "knight",
      position: { x: 5, z: 0 },
    });

    const engaged = beginBattleSession({
      battle: createBattleState([friendly, enemy]),
      phase: "briefing",
    });

    expect(engaged.phase).toBe("engaged");
    expect(engaged.battle.units.find((unit) => unit.id === friendly.id)?.behavior)
      .toBe("charging");
  });

  it("uses the easy opponent by default and waits four seconds for its opening decision", () => {
    const initial = createBattleState([]);

    expect(DEFAULT_AI_DIFFICULTY).toBe("easy");
    const beforeDecision = advanceBattleSession(initial, "engaged", 79, 0.05);
    const afterDecision = advanceBattleSession(initial, "engaged", 80, 0.05);

    expect(beforeDecision.deploymentCounts.crimson.swordsman).toBe(0);
    expect(afterDecision.deploymentCounts.crimson.swordsman).toBe(1);
    expect(afterDecision.buildings.some(({ faction, kind }) => (
      faction === "crimson" && (kind === "gold-mine" || kind === "barracks")
    ))).toBe(false);
  });

  it("runs hard opponent decisions on the original one-second boundaries", () => {
    const initial = createBattleState([]);

    const advanced = advanceBattleSession(initial, "engaged", 120, 0.05, "hard");

    expect(advanced.matchElapsed).toBeCloseTo(6);
    expect(advanced.buildings).toContainEqual(expect.objectContaining({
      faction: "crimson",
      kind: "gold-mine",
    }));
    expect(advanced.economy.accounts.crimson.gold).toBe(0);
  });

  it("keeps opponent decisions identical across render-frame batching", () => {
    const initial = createBattleState([]);

    const continuous = advanceBattleSession(initial, "engaged", 120, 0.05);
    const firstHalf = advanceBattleSession(initial, "engaged", 60, 0.05);
    const split = advanceBattleSession(firstHalf, "engaged", 60, 0.05);

    expect(split).toEqual(continuous);
  });
});
