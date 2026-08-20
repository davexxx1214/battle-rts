import { describe, expect, it } from "vitest";

import { createInitialBattle } from "../../src/game/battle";
import {
  ARENA_STARTING_GOLD_PER_FACTION,
  createArenaBattle,
} from "../../src/game/arenaBattle";
import { createFactionRaces } from "../../src/game/factions";
import { MATCH_POLICIES } from "../../src/game/rules";

describe("arena game mode", () => {
  it("starts equal-value complete armies while allowing race-specific headcounts", () => {
    const normal = createInitialBattle();
    const arena = createArenaBattle(createFactionRaces({ crimson: "undead" }));

    expect(normal.units).toHaveLength(0);
    expect(arena.units.filter(({ faction }) => faction === "verdant"))
      .toHaveLength(37);
    expect(arena.units.filter(({ faction }) => faction === "crimson"))
      .toHaveLength(41);
    expect(ARENA_STARTING_GOLD_PER_FACTION).toBe(7800);
    expect(arena.units.every(({ id }) => id.startsWith("arena-"))).toBe(true);
    expect(countRoles(arena.units.filter(({ faction }) => faction === "verdant")))
      .toEqual({ spearman: 8, knight: 12, ranger: 8, mage: 6, catapult: 3, boneDragon: 0 });
    expect(countRoles(arena.units.filter(({ faction }) => faction === "crimson")))
      .toEqual({ spearman: 20, knight: 4, ranger: 8, mage: 6, catapult: 0, boneDragon: 3 });
    expect([...new Set(arena.squads.map(({ initialSize }) => initialSize))].sort())
      .toEqual([1, 2, 3, 5]);
    expect(arena.buildings).toEqual(normal.buildings);
    expect(arena.economy).toEqual(normal.economy);
    expect(arena.matchPolicy).toBe(MATCH_POLICIES.arena);
  });
});

function countRoles(units: ReturnType<typeof createArenaBattle>["units"]) {
  return {
    spearman: units.filter(({ role }) => role === "spearman").length,
    knight: units.filter(({ role }) => role === "knight").length,
    ranger: units.filter(({ role }) => role === "ranger").length,
    mage: units.filter(({ role }) => role === "mage").length,
    catapult: units.filter(({ role }) => role === "catapult").length,
    boneDragon: units.filter(({ role }) => role === "bone-dragon").length,
  };
}
