import { describe, expect, it } from "vitest";

import {
  applySelection,
  normalizeScreenRect,
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
});
