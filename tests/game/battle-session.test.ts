import { describe, expect, it } from "vitest";

import { createInitialBattle } from "../../src/game/battle";
import { advanceBattleSession, getBattlePhaseAccess } from "../../src/game/battleSession";

describe("battle session gate", () => {
  it("keeps the battle frozen until the player engages", () => {
    const initial = createInitialBattle();

    expect(advanceBattleSession(initial, "briefing", 4, 0.05)).toBe(initial);

    const engaged = advanceBattleSession(initial, "engaged", 4, 0.05);
    expect(engaged.elapsed).toBeCloseTo(0.2);
    expect(engaged.revision).toBeGreaterThan(initial.revision);
  });

  it("allows battlefield inspection while keeping commands locked before engagement", () => {
    expect(getBattlePhaseAccess("briefing")).toEqual({
      inspectField: true,
      issueCommands: false,
    });
    expect(getBattlePhaseAccess("engaged")).toEqual({
      inspectField: true,
      issueCommands: true,
    });
  });
});
