import { describe, expect, it } from "vitest";

import {
  BATTLE_MODE_DEFINITIONS,
  battleModeDefinitionFor,
  LEGACY_ECONOMY_POLICY,
  populationIncomeMultiplier,
  SANDBOX_ECONOMY_POLICY,
} from "../../src/game/battleMode";
import { BATTLE_MATCH_MODES, MATCH_POLICIES } from "../../src/game/rules";

describe("battle mode definitions", () => {
  it("registers sandbox independently from the internal unlimited legacy mode", () => {
    expect(BATTLE_MATCH_MODES).toContain("sandbox");
    expect(MATCH_POLICIES.sandbox).not.toBe(MATCH_POLICIES.infinite);
    expect(MATCH_POLICIES.sandbox).toEqual({
      mode: "sandbox",
      durationSeconds: null,
      finalBonus: null,
      timeoutResolution: null,
    });

    const sandbox = battleModeDefinitionFor("sandbox");
    expect(sandbox).toMatchObject({
      id: "sandbox",
      defaultMapId: "legacy-v1",
      economyPolicy: SANDBOX_ECONOMY_POLICY,
      buildingLifecyclePolicy: {
        naturalDecay: "disabled",
        construction: "timed",
        repair: "disabled",
      },
      acquisitionPolicy: { kind: "production-buildings" },
      productionPolicy: {
        kind: "building-queue",
        queueDiscipline: "fifo",
        maximumQueueLength: 3,
        reservesPopulation: true,
        blockedExit: "wait",
      },
      controlAuthority: { kind: "issued-orders" },
      opponentPolicy: { kind: "sandbox-rts-ai" },
      victoryPolicy: { kind: "castle-and-resource-stalemate" },
      uiLayout: { kind: "sandbox-rts" },
    });
  });

  it("keeps every legacy mode explicitly on the old economy and play model", () => {
    for (const id of ["campaign", "normal", "arena", "infinite"] as const) {
      expect(battleModeDefinitionFor(id)).toMatchObject({
        id,
        defaultMapId: "legacy-v1",
        economyPolicy: LEGACY_ECONOMY_POLICY,
        populationPolicy: { kind: "unlimited", incomeMultiplier: 1 },
        buildingLifecyclePolicy: {
          naturalDecay: "enabled",
          construction: "instant",
        },
        acquisitionPolicy: { kind: "direct-deployment" },
        productionPolicy: { kind: "legacy-auto-spawn" },
        controlAuthority: { kind: "automatic" },
        opponentPolicy: { kind: "legacy-deployment-ai" },
        uiLayout: { kind: "deployment-rail" },
      });
    }
  });

  it("locks the sandbox wallet, population cap, and squad population costs", () => {
    expect(SANDBOX_ECONOMY_POLICY).toEqual({
      initialGold: 1_000,
      maximumGold: 5_000,
      goldStep: 20,
      passiveIncome: { kind: "disabled" },
    });
    expect(battleModeDefinitionFor("sandbox").populationPolicy).toEqual({
      kind: "capped",
      maximumPopulation: 100,
      troopCosts: {
        spearman: 2,
        swordsman: 3,
        archer: 2,
        mage: 2,
        catapult: 3,
      },
      populationIncomeBands: [
        { maximumPopulation: 50, multiplier: 1 },
        { maximumPopulation: 80, multiplier: 0.8 },
        { maximumPopulation: 100, multiplier: 0.6 },
      ],
    });
  });

  it.each([
    [0, 1],
    [50, 1],
    [51, 0.8],
    [80, 0.8],
    [81, 0.6],
    [100, 0.6],
  ])("uses the correct sandbox income band at population %i", (population, expected) => {
    expect(populationIncomeMultiplier("sandbox", population)).toBe(expected);
  });

  it("has no hidden upkeep in legacy modes", () => {
    expect(populationIncomeMultiplier("campaign", 100)).toBe(1);
    expect(populationIncomeMultiplier("normal", 100)).toBe(1);
    expect(populationIncomeMultiplier("arena", 100)).toBe(1);
    expect(populationIncomeMultiplier("infinite", 100)).toBe(1);
  });

  it("exposes an immutable registry and fails fast for unknown ids", () => {
    expect(Object.isFrozen(BATTLE_MODE_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(battleModeDefinitionFor("sandbox"))).toBe(true);
    expect(Object.isFrozen(SANDBOX_ECONOMY_POLICY)).toBe(true);
    expect(() => battleModeDefinitionFor("unknown" as never))
      .toThrow("Unknown battle mode: unknown");
  });
});
