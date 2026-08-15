import { describe, expect, it } from "vitest";

import {
  applySelection,
  normalizeScreenRect,
  resolveFieldClickIntent,
  selectLivingFriendlyRole,
  selectFriendlyUnitsInRect,
} from "../../src/game/selection";

describe("RTS unit selection", () => {
  it("normalizes a drag rectangle in every direction", () => {
    expect(normalizeScreenRect({ startX: 140, startY: 90, endX: 20, endY: 30 })).toEqual({
      left: 20,
      top: 30,
      right: 140,
      bottom: 90,
    });
  });

  it("box-selects only living visible friendly units", () => {
    const selected = selectFriendlyUnitsInRect([
      { id: "v-1", faction: "verdant", x: 40, y: 40, alive: true, visible: true },
      { id: "v-dead", faction: "verdant", x: 60, y: 50, alive: false, visible: true },
      { id: "v-hidden", faction: "verdant", x: 70, y: 50, alive: true, visible: false },
      { id: "c-1", faction: "crimson", x: 50, y: 50, alive: true, visible: true },
      { id: "v-outside", faction: "verdant", x: 180, y: 50, alive: true, visible: true },
    ], { left: 20, top: 20, right: 100, bottom: 100 });

    expect(selected).toEqual(["v-1"]);
  });

  it("replaces or toggles the authoritative selection", () => {
    expect(applySelection(["v-1"], ["v-2", "v-3"], "replace")).toEqual(["v-2", "v-3"]);
    expect(applySelection(["v-1", "v-2"], ["v-2", "v-3"], "toggle")).toEqual(["v-1", "v-3"]);
  });

  it("selects every living friendly unit with the clicked unit's role", () => {
    const units = [
      { id: "v-ranger-1", faction: "verdant" as const, role: "ranger" as const, health: 80 },
      { id: "v-ranger-2", faction: "verdant" as const, role: "ranger" as const, health: 40 },
      { id: "v-ranger-dead", faction: "verdant" as const, role: "ranger" as const, health: 0 },
      { id: "v-knight", faction: "verdant" as const, role: "knight" as const, health: 140 },
      { id: "c-ranger", faction: "crimson" as const, role: "ranger" as const, health: 80 },
    ];

    expect(selectLivingFriendlyRole(units, "v-ranger-1")).toEqual([
      "v-ranger-1",
      "v-ranger-2",
    ]);
  });

  it("prioritizes an enemy target over an overlapping friendly when units are selected", () => {
    expect(resolveFieldClickIntent({
      canIssueCommands: true,
      hasCommandableSelection: true,
      friendlyId: "v-1",
      enemyId: "c-1",
    })).toEqual({ type: "attack", targetId: "c-1" });

    expect(resolveFieldClickIntent({
      canIssueCommands: true,
      hasCommandableSelection: false,
      friendlyId: "v-1",
      enemyId: "c-1",
    })).toEqual({ type: "select", unitId: "v-1" });
  });
});
