import { describe, expect, it } from "vitest";

import {
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { SANDBOX_ECONOMY_POLICY } from "../../src/game/battleMode";
import { createBattleBuilding } from "../../src/game/buildings";
import { createEconomyState } from "../../src/game/economy";
import {
  replaceMinePitState,
  type SandboxMiningState,
} from "../../src/game/miningEconomy";
import { isSandboxResourceStalemate } from "../../src/game/sandboxResolution";
import { createSandboxProductionState } from "../../src/game/sandboxProductionQueue";

describe("sandbox resource stalemate", () => {
  it("resolves only after both factions lose every recovery path", () => {
    const battle = emptyRecoveryBattle();
    expect(isSandboxResourceStalemate(battle)).toBe(true);
  });

  it("does not resolve while ore, troops, projectiles, queues, producers, or recovery gold remain", () => {
    const battle = emptyRecoveryBattle();
    const originalMining = createInitialBattle({ modeId: "sandbox" }).mining!;
    expect(isSandboxResourceStalemate({ ...battle, mining: originalMining })).toBe(false);
    expect(isSandboxResourceStalemate({
      ...battle,
      units: [{ faction: "verdant", health: 1, status: "idle" }],
    })).toBe(false);
    expect(isSandboxResourceStalemate({
      ...battle,
      projectiles: [{ id: "last-arrow" }],
    })).toBe(false);
    expect(isSandboxResourceStalemate({
      ...battle,
      production: {
        nextEntrySequence: 2,
        queuesByBuildingId: {
          barracks: {
            buildingId: "barracks",
            faction: "verdant",
            producer: "barracks",
            rallyPoint: null,
            entries: [{
              id: "entry-1",
              sequence: 1,
              troopKind: "spearman",
              status: "queued",
              trainingProgressSeconds: 0,
            }],
          },
        },
      },
    })).toBe(false);

    const constructingProducer = {
      ...createBattleBuilding({
        id: "future-barracks",
        kind: "barracks",
        faction: "verdant",
        coordinate: { q: 0, r: 0 },
        createdAt: 0,
      }),
      constructionCompletedAt: 8,
    };
    expect(isSandboxResourceStalemate({
      ...battle,
      buildings: [...battle.buildings, constructingProducer],
      economy: economyWithGold(0, 0),
    })).toBe(false);
    expect(isSandboxResourceStalemate({
      ...battle,
      buildings: [
        ...battle.buildings,
        { ...constructingProducer, constructionCompletedAt: 0 },
      ],
      economy: economyWithGold(200, 0),
    })).toBe(false);
    expect(isSandboxResourceStalemate({
      ...battle,
      economy: economyWithGold(600, 0),
    })).toBe(false);
  });

  it("stores a resource-stalemate reason and freezes economy systems afterwards", () => {
    const ready = emptyRecoveryBattle();
    const before: BattleState = {
      ...createInitialBattle({ modeId: "sandbox" }),
      units: [],
      projectiles: [],
      economy: ready.economy,
      mining: ready.mining,
      production: ready.production,
    };
    const resolved = stepBattle(before, 0.1);
    expect(resolved.winner).toBe("draw");
    expect(resolved.resolutionReason).toBe("resource-stalemate");

    const frozen = stepBattle(resolved, 0.1);
    expect(frozen.economy).toBe(resolved.economy);
    expect(frozen.mining).toBe(resolved.mining);
    expect(frozen.production).toBe(resolved.production);
    expect(frozen.sandboxAi).toBe(resolved.sandboxAi);
  });

  it("never applies the old match timeout to sandbox", () => {
    const battle: BattleState = {
      ...createInitialBattle({ modeId: "sandbox" }),
      elapsed: 301,
      matchElapsed: 301,
    };
    const advanced = stepBattle(battle, 0.1);
    expect(advanced.winner).toBeNull();
    expect(advanced.resolutionReason).toBeNull();
  });

  it("distinguishes one destroyed castle from same-frame destruction", () => {
    const one = destroyCastles(createInitialBattle({ modeId: "sandbox" }), ["crimson"]);
    const won = stepBattle(one, 0.1);
    expect(won.winner).toBe("verdant");
    expect(won.resolutionReason).toBe("castle-destroyed");

    const both = destroyCastles(createInitialBattle({ modeId: "sandbox" }), [
      "verdant",
      "crimson",
    ]);
    const drawn = stepBattle(both, 0.1);
    expect(drawn.winner).toBe("draw");
    expect(drawn.resolutionReason).toBe("simultaneous-destruction");
  });
});

function emptyRecoveryBattle() {
  const initial = createInitialBattle({ modeId: "sandbox" });
  return {
    elapsedSeconds: initial.matchElapsed,
    mining: depleteEveryPit(initial.mining!),
    economy: economyWithGold(0, 0),
    units: [],
    projectiles: [],
    buildings: initial.buildings,
    production: createSandboxProductionState(),
  } as const;
}

function depleteEveryPit(mining: SandboxMiningState): SandboxMiningState {
  return Object.values(mining.pitsById).reduce((next, pit) => (
    replaceMinePitState(next, {
      ...pit,
      remainingOre: 0,
      depleted: true,
      productionProgress: 0,
    })
  ), mining);
}

function economyWithGold(verdant: number, crimson: number) {
  const economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
  return {
    accounts: {
      verdant: { ...economy.accounts.verdant, gold: verdant },
      crimson: { ...economy.accounts.crimson, gold: crimson },
    },
  };
}

function destroyCastles(
  battle: BattleState,
  factions: readonly ("verdant" | "crimson")[],
): BattleState {
  return {
    ...battle,
    buildings: battle.buildings.map((building) => (
      building.kind === "castle" && factions.includes(building.faction)
        ? {
            ...building,
            health: 0,
            status: "destroyed" as const,
            diedAt: battle.elapsed,
            removeAt: battle.elapsed + 2,
          }
        : building
    )),
  };
}
