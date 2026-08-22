import { describe, expect, it } from "vitest";

import {
  aiTroopCycleForRace,
  barracksDesignForRace,
  barracksRulesForRace,
  BARRACKS_RULES_BY_RACE,
  deploymentCostForRace,
  GAME_RULES,
  MATCH_POLICIES,
  TROOP_KINDS,
  TROOP_ROLE_BY_DEPLOYABLE,
  UNDEAD_TROOP_COUNTS,
  UNDEAD_TROOP_DESIGNS,
  UNDEAD_TROOP_ROLE_BY_DEPLOYABLE,
  UNDEAD_UNIT_SPECS,
  UNIT_SPECS,
  troopCountForDeployment,
  troopDesignForRace,
  unitRoleForDeployment,
  unitRoleForRace,
  unitSpecFor,
  validateGameRules,
  type GameRules,
} from "../../src/game/rules";

describe("central game rules", () => {
  it("accepts the stage zero baseline as a valid configuration", () => {
    expect(validateGameRules(GAME_RULES)).toEqual([]);
  });

  it("defines mode-specific clocks, final bonuses, and a serializable unlimited policy", () => {
    expect(MATCH_POLICIES.campaign).toMatchObject({
      durationSeconds: 180,
      finalBonus: {
        resource: "gold",
        multiplier: 2,
        startsAtRemainingSeconds: 60,
      },
      timeoutResolution: "castle-health",
    });
    for (const policy of [MATCH_POLICIES.normal, MATCH_POLICIES.arena]) {
      expect(policy).toMatchObject({
        durationSeconds: 300,
        finalBonus: {
          resource: "experience",
          multiplier: 2,
          startsAtRemainingSeconds: 60,
        },
        timeoutResolution: "castle-health",
      });
    }
    expect(MATCH_POLICIES.infinite).toEqual({
      mode: "infinite",
      durationSeconds: null,
      finalBonus: null,
      timeoutResolution: null,
    });
    expect(JSON.parse(JSON.stringify(MATCH_POLICIES.infinite)))
      .toEqual(MATCH_POLICIES.infinite);
  });

  it("rejects finite and unlimited policy shapes that contradict their clocks", () => {
    const invalid: GameRules = {
      ...GAME_RULES,
      match: {
        ...GAME_RULES.match,
        campaign: { ...MATCH_POLICIES.campaign, durationSeconds: 0 },
        infinite: {
          ...MATCH_POLICIES.infinite,
          finalBonus: MATCH_POLICIES.campaign.finalBonus,
        },
      },
    };

    expect(validateGameRules(invalid)).toEqual(expect.arrayContaining([
      "match.campaign.durationSeconds must be positive or null",
      "match.infinite.finalBonus must be null when the match is unlimited",
    ]));
  });

  it("keeps every deployment cost within the agreed 100-gold steps", () => {
    const costs = [
      ...Object.values(GAME_RULES.deployment.costs),
      ...Object.values(BARRACKS_RULES_BY_RACE).map(({ cost }) => cost),
    ];
    for (const cost of costs) {
      expect(cost).toBeGreaterThanOrEqual(100);
      expect(cost).toBeLessThanOrEqual(1000);
      expect(cost % 100).toBe(0);
    }
  });

  it("stores direct troop purchases as fixed squads instead of single units", () => {
    expect(GAME_RULES.deployment.costs).toMatchObject({
      spearman: 200,
      swordsman: 400,
      archer: 300,
      mage: 600,
      catapult: 800,
    });
    expect(GAME_RULES.deployment.troopCounts).toEqual({
      spearman: 2,
      swordsman: 3,
      archer: 2,
      mage: 2,
      catapult: 1,
    });
  });

  it("stores the first playable mine and barracks production baselines", () => {
    expect(GAME_RULES.buildings.destructionSeconds).toBe(0.8);
    expect(GAME_RULES.deployment.costs.barracks).toBe(500);
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
      cost: 500,
      maxHealth: 1200,
      lifetimeSeconds: 30,
      firstSpawnSeconds: 5,
      spawnIntervalSeconds: 8,
      spawnCount: 4,
      maximumActivePerFaction: 2,
    });

    const directSwordsmanCost = GAME_RULES.deployment.costs.swordsman
      / GAME_RULES.deployment.troopCounts.swordsman;
    const barracksSwordsmanCost = GAME_RULES.buildings.barracks.cost
      / GAME_RULES.buildings.barracks.spawnCount;
    expect(directSwordsmanCost / barracksSwordsmanCost).toBeCloseTo(16 / 15);
    const swordsmanEmpiricalDamagePer100Gold = 71.799;
    const barracksEmpiricalDamagePer100Gold = swordsmanEmpiricalDamagePer100Gold
      * (GAME_RULES.buildings.barracks.spawnCount
        / GAME_RULES.deployment.troopCounts.swordsman)
      * (GAME_RULES.deployment.costs.swordsman
        / GAME_RULES.buildings.barracks.cost);
    expect(barracksEmpiricalDamagePer100Gold).toBeCloseTo(76.586, 3);
    expect(
      GAME_RULES.buildings.barracks.firstSpawnSeconds
      + (GAME_RULES.buildings.barracks.spawnCount - 1)
        * GAME_RULES.buildings.barracks.spawnIntervalSeconds,
    ).toBe(29);
  });

  it("stores the deployable guard tower separately from permanent castle towers", () => {
    expect(GAME_RULES.deployment.costs["guard-tower"]).toBe(300);
    expect(GAME_RULES.buildings.guardTower).toMatchObject({
      cost: 300,
      maxHealth: 450,
      lifetimeSeconds: 20,
      damage: 7,
      attackRange: 7,
      attackCooldown: 1.35,
      projectileSpeed: 14,
      maximumActivePerFaction: 1,
    });
    expect(GAME_RULES.buildings.arrowTower).not.toHaveProperty("lifetimeSeconds");
  });

  it("keeps every current combat role in the same tunable rules module", () => {
    expect(new Set(Object.keys(UNIT_SPECS))).toEqual(
      new Set(["knight", "spearman", "ranger", "mage", "catapult", "bone-dragon"]),
    );
    for (const spec of Object.values(UNIT_SPECS)) {
      expect(spec.maxHealth).toBeGreaterThan(0);
      expect(spec.damage).toBeGreaterThan(0);
      expect(spec.damageReduction).toBeGreaterThanOrEqual(0);
      expect(spec.damageReduction).toBeLessThan(1);
      expect(spec.attackCooldown).toBeGreaterThan(0);
      expect(spec.moveSpeed).toBeGreaterThan(0);
      expect(["ground", "flying"]).toContain(spec.movementMode);
    }
  });

  it("gives the undead roster distinct roles, squad sizes, and combat identities", () => {
    expect(UNDEAD_TROOP_ROLE_BY_DEPLOYABLE).toEqual({
      spearman: "spearman",
      swordsman: "knight",
      archer: "ranger",
      mage: "mage",
      catapult: "bone-dragon",
    });
    expect(UNDEAD_TROOP_COUNTS).toEqual({
      spearman: 5,
      swordsman: 1,
      archer: 2,
      mage: 2,
      catapult: 1,
    });
    expect(Object.values(UNDEAD_TROOP_DESIGNS).map(({ name }) => name)).toEqual([
      "骸骨先锋",
      "墓穴卫士",
      "骸骨弩手",
      "亡魂术士",
      "冰霜骨龙",
    ]);
    expect(unitRoleForDeployment("catapult", "crimson", true)).toBe("bone-dragon");
    expect(unitRoleForDeployment("catapult", "verdant", true)).toBe("catapult");
    expect(troopCountForDeployment("spearman", "crimson", true)).toBe(5);
    expect(troopCountForDeployment("spearman", "verdant", true)).toBe(2);
  });

  it("uses undead-specific health, cadence, range, armor, and ground-dragon rules", () => {
    expect(UNDEAD_UNIT_SPECS.spearman.maxHealth).toBeLessThan(UNIT_SPECS.spearman.maxHealth);
    expect(UNDEAD_UNIT_SPECS.spearman.attackCooldown)
      .toBeLessThan(UNIT_SPECS.spearman.attackCooldown);
    expect(UNDEAD_UNIT_SPECS.knight.maxHealth).toBeGreaterThan(UNIT_SPECS.knight.maxHealth);
    expect(UNDEAD_UNIT_SPECS.knight).toMatchObject({
      maxHealth: 540,
      damage: 16,
    });
    expect(UNDEAD_UNIT_SPECS.knight.damageReduction)
      .toBeGreaterThan(UNIT_SPECS.knight.damageReduction);
    expect(UNDEAD_UNIT_SPECS.ranger.attackRange).toBeGreaterThan(UNIT_SPECS.ranger.attackRange);
    expect(UNDEAD_UNIT_SPECS.ranger.damage).toBeGreaterThan(UNIT_SPECS.ranger.damage);
    expect(UNDEAD_UNIT_SPECS.mage.splashRadius).toBeGreaterThan(UNIT_SPECS.mage.splashRadius);
    expect(UNDEAD_UNIT_SPECS.mage.attackRange).toBeLessThan(UNIT_SPECS.mage.attackRange);
    expect(unitSpecFor("bone-dragon", "undead")).toMatchObject({
      movementMode: "ground",
      attackMode: "cone",
      coneAngleDegrees: 52,
      maxHealth: 480,
      splashRadius: 0,
    });
    expect(unitSpecFor("bone-dragon", "undead").attackRange)
      .toBeLessThan(UNIT_SPECS.catapult.attackRange);
  });

  it("gives arrow towers one-quarter castle health and archer combat reach", () => {
    expect(GAME_RULES.buildings.arrowTower).toMatchObject({
      maxHealth: GAME_RULES.castle.maxHealth / 4,
      damage: UNIT_SPECS.ranger.damage,
      attackRange: UNIT_SPECS.ranger.attackRange,
      attackCooldown: UNIT_SPECS.ranger.attackCooldown,
      projectileSpeed: UNIT_SPECS.ranger.projectileSpeed,
    });
  });

  it("maps every deployable troop name to one existing combat role", () => {
    expect(new Set(TROOP_KINDS)).toEqual(
      new Set(["spearman", "swordsman", "archer", "mage", "catapult"]),
    );
    expect(TROOP_ROLE_BY_DEPLOYABLE).toEqual({
      spearman: "spearman",
      swordsman: "knight",
      archer: "ranger",
      mage: "mage",
      catapult: "catapult",
    });
    expect(unitRoleForRace(barracksDesignForRace("human").spawnedUnit, "human"))
      .toBe("knight");
  });

  it("keeps each race's troops, barracks, and AI cycle in one deployment catalog", () => {
    expect(troopDesignForRace("swordsman", "human").name).toBe("剑士");
    expect(troopDesignForRace("swordsman", "undead").name).toBe("墓穴卫士");
    expect(barracksDesignForRace("human")).toMatchObject({
      name: "兵营",
      productionVerb: "训练",
      spawnedUnit: "swordsman",
    });
    expect(barracksDesignForRace("undead")).toMatchObject({
      name: "墓穴兵营",
      productionVerb: "召唤",
      spawnedUnit: "swordsman",
    });
    expect(barracksRulesForRace("human")).toEqual({
      cost: 500,
      firstSpawnSeconds: 5,
      spawnIntervalSeconds: 8,
      spawnCount: 4,
    });
    expect(barracksRulesForRace("undead")).toEqual({
      cost: 700,
      firstSpawnSeconds: 6,
      spawnIntervalSeconds: 12,
      spawnCount: 2,
    });
    expect(deploymentCostForRace("barracks", "human")).toBe(500);
    expect(deploymentCostForRace("barracks", "undead")).toBe(700);
    expect(
      GAME_RULES.deployment.costs.swordsman
        / (barracksRulesForRace("undead").cost / barracksRulesForRace("undead").spawnCount),
    ).toBeCloseTo(8 / 7);
    expect(aiTroopCycleForRace("human", "hard")[0]).toBe("spearman");
    expect(aiTroopCycleForRace("undead", "hard")[0]).toBe("catapult");
  });

  it("keeps castle range at least as long as archers and mages without matching catapults", () => {
    expect(GAME_RULES.castle.attackRange).toBeGreaterThanOrEqual(
      Math.max(UNIT_SPECS.ranger.attackRange, UNIT_SPECS.mage.attackRange),
    );
    expect(GAME_RULES.castle.attackRange).toBeLessThan(UNIT_SPECS.catapult.attackRange);

    const invalid: GameRules = {
      ...GAME_RULES,
      castle: {
        ...GAME_RULES.castle,
        attackRange: UNIT_SPECS.ranger.attackRange - 0.1,
      },
    };
    expect(validateGameRules(invalid)).toContain(
      "castle.attackRange must reach ranger and mage attack ranges",
    );
  });

  it("keeps the first opponent AI strategy tunable in central rules", () => {
    expect(GAME_RULES.opponentAi).toEqual({
      strategies: {
        easy: {
          firstDecisionSeconds: 4,
          decisionIntervalSeconds: 24,
          buildingGoals: [],
          troopCycle: ["spearman", "archer", "swordsman"],
          deploymentPosture: "defensive",
        },
        normal: {
          firstDecisionSeconds: 1,
          decisionIntervalSeconds: 1,
          buildingGoals: [
            { kind: "gold-mine", desiredActive: 1 },
            { kind: "barracks", desiredActive: 1 },
            { kind: "guard-tower", desiredActive: 1 },
          ],
          troopCycle: ["spearman", "swordsman", "archer", "mage", "catapult"],
          deploymentPosture: "aggressive",
        },
        hard: {
          firstDecisionSeconds: 1,
          decisionIntervalSeconds: 1,
          buildingGoals: [
            { kind: "gold-mine", desiredActive: 1 },
            { kind: "barracks", desiredActive: 1 },
            { kind: "guard-tower", desiredActive: 1 },
          ],
          troopCycle: ["spearman", "swordsman", "archer", "mage", "catapult"],
          deploymentPosture: "aggressive",
        },
      },
    });

    const unreachable: GameRules = {
      ...GAME_RULES,
      opponentAi: {
        ...GAME_RULES.opponentAi,
        strategies: {
          ...GAME_RULES.opponentAi.strategies,
          hard: {
            ...GAME_RULES.opponentAi.strategies.hard,
            buildingGoals: [{
              kind: "gold-mine",
              desiredActive: GAME_RULES.buildings.goldMine.maximumActivePerFaction + 1,
            }],
          },
        },
      },
    };
    expect(validateGameRules(unreachable)).toContain(
      "opponent AI preferred buildings must not exceed active limits",
    );
  });

  it("rejects invalid balance edits without restricting values to literal baselines", () => {
    const tunable: GameRules = {
      ...GAME_RULES,
      economy: { ...GAME_RULES.economy, maximumGold: 900 },
      deployment: {
        ...GAME_RULES.deployment,
        costs: { ...GAME_RULES.deployment.costs, swordsman: 400 },
      },
    };
    expect(validateGameRules(tunable)).toEqual([]);

    const invalid: GameRules = {
      ...tunable,
      economy: { ...tunable.economy, maximumGold: 950 },
      deployment: {
        ...tunable.deployment,
        costs: { ...tunable.deployment.costs, swordsman: 50 },
      },
      targeting: { routeCorridorWidth: 0 },
    };
    expect(validateGameRules(invalid)).toEqual(expect.arrayContaining([
      "economy.maximumGold must be a multiple of 100",
      "deployment.costs.swordsman must be a multiple of 100 from 100 to 1000",
      "swordsman cost must be from 200 to 700",
      "targeting.routeCorridorWidth must be positive",
    ]));
  });
});
