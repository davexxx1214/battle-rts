import { describe, expect, it } from "vitest";

import { createBattleState, createBattleUnit, createInitialBattle } from "../../src/game/battle";
import {
  advanceBattleSession,
  beginBattleSession,
  getBattlePhaseAccess,
} from "../../src/game/battleSession";

describe("battle session gate", () => {
  it("keeps the battle frozen until the player engages", () => {
    const initial = createInitialBattle();

    expect(advanceBattleSession(initial, "briefing", 4, 0.05)).toBe(initial);

    const engaged = advanceBattleSession(initial, "engaged", 4, 0.05);
    expect(engaged.elapsed).toBeCloseTo(0.2);
    expect(engaged.revision).toBeGreaterThan(initial.revision);
  });

  it("allows battlefield inspection and planning before engagement", () => {
    expect(getBattlePhaseAccess("briefing")).toEqual({
      inspectField: true,
      issueCommands: false,
      planCommands: true,
    });
    expect(getBattlePhaseAccess("engaged")).toEqual({
      inspectField: true,
      issueCommands: true,
      planCommands: false,
    });
  });

  it("applies and clears every plan in the same transition that starts engagement", () => {
    const friendly = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const enemy = createBattleUnit({
      id: "c-1",
      faction: "crimson",
      role: "knight",
      position: { x: 5, z: 0 },
    });

    const engaged = beginBattleSession({
      battle: createBattleState([friendly, enemy]),
      phase: "briefing",
      plannedCommands: [{ kind: "attack", unitIds: [friendly.id], targetId: enemy.id }],
    });

    expect(engaged.phase).toBe("engaged");
    expect(engaged.plannedCommands).toEqual([]);
    expect(engaged.battle.units.find((unit) => unit.id === friendly.id)?.order).toEqual({
      type: "attack",
      targetId: enemy.id,
    });
  });
});
