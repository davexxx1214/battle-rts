import { describe, expect, it } from "vitest";

import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_MINE_PITS } from "../../src/map/sandboxLargeBattlefield";
import {
  battleBuildingConstructionPhaseAt,
  createBattleBuilding,
} from "../../src/game/buildings";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import { createEconomyState } from "../../src/game/economy";
import {
  createSandboxMiningState,
  occupyMinePit,
  replaceMinePitState,
} from "../../src/game/miningEconomy";
import { advanceSandboxMiningSystems } from "../../src/game/sandboxMiningIntegration";

const sandbox = battleModeDefinitionFor("sandbox");
const verdantPit = SANDBOX_LARGE_MINE_PITS[0]!;

function mine(createdAt = 0) {
  return createBattleBuilding({
    id: "mine-1",
    kind: "gold-mine",
    faction: "verdant",
    coordinate: verdantPit.coordinate,
    createdAt,
    constructionSeconds: 6,
  }, sandbox.buildingLifecyclePolicy);
}

function occupiedMining() {
  return occupyMinePit(createSandboxMiningState(), verdantPit.id, "mine-1").state;
}

describe("sandbox mining integration", () => {
  it("waits for six-second construction and then settles four active seconds", () => {
    const building = mine();
    const economy = createEconomyState(sandbox.economyPolicy);
    const beforeCompletion = advanceSandboxMiningSystems({
      mining: occupiedMining(),
      economy,
      buildings: [building],
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 6,
    });
    expect(beforeCompletion.economy).toEqual(economy);
    expect(beforeCompletion.mining.pitsById[verdantPit.id]!.productionProgress).toBe(0);

    const produced = advanceSandboxMiningSystems({
      mining: beforeCompletion.mining,
      economy: beforeCompletion.economy,
      buildings: [building],
      units: [],
      elapsedSeconds: 6,
      deltaSeconds: 4,
    });
    expect(building.constructionCompletedAt).toBe(6);
    expect(battleBuildingConstructionPhaseAt(building, 6)).toBe("operational");
    expect(produced.economy.accounts.verdant.gold).toBe(1_100);
    expect(produced.mining.pitsById[verdantPit.id]!.remainingOre).toBe(2_900);
  });

  it("keeps a living mine producing for its building faction independent of pit control", () => {
    const occupied = occupiedMining();
    const pit = occupied.pitsById[verdantPit.id]!;
    const mining = replaceMinePitState(occupied, {
      ...pit,
      controller: "crimson",
    });
    const result = advanceSandboxMiningSystems({
      mining,
      economy: createEconomyState(sandbox.economyPolicy),
      buildings: [mine()],
      units: [],
      elapsedSeconds: 6,
      deltaSeconds: 4,
    });

    expect(result.economy.accounts.verdant.gold).toBe(1_100);
    expect(result.economy.accounts.crimson.gold).toBe(1_000);
    expect(result.mining.pitsById[verdantPit.id]).toMatchObject({
      controller: "crimson",
      occupyingMineId: "mine-1",
      remainingOre: 2_900,
    });
  });

  it("splits a large step at construction completion instead of losing active time", () => {
    const result = advanceSandboxMiningSystems({
      mining: occupiedMining(),
      economy: createEconomyState(sandbox.economyPolicy),
      buildings: [mine()],
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 10,
    });

    expect(result.ledgerEvents).toHaveLength(1);
    expect(result.ledgerEvents[0]).toMatchObject({ scheduledAt: 10, netCredited: 100 });
  });

  it("uses post-casualty population and ignores reserved population for the rate", () => {
    const units = Array.from({ length: 81 }, (_, index) => ({
      faction: "verdant" as const,
      role: "spearman" as const,
      health: index === 80 ? 0 : 100,
      status: index === 80 ? "dead" : "idle",
      position: axialToWorld({ q: -8, r: 15 }),
    }));
    const result = advanceSandboxMiningSystems({
      mining: occupiedMining(),
      economy: createEconomyState(sandbox.economyPolicy),
      buildings: [mine()],
      units,
      elapsedSeconds: 6,
      deltaSeconds: 4,
      reservedPopulationByFaction: { verdant: 20, crimson: 0 },
    });

    expect(result.ledgerEvents[0]).toMatchObject({
      usedPopulation: 80,
      reservedPopulation: 20,
      netCredited: 80,
    });
  });

  it("vacates a destroyed mine without restoring ore or producing on that timestamp", () => {
    const first = advanceSandboxMiningSystems({
      mining: occupiedMining(),
      economy: createEconomyState(sandbox.economyPolicy),
      buildings: [mine()],
      units: [],
      elapsedSeconds: 6,
      deltaSeconds: 4,
    });
    const destroyed = { ...mine(), status: "destroyed" as const, health: 0 };
    const next = advanceSandboxMiningSystems({
      mining: first.mining,
      economy: first.economy,
      buildings: [destroyed],
      units: [],
      elapsedSeconds: 10,
      deltaSeconds: 4,
    });

    expect(next.mining.pitsById[verdantPit.id]).toMatchObject({
      remainingOre: 2_900,
      occupyingMineId: null,
    });
    expect(next.ledgerEvents).toHaveLength(0);
  });

  it("carries fractional tail income across two mines without zero-value ledger noise", () => {
    const secondPit = SANDBOX_LARGE_MINE_PITS[1]!;
    const secondMine = createBattleBuilding({
      id: "mine-2",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: secondPit.coordinate,
      createdAt: 0,
    }, sandbox.buildingLifecyclePolicy);
    let mining = occupyMinePit(occupiedMining(), secondPit.id, secondMine.id).state;
    for (const pitId of [verdantPit.id, secondPit.id]) {
      const pit = mining.pitsById[pitId]!;
      mining = replaceMinePitState(mining, { ...pit, remainingOre: 1 });
    }
    const units = Array.from({ length: 51 }, () => ({
      faction: "verdant" as const,
      role: "spearman" as const,
      health: 100,
      status: "idle",
      position: axialToWorld({ q: -8, r: 15 }),
    }));
    const result = advanceSandboxMiningSystems({
      mining,
      economy: createEconomyState(sandbox.economyPolicy),
      buildings: [createBattleBuilding({
        id: "mine-1",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: verdantPit.coordinate,
        createdAt: 0,
      }, sandbox.buildingLifecyclePolicy), secondMine],
      units,
      elapsedSeconds: 0,
      deltaSeconds: 4,
    });

    expect(result.ledgerEvents.map((event) => event.netCredited)).toEqual([0.8, 0.8]);
    expect(result.economy.accounts.verdant.gold).toBe(1_001);
    expect(result.mining.walletRemainderHundredths.verdant).toBe(60);
    expect(result.mining.pitsById[verdantPit.id]!.depleted).toBe(true);
    expect(result.mining.pitsById[secondPit.id]!.depleted).toBe(true);

    const afterDepletion = advanceSandboxMiningSystems({
      mining: result.mining,
      economy: result.economy,
      buildings: [createBattleBuilding({
        id: "mine-1",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: verdantPit.coordinate,
        createdAt: 0,
      }, sandbox.buildingLifecyclePolicy), secondMine],
      units,
      elapsedSeconds: 4,
      deltaSeconds: 4,
    });
    expect(afterDepletion.ledgerEvents).toHaveLength(0);
    expect(afterDepletion.economy).toBe(result.economy);
    expect(afterDepletion.mining.pitsById[verdantPit.id]!.remainingOre).toBe(0);
    expect(afterDepletion.mining.pitsById[secondPit.id]!.remainingOre).toBe(0);
  });

  it("keeps the persistent ledger quiet while full and resumes after spending", () => {
    const baseEconomy = createEconomyState(sandbox.economyPolicy);
    const fullEconomy = {
      ...baseEconomy,
      accounts: {
        ...baseEconomy.accounts,
        verdant: { ...baseEconomy.accounts.verdant, gold: 5_000, isFull: true },
      },
    };
    const paused = advanceSandboxMiningSystems({
      mining: occupiedMining(),
      economy: fullEconomy,
      buildings: [mine()],
      units: [],
      elapsedSeconds: 6,
      deltaSeconds: 600,
    });
    expect(paused.ledgerEvents).toHaveLength(0);
    expect(paused.mining.pitsById[verdantPit.id]!.remainingOre).toBe(3_000);

    const spentEconomy = {
      ...paused.economy,
      accounts: {
        ...paused.economy.accounts,
        verdant: { ...paused.economy.accounts.verdant, gold: 4_900, isFull: false },
      },
    };
    const resumed = advanceSandboxMiningSystems({
      mining: paused.mining,
      economy: spentEconomy,
      buildings: [mine()],
      units: [],
      elapsedSeconds: 606,
      deltaSeconds: 4,
    });
    expect(resumed.ledgerEvents).toHaveLength(1);
    expect(resumed.economy.accounts.verdant.gold).toBe(5_000);
    expect(resumed.mining.pitsById[verdantPit.id]!.remainingOre).toBe(2_900);
  });
});
