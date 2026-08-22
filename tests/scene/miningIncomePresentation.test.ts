import { describe, expect, it } from "vitest";

import { createBattleState, type BattleState } from "../../src/game/battle";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import { createBattleBuilding } from "../../src/game/buildings";
import type { MiningLedgerEvent } from "../../src/game/miningEconomy";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_MINE_PITS } from "../../src/map/sandboxLargeBattlefield";
import {
  formatMiningIncomeAmount,
  miningIncomeEffectsAt,
  MINING_INCOME_EFFECT_DURATION_SECONDS,
} from "../../src/scene/effects/miningIncomePresentation";

const pit = SANDBOX_LARGE_MINE_PITS[0]!;
const sandboxMode = battleModeDefinitionFor("sandbox");

describe("mining income presentation", () => {
  it("places the actual net income over the mine during the effect window", () => {
    const mine = createBattleBuilding({
      id: "mine-1",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: pit.coordinate,
      createdAt: 0,
    }, sandboxMode.buildingLifecyclePolicy);
    const battle = battleWithLedger([
      miningEvent({ mineId: mine.id, scheduledAt: 10, netCredited: 80 }),
    ], 10.5, [mine]);

    expect(miningIncomeEffectsAt(battle)).toEqual([{
      sequence: 1,
      mineId: "mine-1",
      amount: 80,
      position: mine.position,
      age: 0.5,
    }]);
  });

  it("ignores zero income and expired settlements, with a pit fallback for removed mines", () => {
    const battle = battleWithLedger([
      miningEvent({ sequence: 1, scheduledAt: 10, netCredited: 0 }),
      miningEvent({
        sequence: 2,
        scheduledAt: 10 - MINING_INCOME_EFFECT_DURATION_SECONDS - 0.01,
        netCredited: 100,
      }),
      miningEvent({ sequence: 3, mineId: "removed-mine", scheduledAt: 9.8, netCredited: 60 }),
    ], 10, []);

    expect(miningIncomeEffectsAt(battle)).toEqual([{
      sequence: 3,
      mineId: "removed-mine",
      amount: 60,
      position: axialToWorld(pit.coordinate),
      age: expect.closeTo(0.2),
    }]);
  });

  it("formats whole and fractional credited gold without trailing zeroes", () => {
    expect(formatMiningIncomeAmount(100)).toBe("100");
    expect(formatMiningIncomeAmount(0.8)).toBe("0.8");
    expect(formatMiningIncomeAmount(12.5)).toBe("12.5");
  });
});

function battleWithLedger(
  miningLedger: readonly MiningLedgerEvent[],
  matchElapsed: number,
  buildings: BattleState["buildings"],
): BattleState {
  return {
    ...createBattleState([], { modeId: "sandbox" }),
    buildings,
    miningLedger,
    matchElapsed,
  };
}

function miningEvent(overrides: Partial<MiningLedgerEvent> = {}): MiningLedgerEvent {
  return {
    type: "mine-production-settled",
    sequence: 1,
    scheduledAt: 10,
    pitId: pit.id,
    mineId: "mine-1",
    faction: "verdant",
    outcome: "settled",
    usedPopulation: 51,
    reservedPopulation: 0,
    incomeMultiplier: 0.8,
    grossExtracted: 100,
    upkeepWithheld: 20,
    netCredited: 80,
    walletBefore: 1_000,
    walletAfter: 1_080,
    oreBefore: 3_000,
    oreAfter: 2_900,
    ...overrides,
  };
}
