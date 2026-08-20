import { describe, expect, it } from "vitest";

import {
  createFireballPreviewBattle,
  isFireballPreviewRequest,
} from "../../src/game/fireballPreview";
import { unitSpecFor } from "../../src/game/rules";

describe("fireball preview battle", () => {
  it("reads only the fireball preview query flag", () => {
    expect(isFireballPreviewRequest("?preview=fireball")).toBe(true);
    expect(isFireballPreviewRequest("?preview=frost")).toBe(false);
  });

  it("places a durable human mage inside fireball range of three bait units", () => {
    const battle = createFireballPreviewBattle();
    const mage = battle.units.find((unit) => unit.role === "mage");
    const bait = battle.units.filter((unit) => unit.faction === "crimson");
    const range = unitSpecFor("mage", "human").attackRange;

    expect(mage?.combatProfile).toBe("human");
    expect(mage?.health).toBe(10_000);
    expect(bait).toHaveLength(3);
    expect(bait.every((unit) => (
      Math.hypot(unit.position.x - mage!.position.x, unit.position.z - mage!.position.z)
      <= range
      && unit.health === 10_000
    ))).toBe(true);
  });
});
