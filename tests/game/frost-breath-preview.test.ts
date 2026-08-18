import { describe, expect, it } from "vitest";

import {
  createFrostBreathPreviewBattle,
  isFrostBreathPreviewRequest,
} from "../../src/game/frostBreathPreview";
import { unitSpecFor } from "../../src/game/rules";

describe("frost breath preview battle", () => {
  it("reads the frost preview query flag", () => {
    expect(isFrostBreathPreviewRequest("?preview=frost")).toBe(true);
    expect(isFrostBreathPreviewRequest("?benchmark=80")).toBe(false);
  });

  it("places an undead bone dragon inside breath range of human bait", () => {
    const battle = createFrostBreathPreviewBattle();
    const dragon = battle.units.find((unit) => unit.role === "bone-dragon");
    const bait = battle.units.filter((unit) => unit.faction === "verdant");
    expect(dragon?.combatProfile).toBe("undead");
    expect(bait).toHaveLength(3);
    expect(battle.undeadOpponent).toBe(true);
    const range = unitSpecFor("bone-dragon", "undead").attackRange;
    expect(bait.every((unit) => (
      Math.hypot(unit.position.x - dragon!.position.x, unit.position.z - dragon!.position.z)
      <= range
    ))).toBe(true);
  });
});
