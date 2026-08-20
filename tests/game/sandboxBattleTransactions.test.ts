import { describe, expect, it } from "vitest";

import {
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { vacateMinePit } from "../../src/game/miningEconomy";
import { startSandboxMineConstruction } from "../../src/game/sandboxBattleTransactions";

function withVerdantGold(battle: BattleState, gold: number): BattleState {
  return {
    ...battle,
    economy: {
      ...battle.economy,
      accounts: {
        ...battle.economy.accounts,
        verdant: { ...battle.economy.accounts.verdant, gold, isFull: false },
      },
    },
  };
}

describe("sandbox battle construction transactions", () => {
  it("atomically spends 400, reserves the pit, and produces only after 6+4 seconds", () => {
    const initial = createInitialBattle({ modeId: "sandbox" });
    const construction = startSandboxMineConstruction(initial, {
      faction: "verdant",
      pitId: "P-W",
    });
    expect(construction.ok).toBe(true);
    if (!construction.ok) return;
    expect(construction).toMatchObject({ costCharged: 400, usedEmergencyPermit: false });
    expect(construction.battle.economy.accounts.verdant.gold).toBe(600);
    expect(construction.battle.mining?.pitsById["P-W"]?.occupyingMineId)
      .toBe(construction.buildingId);

    let battle = construction.battle;
    for (let step = 0; step < 99; step += 1) battle = stepBattle(battle, 0.1);
    expect(battle.economy.accounts.verdant.gold).toBe(600);
    battle = stepBattle(battle, 0.1);
    expect(battle.economy.accounts.verdant.gold).toBe(700);
    expect(battle.mining?.pitsById["P-W"]?.remainingOre).toBe(2_900);
    expect(battle.miningLedger.at(-1)).toMatchObject({
      pitId: "P-W",
      grossExtracted: 100,
      netCredited: 100,
    });
  });

  it("uses the symmetric one-time permit only when otherwise soft-locked", () => {
    const initial = withVerdantGold(createInitialBattle({ modeId: "sandbox" }), 200);
    const rescue = startSandboxMineConstruction(initial, {
      faction: "verdant",
      pitId: "P-W",
    });
    expect(rescue.ok).toBe(true);
    if (!rescue.ok || rescue.battle.mining === null) return;
    expect(rescue).toMatchObject({ costCharged: 0, usedEmergencyPermit: true });
    expect(rescue.battle.economy.accounts.verdant.gold).toBe(200);
    expect(rescue.battle.mining.emergencyPermits.verdant.used).toBe(true);

    const vacated = vacateMinePit(
      rescue.battle.mining,
      "P-W",
      rescue.buildingId,
    ).state;
    const withoutMine: BattleState = {
      ...rescue.battle,
      buildings: [],
      buildingOccupancy: {},
      mining: vacated,
    };
    const second = startSandboxMineConstruction(withoutMine, {
      faction: "verdant",
      pitId: "P-E",
    });
    expect(second).toMatchObject({ ok: false, reason: "insufficient-gold" });
  });

  it("does not expose the construction transaction to legacy modes", () => {
    const legacy = createInitialBattle();
    expect(startSandboxMineConstruction(legacy, {
      faction: "verdant",
      pitId: "P-W",
    })).toMatchObject({ ok: false, reason: "sandbox-mode-required", battle: legacy });
  });

  it("rejects inherited object keys as unknown pits without touching state or permits", () => {
    const initial = createInitialBattle({ modeId: "sandbox" });
    for (const pitId of ["toString", "constructor", "__proto__"]) {
      const result = startSandboxMineConstruction(initial, {
        faction: "verdant",
        pitId,
      });
      expect(result).toEqual({ ok: false, battle: initial, reason: "unknown-pit" });
      expect(initial.mining?.emergencyPermits.verdant.used).toBe(false);
    }
  });
});
