import { describe, expect, it } from "vitest";

import {
  advanceEconomy,
  createEconomyState,
  grantGold,
  getMatchResourceMultiplier,
  getPassiveRecoveryWaitSeconds,
  getMatchClock,
  trySpendGold,
  type EconomyState,
} from "../../src/game/economy";
import { SANDBOX_ECONOMY_POLICY } from "../../src/game/battleMode";
import { MATCH_POLICIES } from "../../src/game/rules";

describe("gold economy", () => {
  it("reports passive recovery wait in complete gold ticks and honors saved progress", () => {
    expect(getPassiveRecoveryWaitSeconds(100, "normal")).toBeCloseTo(2.8);
    expect(getPassiveRecoveryWaitSeconds(101, "normal")).toBeCloseTo(5.6);
    expect(getPassiveRecoveryWaitSeconds(101, "normal", 0.5)).toBeCloseTo(4.2);
    expect(getPassiveRecoveryWaitSeconds(100, "double")).toBeCloseTo(1.4);
  });

  it("starts both factions at 500 gold and awards 100 after 2.8 seconds", () => {
    const initial = createEconomyState();
    const result = advanceEconomy(initial, 0, 2.8);

    expect(initial.accounts.verdant.gold).toBe(500);
    expect(initial.accounts.crimson.gold).toBe(500);
    expect(result.state.accounts.verdant.gold).toBe(600);
    expect(result.state.accounts.crimson.gold).toBe(600);
    expect(result.state.accounts.verdant.recoveryProgress).toBeCloseTo(0);
  });

  it("preserves fractional recovery progress when campaign double gold starts", () => {
    const initial = createEconomyState();
    const policy = MATCH_POLICIES.campaign;
    const doubleGoldStartsAt = policy.durationSeconds
      - policy.finalBonus.startsAtRemainingSeconds;
    const nearBoundary: EconomyState = {
      ...initial,
      accounts: {
        verdant: { ...initial.accounts.verdant, recoveryProgress: 0.5 },
        crimson: { ...initial.accounts.crimson, recoveryProgress: 0.5 },
      },
    };

    const result = advanceEconomy(
      nearBoundary,
      doubleGoldStartsAt - 1.4,
      2.1,
      policy,
    );

    expect(getMatchClock(doubleGoldStartsAt + 0.7, policy).phase).toBe("bonus");
    expect(result.state.accounts.verdant.gold).toBe(600);
    expect(result.state.accounts.verdant.recoveryProgress).toBeCloseTo(0.5);
  });

  it("produces identical state for one large update and many small updates", () => {
    const starting = createEconomyState();
    const large = advanceEconomy(starting, 117.4, 5.6, MATCH_POLICIES.campaign).state;
    let small = starting;
    let elapsed = 117.4;
    for (let index = 0; index < 56; index += 1) {
      small = advanceEconomy(small, elapsed, 0.1, MATCH_POLICIES.campaign).state;
      elapsed += 0.1;
    }

    expect(small.accounts.verdant.gold).toBe(large.accounts.verdant.gold);
    expect(small.accounts.crimson.gold).toBe(large.accounts.crimson.gold);
    expect(small.accounts.verdant.recoveryProgress)
      .toBeCloseTo(large.accounts.verdant.recoveryProgress, 10);
  });

  it("caps gold without repeating the full prompt until gold is spent", () => {
    const firstFull = advanceEconomy(createEconomyState(), 0, 14).state;
    const stillFull = advanceEconomy(firstFull, 14, 14).state;

    expect(firstFull.accounts.verdant).toMatchObject({
      gold: 1000,
      isFull: true,
      fullPromptSequence: 1,
    });
    expect(stillFull.accounts.verdant).toMatchObject({
      gold: 1000,
      isFull: true,
      fullPromptSequence: 1,
    });

    const spent = trySpendGold(stillFull, "verdant", 100);
    expect(spent.spent).toBe(true);
    expect(spent.state.accounts.verdant.isFull).toBe(false);
    const refilled = advanceEconomy(spent.state, 28, 2.8).state;
    expect(refilled.accounts.verdant).toMatchObject({
      gold: 1000,
      isFull: true,
      fullPromptSequence: 2,
    });
  });

  it("clamps the three-minute campaign clock and stops passive recovery", () => {
    const policy = MATCH_POLICIES.campaign;
    const duration = policy.durationSeconds;
    const doubleGoldStartsAt = duration - policy.finalBonus.startsAtRemainingSeconds;
    expect(getMatchClock(doubleGoldStartsAt - 0.5, policy)).toMatchObject({
      phase: "normal",
      remainingSeconds: duration - doubleGoldStartsAt + 0.5,
    });
    const bonusClock = getMatchClock(doubleGoldStartsAt, policy);
    expect(bonusClock).toMatchObject({
      phase: "bonus",
      remainingSeconds: duration - doubleGoldStartsAt,
      activeBonus: policy.finalBonus,
    });
    expect(getMatchResourceMultiplier(bonusClock, "gold")).toBe(2);
    expect(getMatchResourceMultiplier(bonusClock, "experience")).toBe(1);
    expect(getMatchClock(duration + 1, policy)).toMatchObject({
      phase: "bonus",
      remainingSeconds: 0,
      timedOut: true,
    });

    const initial = createEconomyState();
    const result = advanceEconomy(initial, duration - 0.5, 20, policy).state;
    expect(result.accounts.verdant.gold).toBe(500);
    expect(result.accounts.verdant.recoveryProgress).toBeCloseTo(0.5 / 1.4);
  });

  it.each([MATCH_POLICIES.normal, MATCH_POLICIES.arena])(
    "keeps gold recovery normal during $mode double experience",
    (policy) => {
      const bonusStartsAt = policy.durationSeconds
        - policy.finalBonus.startsAtRemainingSeconds;
      const clock = getMatchClock(bonusStartsAt, policy);
      const result = advanceEconomy(
        createEconomyState(),
        bonusStartsAt - 1.4,
        2.8,
        policy,
      ).state;

      expect(clock.activeBonus).toMatchObject({ resource: "experience", multiplier: 2 });
      expect(getMatchResourceMultiplier(clock, "experience")).toBe(2);
      expect(getMatchResourceMultiplier(clock, "gold")).toBe(1);
      expect(result.accounts.verdant.gold).toBe(600);
      expect(result.accounts.verdant.recoveryProgress).toBeCloseTo(0);
    },
  );

  it("keeps an unlimited clock and economy advancing beyond five minutes", () => {
    const clock = getMatchClock(600, MATCH_POLICIES.infinite);
    const result = advanceEconomy(
      createEconomyState(),
      300,
      2.8,
      MATCH_POLICIES.infinite,
    ).state;

    expect(clock).toMatchObject({
      elapsedSeconds: 600,
      remainingSeconds: null,
      activeBonus: null,
      timedOut: false,
    });
    expect(result.accounts.verdant.gold).toBe(600);
  });

  it("rejects spending that would break the 100-gold economy steps", () => {
    const initial = createEconomyState();
    expect(trySpendGold(initial, "verdant", 50)).toEqual({ state: initial, spent: false });
    expect(trySpendGold(initial, "verdant", 600)).toEqual({ state: initial, spent: false });
  });

  it("starts sandbox at 1000 and explicitly disables passive income", () => {
    const initial = createEconomyState(SANDBOX_ECONOMY_POLICY);
    const advanced = advanceEconomy(
      initial,
      0,
      600,
      MATCH_POLICIES.sandbox,
      SANDBOX_ECONOMY_POLICY,
    );

    expect(initial.accounts.verdant.gold).toBe(1_000);
    expect(initial.accounts.crimson.gold).toBe(1_000);
    expect(advanced.state).toBe(initial);
    expect(advanced.newlyFullFactions).toEqual([]);
  });

  it("uses 20-gold wallet steps and a 5000 cap for sandbox mine income", () => {
    const initial = createEconomyState(SANDBOX_ECONOMY_POLICY);
    const spent = trySpendGold(initial, "verdant", 60, SANDBOX_ECONOMY_POLICY);
    expect(spent.spent).toBe(true);
    expect(spent.state.accounts.verdant.gold).toBe(940);
    expect(trySpendGold(initial, "verdant", 50, SANDBOX_ECONOMY_POLICY).spent)
      .toBe(false);

    const nearCap: EconomyState = {
      ...initial,
      accounts: {
        ...initial.accounts,
        verdant: { ...initial.accounts.verdant, gold: 4_980 },
      },
    };
    const grant = grantGold(nearCap, "verdant", 80, SANDBOX_ECONOMY_POLICY);
    expect(grant).toMatchObject({
      creditedAmount: 20,
      wastedAmount: 60,
      becameFull: true,
    });
    expect(grant.state.accounts.verdant.gold).toBe(5_000);
  });
});
