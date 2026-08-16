import { describe, expect, it } from "vitest";

import {
  getTroopBalanceProfiles,
  runBalanceArenaMatch,
  summarizeBalanceArena,
} from "../../src/game/balanceArena";

describe("headless balance arena", () => {
  it("gives both sides equal starting gold and purchases whole squads through normal deployment", () => {
    const result = runBalanceArenaMatch({
      verdant: "swordsman",
      crimson: "archer",
      initialGold: 1000,
      durationSeconds: 3,
      deploymentIntervalSeconds: 1,
      lane: "west",
    });

    expect(result.spentGold).toEqual({ verdant: 800, crimson: 900 });
    expect(result.spawnedUnits).toEqual({ verdant: 6, crimson: 6 });
    expect(result.deployments).toEqual({ verdant: 2, crimson: 3 });
  });

  it("is deterministic for identical arena configuration", () => {
    const config = {
      verdant: "mage" as const,
      crimson: "catapult" as const,
      initialGold: 1000,
      durationSeconds: 8,
      deploymentIntervalSeconds: 1,
      lane: "east" as const,
    };

    expect(runBalanceArenaMatch(config)).toEqual(runBalanceArenaMatch(config));
  });

  it("summarizes empirical and configured per-gold value without hidden constants", () => {
    const match = runBalanceArenaMatch({
      verdant: "swordsman",
      crimson: "mage",
      initialGold: 1000,
      durationSeconds: 4,
      deploymentIntervalSeconds: 1,
      lane: "west",
    });
    const summaries = summarizeBalanceArena([match]);
    const profiles = getTroopBalanceProfiles();

    expect(summaries.find((summary) => summary.kind === "swordsman"))
      .toMatchObject({ matches: 1, spentGold: match.spentGold.verdant });
    expect(profiles.map((profile) => profile.kind))
      .toEqual(["archer", "swordsman", "mage", "catapult"]);
    expect(profiles.map((profile) => profile.additionalRecoveryWaitSeconds))
      .toEqual([0, 2.8, 8.4, 14]);
    expect(profiles.every((profile) => (
      profile.squadSize > 0
      && profile.totalHealthPer100Gold > 0
      && profile.singleTargetDpsPer100Gold > 0
    ))).toBe(true);
  });

  it("fails fast on invalid arena parameters instead of silently changing the experiment", () => {
    expect(() => runBalanceArenaMatch({
      verdant: "swordsman",
      crimson: "archer",
      durationSeconds: 0,
    })).toThrow("durationSeconds must be positive");
    expect(() => runBalanceArenaMatch({
      verdant: "swordsman",
      crimson: "archer",
      initialGold: 1100,
    })).toThrow("initialGold must be between zero");
  });
});
