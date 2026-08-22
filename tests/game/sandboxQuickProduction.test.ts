import { describe, expect, it } from "vitest";

import { createInitialBattle, stepBattle, type BattleState } from "../../src/game/battle";
import { startSandboxBuildingConstruction } from "../../src/game/sandboxBattleTransactions";
import { enqueueSandboxBattleProduction } from "../../src/game/sandboxProductionTransactions";
import { sandboxQuickProductionBuildingId } from "../../src/game/sandboxQuickProduction";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BUILD_ANCHORS } from "../../src/map/sandboxLargeBattlefield";

describe("sandbox quick production", () => {
  it("chooses the shortest operational queue across duplicate producers", () => {
    let battle = createInitialBattle({ modeId: "sandbox" });
    battle = constructBarracks(battle, 0);
    battle = constructBarracks(battle, 1);
    battle = advanceSeconds(battle, 8);

    expect(sandboxQuickProductionBuildingId(battle, "spearman"))
      .toBe("verdant-barracks-1");

    const queued = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "spearman",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    expect(sandboxQuickProductionBuildingId(queued.battle, "spearman"))
      .toBe("verdant-barracks-2");
  });

  it("does not choose unfinished or wrong-producer buildings", () => {
    const unfinished = constructBarracks(createInitialBattle({ modeId: "sandbox" }), 0);
    expect(sandboxQuickProductionBuildingId(unfinished, "spearman")).toBeNull();
    expect(sandboxQuickProductionBuildingId(
      advanceSeconds(unfinished, 8),
      "archer",
    )).toBeNull();
  });
});

function constructBarracks(battle: BattleState, anchorIndex: number): BattleState {
  const result = startSandboxBuildingConstruction(battle, {
    faction: "verdant",
    slot: "barracks",
    worldPosition: axialToWorld(
      SANDBOX_LARGE_BUILD_ANCHORS.verdant[anchorIndex]!.coordinate,
    ),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.battle;
}

function advanceSeconds(battle: BattleState, seconds: number): BattleState {
  let next = battle;
  for (let step = 0; step < Math.round(seconds / 0.1); step += 1) {
    next = stepBattle(next, 0.1);
  }
  return next;
}
