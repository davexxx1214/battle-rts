import { describe, expect, it } from "vitest";

import {
  GAME_RULES,
  TROOP_ROLE_BY_DEPLOYABLE,
  UNIT_SPECS,
  validateGameRules,
  type GameRules,
} from "../../src/game/rules";

describe("central game rules", () => {
  it("accepts the stage zero baseline as a valid configuration", () => {
    expect(validateGameRules(GAME_RULES)).toEqual([]);
  });

  it("keeps every deployment cost within the agreed 100-gold steps", () => {
    for (const cost of Object.values(GAME_RULES.deployment.costs)) {
      expect(cost).toBeGreaterThanOrEqual(100);
      expect(cost).toBeLessThanOrEqual(1000);
      expect(cost % 100).toBe(0);
    }
  });

  it("stores the first playable mine and barracks production baselines", () => {
    expect(GAME_RULES.buildings.destructionSeconds).toBe(0.8);
    expect(GAME_RULES.buildings.goldMine).toMatchObject({
      cost: 700,
      maxHealth: 900,
      lifetimeSeconds: 36,
      firstProductionSeconds: 4,
      productionIntervalSeconds: 4,
      goldPerProduction: 100,
      maximumActivePerFaction: 1,
    });
    expect(GAME_RULES.buildings.barracks).toMatchObject({
      cost: 700,
      maxHealth: 1200,
      lifetimeSeconds: 30,
      firstSpawnSeconds: 5,
      spawnIntervalSeconds: 10,
      spawnCount: 3,
      maximumActivePerFaction: 2,
    });
  });

  it("keeps every current combat role in the same tunable rules module", () => {
    expect(new Set(Object.keys(UNIT_SPECS))).toEqual(
      new Set(["knight", "ranger", "mage", "catapult"]),
    );
    for (const spec of Object.values(UNIT_SPECS)) {
      expect(spec.maxHealth).toBeGreaterThan(0);
      expect(spec.damage).toBeGreaterThan(0);
      expect(spec.attackCooldown).toBeGreaterThan(0);
      expect(spec.moveSpeed).toBeGreaterThan(0);
    }
  });

  it("maps every deployable troop name to one existing combat role", () => {
    expect(TROOP_ROLE_BY_DEPLOYABLE).toEqual({
      swordsman: "knight",
      archer: "ranger",
      mage: "mage",
      catapult: "catapult",
    });
    expect(TROOP_ROLE_BY_DEPLOYABLE[GAME_RULES.buildings.barracks.spawnedUnit])
      .toBe("knight");
  });

  it("rejects invalid balance edits without restricting values to literal baselines", () => {
    const tunable: GameRules = {
      ...GAME_RULES,
      economy: { ...GAME_RULES.economy, maximumGold: 900 },
      deployment: {
        costs: { ...GAME_RULES.deployment.costs, swordsman: 400 },
      },
    };
    expect(validateGameRules(tunable)).toEqual([]);

    const invalid: GameRules = {
      ...tunable,
      economy: { ...tunable.economy, maximumGold: 950 },
      deployment: {
        costs: { ...tunable.deployment.costs, swordsman: 50 },
      },
    };
    expect(validateGameRules(invalid)).toEqual(expect.arrayContaining([
      "economy.maximumGold must be a multiple of 100",
      "deployment.costs.swordsman must be a multiple of 100 from 100 to 1000",
      "swordsman cost must be from 200 to 700",
    ]));
  });
});
