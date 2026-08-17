import { describe, expect, it } from "vitest";

import { createInitialBattle } from "../../src/game/battle";
import {
  ARENA_STARTING_UNITS_PER_FACTION,
  createArenaBattle,
} from "../../src/game/arenaBattle";

describe("arena game mode", () => {
  it("changes only the initial army and starts forty units per faction", () => {
    const normal = createInitialBattle();
    const arena = createArenaBattle();

    expect(normal.units).toHaveLength(0);
    expect(arena.units.filter(({ faction }) => faction === "verdant"))
      .toHaveLength(ARENA_STARTING_UNITS_PER_FACTION);
    expect(arena.units.filter(({ faction }) => faction === "crimson"))
      .toHaveLength(ARENA_STARTING_UNITS_PER_FACTION);
    expect(arena.units.every(({ id }) => id.startsWith("arena-"))).toBe(true);
    expect(countRoles(arena.units.filter(({ faction }) => faction === "verdant")))
      .toEqual({ spearman: 8, knight: 12, ranger: 8, mage: 8, catapult: 4 });
    expect([...new Set(arena.squads.map(({ initialSize }) => initialSize))].sort())
      .toEqual([1, 2, 3]);
    expect(arena.buildings).toEqual(normal.buildings);
    expect(arena.economy).toEqual(normal.economy);
  });
});

function countRoles(units: ReturnType<typeof createArenaBattle>["units"]) {
  return {
    spearman: units.filter(({ role }) => role === "spearman").length,
    knight: units.filter(({ role }) => role === "knight").length,
    ranger: units.filter(({ role }) => role === "ranger").length,
    mage: units.filter(({ role }) => role === "mage").length,
    catapult: units.filter(({ role }) => role === "catapult").length,
  };
}
