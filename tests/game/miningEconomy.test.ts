import { describe, expect, it } from "vitest";

import {
  advanceSandboxMining,
  consumeEmergencyMinePermit,
  createSandboxMiningState,
  emergencyMinePermitEligibility,
  miningIncomeMultiplier,
  occupyMinePit,
  replaceMinePitState,
  vacateMinePit,
  type MineProductionSource,
  type MiningLedgerEvent,
  type MiningPopulationSnapshot,
  type SandboxMiningState,
} from "../../src/game/miningEconomy";
import type { Faction } from "../../src/game/types";

const PIT_ID = "P-W";
const MINE_ID = "verdant-mine-1";
const SOURCE: MineProductionSource = {
  pitId: PIT_ID,
  mineId: MINE_ID,
  faction: "verdant",
};

describe("sandbox finite mining economy", () => {
  it("initializes eight 3000-ore pits with mirrored safe controllers", () => {
    const state = createSandboxMiningState();
    const pits = Object.values(state.pitsById);

    expect(pits).toHaveLength(8);
    expect(pits.every((pit) => pit.capacityOre === 3_000 && pit.remainingOre === 3_000)).toBe(true);
    expect(pits.filter((pit) => pit.controller === "verdant")).toHaveLength(2);
    expect(pits.filter((pit) => pit.controller === "crimson")).toHaveLength(2);
    expect(pits.filter((pit) => pit.controller === null)).toHaveLength(4);
    expect(pits.every((pit) => (
      pit.captureProgress === 0
      && pit.capturingFaction === null
      && pit.productionProgress === 0
      && pit.occupyingMineId === null
    ))).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.pitsById[PIT_ID])).toBe(true);
  });

  it.each([
    { usedPopulation: 50, expectedNet: 3_000, expectedUpkeep: 0 },
    { usedPopulation: 80, expectedNet: 2_400, expectedUpkeep: 600 },
    { usedPopulation: 100, expectedNet: 1_800, expectedUpkeep: 1_200 },
  ])(
    "exhausts one pit in 30 ticks at population $usedPopulation with exact totals",
    ({ usedPopulation, expectedNet, expectedUpkeep }) => {
      let state = activeMineState();
      let wallet = { verdant: 0, crimson: 0 };
      const events: MiningLedgerEvent[] = [];

      for (let tick = 0; tick < 30; tick += 1) {
        const result = advanceSandboxMining(state, {
          elapsedSeconds: tick * 4,
          deltaSeconds: 4,
          walletGoldByFaction: wallet,
          populationByFaction: populations(usedPopulation),
          productionSources: [SOURCE],
        });
        state = result.state;
        wallet = result.walletGoldByFaction;
        events.push(...result.events);
      }

      expect(events).toHaveLength(30);
      expect(sum(events, "grossExtracted")).toBe(3_000);
      expect(sum(events, "upkeepWithheld")).toBe(expectedUpkeep);
      expect(sum(events, "netCredited")).toBe(expectedNet);
      expect(wallet.verdant).toBe(expectedNet);
      expect(state.pitsById[PIT_ID]?.remainingOre).toBe(0);
      for (const event of events) {
        expect(event.grossExtracted).toBe(event.upkeepWithheld + event.netCredited);
        expect(event.oreBefore - event.oreAfter).toBe(event.grossExtracted);
        expect(event.walletAfter - event.walletBefore).toBe(event.netCredited);
      }
    },
  );

  it("pauses for ten full-wallet minutes without consuming ore, then resumes after spending", () => {
    const initial = activeMineState();
    const paused = advanceSandboxMining(initial, {
      elapsedSeconds: 0,
      deltaSeconds: 600,
      walletGoldByFaction: { verdant: 5_000, crimson: 0 },
      populationByFaction: populations(0),
      productionSources: [SOURCE],
    });

    expect(paused.events).toHaveLength(150);
    expect(paused.events.every((event) => (
      event.outcome === "wallet-full"
      && event.grossExtracted === 0
      && event.upkeepWithheld === 0
      && event.netCredited === 0
    ))).toBe(true);
    expect(paused.state.pitsById[PIT_ID]?.remainingOre).toBe(3_000);

    const resumed = advanceSandboxMining(paused.state, {
      elapsedSeconds: 600,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 4_900, crimson: 0 },
      populationByFaction: populations(0),
      productionSources: [SOURCE],
    });
    expect(resumed.events[0]).toMatchObject({
      outcome: "settled",
      grossExtracted: 100,
      netCredited: 100,
      walletBefore: 4_900,
      walletAfter: 5_000,
      oreBefore: 3_000,
      oreAfter: 2_900,
    });
  });

  it("reverse-throttles gross extraction against near-full net wallet capacity", () => {
    const result = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 0,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 4_999, crimson: 0 },
      populationByFaction: populations(80),
      productionSources: [SOURCE],
    });

    expect(result.events[0]).toMatchObject({
      grossExtracted: 1.25,
      upkeepWithheld: 0.25,
      netCredited: 1,
      walletBefore: 4_999,
      walletAfter: 5_000,
      oreBefore: 3_000,
      oreAfter: 2_998.75,
    });
    expect(result.walletGoldByFaction.verdant).toBe(5_000);
    expect(result.state.walletRemainderHundredths.verdant).toBe(0);
  });

  it("consumes tail ore without wasting its fractional net credit", () => {
    let state = activeMineState(1);
    const result = advanceSandboxMining(state, {
      elapsedSeconds: 0,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(51),
      productionSources: [SOURCE],
    });
    state = result.state;

    expect(result.events[0]).toMatchObject({
      grossExtracted: 1,
      upkeepWithheld: 0.2,
      netCredited: 0.8,
      walletBefore: 0,
      walletAfter: 0.8,
      oreBefore: 1,
      oreAfter: 0,
    });
    expect(result.walletGoldByFaction.verdant).toBe(0);
    expect(state.walletRemainderHundredths.verdant).toBe(80);
    expect(state.pitsById[PIT_ID]?.remainingOre).toBe(0);
  });

  it("uses the post-death used-population snapshot at the 80/81 boundary", () => {
    const at81 = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 20,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(81),
      productionSources: [SOURCE],
    });
    const afterDeath = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 20,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(80),
      productionSources: [SOURCE],
    });

    expect(at81.events[0]).toMatchObject({
      usedPopulation: 81,
      incomeMultiplier: 0.6,
      netCredited: 60,
    });
    expect(afterDeath.events[0]).toMatchObject({
      usedPopulation: 80,
      incomeMultiplier: 0.8,
      netCredited: 80,
      scheduledAt: 24,
    });
  });

  it("records reserved queue population but excludes it from the income band", () => {
    const result = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 0,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(49, 51),
      productionSources: [SOURCE],
    });

    expect(result.events[0]).toMatchObject({
      usedPopulation: 49,
      reservedPopulation: 51,
      incomeMultiplier: 1,
      grossExtracted: 100,
      upkeepWithheld: 0,
      netCredited: 100,
    });
  });

  it("accumulates deterministic partial progress before the four-second boundary", () => {
    const firstHalf = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 0,
      deltaSeconds: 2,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(0),
      productionSources: [SOURCE],
    });
    expect(firstHalf.events).toHaveLength(0);
    expect(firstHalf.state.pitsById[PIT_ID]?.productionProgress).toBe(2);

    const completed = advanceSandboxMining(firstHalf.state, {
      elapsedSeconds: 2,
      deltaSeconds: 2,
      walletGoldByFaction: firstHalf.walletGoldByFaction,
      populationByFaction: populations(0),
      productionSources: [SOURCE],
    });
    expect(completed.events).toHaveLength(1);
    expect(completed.events[0]).toMatchObject({ scheduledAt: 4, netCredited: 100 });
    expect(completed.state.pitsById[PIT_ID]?.productionProgress).toBe(0);
  });

  it("locks the exact 50/51 and 80/81 income boundaries", () => {
    expect(miningIncomeMultiplier(50)).toBe(1);
    expect(miningIncomeMultiplier(51)).toBe(0.8);
    expect(miningIncomeMultiplier(80)).toBe(0.8);
    expect(miningIncomeMultiplier(81)).toBe(0.6);
  });

  it("settles simultaneous mines in stable pit-id order", () => {
    const secondPitId = "P-E";
    const secondMineId = "verdant-mine-2";
    let state = activeMineState();
    const occupied = occupyMinePit(state, secondPitId, secondMineId);
    expect(occupied.occupied).toBe(true);
    state = occupied.state;

    const result = advanceSandboxMining(state, {
      elapsedSeconds: 0,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(0),
      productionSources: [
        SOURCE,
        { pitId: secondPitId, mineId: secondMineId, faction: "verdant" },
      ],
    });

    expect(result.events.map((event) => event.pitId)).toEqual(["P-E", "P-W"]);
    expect(result.events.map((event) => event.sequence)).toEqual([0, 1]);
  });

  it("preserves finite reserves across mine destruction and rebuilding", () => {
    const mined = advanceSandboxMining(activeMineState(), {
      elapsedSeconds: 0,
      deltaSeconds: 4,
      walletGoldByFaction: { verdant: 0, crimson: 0 },
      populationByFaction: populations(0),
      productionSources: [SOURCE],
    });
    const vacated = vacateMinePit(mined.state, PIT_ID, MINE_ID);
    expect(vacated.vacated).toBe(true);
    const rebuilt = occupyMinePit(vacated.state, PIT_ID, "replacement-mine");

    expect(rebuilt.occupied).toBe(true);
    expect(rebuilt.state.pitsById[PIT_ID]).toMatchObject({
      remainingOre: 2_900,
      occupyingMineId: "replacement-mine",
      productionProgress: 0,
    });
  });
});

describe("emergency mine permits", () => {
  it("applies all four eligibility conditions symmetrically", () => {
    for (const faction of ["verdant", "crimson"] as const) {
      const state = createSandboxMiningState();
      const eligible = emergencyMinePermitEligibility(state, {
        faction,
        walletGold: 399,
        mineBuildings: [],
      });
      expect(eligible).toMatchObject({ eligible: true, reason: null });
      expect(eligible.eligiblePitIds).toHaveLength(2);

      expect(emergencyMinePermitEligibility(state, {
        faction,
        walletGold: 400,
        mineBuildings: [],
      })).toMatchObject({ eligible: false, reason: "gold-not-below-mine-cost" });

      expect(emergencyMinePermitEligibility(state, {
        faction,
        walletGold: 0,
        mineBuildings: [{ id: "site", faction, status: "constructing" }],
      })).toMatchObject({ eligible: false, reason: "friendly-mine-exists" });

      expect(emergencyMinePermitEligibility(state, {
        faction,
        walletGold: 0,
        mineBuildings: [{ id: "mine", faction, status: "active" }],
      })).toMatchObject({ eligible: false, reason: "friendly-mine-exists" });

      expect(emergencyMinePermitEligibility(state, {
        faction,
        walletGold: 0,
        mineBuildings: [{ id: "ruin", faction, status: "destroyed" }],
      })).toMatchObject({ eligible: true, reason: null });
    }
  });

  it("requires a controlled, non-depleted, unoccupied pit", () => {
    let state = createSandboxMiningState();
    for (const pit of Object.values(state.pitsById).filter((candidate) => (
      candidate.controller === "verdant"
    ))) {
      state = replaceMinePitState(state, { ...pit, remainingOre: 0 });
    }

    expect(emergencyMinePermitEligibility(state, {
      faction: "verdant",
      walletGold: 0,
      mineBuildings: [],
    })).toMatchObject({ eligible: false, reason: "no-controlled-available-pit" });
  });

  it("is one-use per faction without consuming the opposing permit", () => {
    const state = createSandboxMiningState();
    const consumed = consumeEmergencyMinePermit(state, "verdant");
    const duplicate = consumeEmergencyMinePermit(consumed.state, "verdant");

    expect(consumed.consumed).toBe(true);
    expect(consumed.state.emergencyPermits).toEqual({
      verdant: { used: true },
      crimson: { used: false },
    });
    expect(duplicate).toEqual({ state: consumed.state, consumed: false });
    expect(emergencyMinePermitEligibility(consumed.state, {
      faction: "verdant",
      walletGold: 0,
      mineBuildings: [],
    })).toMatchObject({ eligible: false, reason: "already-used" });
    expect(emergencyMinePermitEligibility(consumed.state, {
      faction: "crimson",
      walletGold: 0,
      mineBuildings: [],
    })).toMatchObject({ eligible: true, reason: null });
  });
});

function activeMineState(remainingOre = 3_000): SandboxMiningState {
  let state = createSandboxMiningState();
  const pit = state.pitsById[PIT_ID];
  if (!pit) throw new Error("Test pit missing.");
  state = replaceMinePitState(state, { ...pit, remainingOre });
  const occupied = occupyMinePit(state, PIT_ID, MINE_ID);
  if (!occupied.occupied) throw new Error(`Could not occupy test pit: ${occupied.reason}`);
  return occupied.state;
}

function populations(
  usedPopulation: number,
  reservedPopulation = 0,
): Readonly<Record<Faction, MiningPopulationSnapshot>> {
  return {
    verdant: { usedPopulation, reservedPopulation },
    crimson: { usedPopulation: 0, reservedPopulation: 0 },
  };
}

function sum(
  events: readonly MiningLedgerEvent[],
  field: "grossExtracted" | "upkeepWithheld" | "netCredited",
): number {
  return events.reduce((total, event) => total + event[field], 0);
}
