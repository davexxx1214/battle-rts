import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { startSandboxMineConstruction } from "../../src/game/sandboxBattleTransactions";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_MINE_PITS } from "../../src/map/sandboxLargeBattlefield";

describe("sandbox mining in the battle clock", () => {
  it("serializes eight authoritative pits with the 2/2/4 opening control split", () => {
    const battle = createBattleState([], { modeId: "sandbox" });
    const restored = JSON.parse(JSON.stringify(battle)) as typeof battle;
    const pits = Object.values(restored.mining?.pitsById ?? {});

    expect(pits).toHaveLength(8);
    expect(pits.filter((pit) => pit.controller === "verdant")).toHaveLength(2);
    expect(pits.filter((pit) => pit.controller === "crimson")).toHaveLength(2);
    expect(pits.filter((pit) => pit.controller === null)).toHaveLength(4);
    expect(pits.every((pit) => pit.remainingOre === 3_000 && !pit.depleted)).toBe(true);
  });

  it("captures a neutral pit after three uninterrupted simulated seconds", () => {
    const neutral = SANDBOX_LARGE_MINE_PITS.find((pit) => pit.initialController === null);
    if (!neutral) throw new Error("Sandbox fixture requires a neutral mine pit.");
    const unit = createBattleUnit({
      id: "verdant-capture-unit",
      faction: "verdant",
      role: "spearman",
      position: axialToWorld(neutral.coordinate),
    });
    let battle = createBattleState([unit], { modeId: "sandbox" });

    for (let index = 0; index < 29; index += 1) battle = stepBattle(battle, 0.1);
    expect(battle.mining?.pitsById[neutral.id]).toMatchObject({
      controller: null,
      capturingFaction: "verdant",
      captureProgress: 2.9,
    });
    battle = stepBattle(battle, 0.1);
    expect(battle.mining?.pitsById[neutral.id]).toMatchObject({
      controller: "verdant",
      capturingFaction: null,
      captureProgress: 0,
    });
    expect(battle.events.filter((event) => (
      event.type === "mine-pit-captured" && event.pitId === neutral.id
    ))).toHaveLength(1);
  });

  it("captures the crimson-side mirrored neutral pit through the same battle path", () => {
    const neutral = SANDBOX_LARGE_MINE_PITS.find((pit) => pit.id === "N-SE");
    if (!neutral) throw new Error("Sandbox fixture requires the mirrored neutral pit.");
    const unit = createBattleUnit({
      id: "crimson-capture-unit",
      faction: "crimson",
      role: "spearman",
      position: axialToWorld(neutral.coordinate),
    });
    let battle = createBattleState([unit], { modeId: "sandbox" });
    battle = runSteps(battle, 30);

    expect(battle.mining?.pitsById[neutral.id]?.controller).toBe("crimson");
  });

  it("preserves ore through enemy-mine blocking, destruction, capture and rebuilding", () => {
    const initial = createBattleState([], { modeId: "sandbox" });
    const crimsonMine = startSandboxMineConstruction(initial, {
      faction: "crimson",
      pitId: "E-W",
    });
    if (!crimsonMine.ok) throw new Error(`Failed to build fixture mine: ${crimsonMine.reason}`);
    let battle = runSteps(crimsonMine.battle, 100);
    expect(battle.mining?.pitsById["E-W"]?.remainingOre).toBe(2_900);

    const attacker = createBattleUnit({
      id: "verdant-capture-raider",
      faction: "verdant",
      role: "spearman",
      position: axialToWorld({ q: -3, r: -10 }),
    });
    battle = { ...battle, units: [...battle.units, attacker] };
    battle = runSteps(battle, 30);
    expect(battle.mining?.pitsById["E-W"]).toMatchObject({
      controller: "crimson",
      captureProgress: 0,
      occupyingMineId: crimsonMine.buildingId,
      remainingOre: 2_900,
    });

    battle = {
      ...battle,
      buildings: battle.buildings.map((building) => (
        building.id === crimsonMine.buildingId
          ? {
              ...building,
              health: 0,
              status: "destroyed" as const,
              diedAt: battle.elapsed,
              removeAt: battle.elapsed + 0.8,
            }
          : building
      )),
    };
    battle = runSteps(battle, 30);
    expect(battle.mining?.pitsById["E-W"]).toMatchObject({
      controller: "verdant",
      captureProgress: 0,
      occupyingMineId: null,
      remainingOre: 2_900,
    });
    battle = {
      ...battle,
      units: battle.units.map((unit) => (
        unit.id === attacker.id
          ? { ...unit, position: axialToWorld({ q: -2, r: -10 }) }
          : unit
      )),
    };

    const rebuilt = startSandboxMineConstruction(battle, {
      faction: "verdant",
      pitId: "E-W",
    });
    if (!rebuilt.ok) throw new Error(`Failed to rebuild captured mine: ${rebuilt.reason}`);
    battle = runSteps(rebuilt.battle, 100);
    expect(battle.mining?.pitsById["E-W"]?.remainingOre).toBe(2_800);
    expect(battle.miningLedger.at(-1)).toMatchObject({
      pitId: "E-W",
      faction: "verdant",
      oreBefore: 2_900,
      oreAfter: 2_800,
    });
  });

  it("vacates a destroyed mine while advancing an already resolved battle", () => {
    const construction = startSandboxMineConstruction(
      createBattleState([], { modeId: "sandbox" }),
      { faction: "verdant", pitId: "P-W" },
    );
    if (!construction.ok) throw new Error(`Failed to build fixture mine: ${construction.reason}`);
    const resolved: BattleState = {
      ...construction.battle,
      buildings: construction.battle.buildings.map((building) => (
        building.id === construction.buildingId
          ? {
              ...building,
              health: 0,
              status: "destroyed" as const,
              diedAt: 0,
              removeAt: 0,
            }
          : building
      )),
      winner: "crimson",
      resolvedAt: 0,
    };

    const cleaned = stepBattle(resolved, 0.1);
    expect(cleaned.buildings.some((building) => building.id === construction.buildingId))
      .toBe(false);
    expect(cleaned.mining?.pitsById["P-W"]).toMatchObject({
      occupyingMineId: null,
      remainingOre: 3_000,
    });
  });
});

function runSteps(initial: BattleState, count: number): BattleState {
  let battle = initial;
  for (let index = 0; index < count; index += 1) battle = stepBattle(battle, 0.1);
  return battle;
}
