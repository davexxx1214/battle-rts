import { describe, expect, it } from "vitest";

import {
  createSandboxSelectionState,
  pruneSandboxSelection,
  sandboxSelectionBox,
  selectSandboxSquad,
  selectSandboxSquadsInBox,
  transitionSandboxInteraction,
} from "../../src/ui/sandboxSelection";

describe("sandbox selection state", () => {
  it("supports replace, Shift add/remove, and empty-ground clearing", () => {
    let state = selectSandboxSquad(createSandboxSelectionState(), "alpha", false);
    expect(state.selectedSquadIds).toEqual(["alpha"]);
    state = selectSandboxSquad(state, "bravo", true);
    expect(state.selectedSquadIds).toEqual(["alpha", "bravo"]);
    state = selectSandboxSquad(state, "alpha", true);
    expect(state.selectedSquadIds).toEqual(["bravo"]);
    expect(selectSandboxSquad(state, null, false).selectedSquadIds).toEqual([]);
  });

  it("selects full box sets deterministically and toggles with Shift", () => {
    let state = selectSandboxSquadsInBox(
      createSandboxSelectionState(),
      ["charlie", "alpha", "alpha"],
      false,
    );
    expect(state.selectedSquadIds).toEqual(["alpha", "charlie"]);
    state = selectSandboxSquadsInBox(state, ["bravo", "charlie"], true);
    expect(state.selectedSquadIds).toEqual(["alpha", "bravo"]);
  });

  it("prunes dead squads and normalizes drag direction", () => {
    const state = selectSandboxSquadsInBox(
      createSandboxSelectionState(),
      ["alpha", "bravo"],
      false,
    );
    expect(pruneSandboxSelection(state, new Set(["bravo"])).selectedSquadIds)
      .toEqual(["bravo"]);
    expect(sandboxSelectionBox({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      left: 10,
      top: 20,
      right: 40,
      bottom: 60,
    });
  });

  it("keeps construction, box selection, and camera drag exclusive", () => {
    let mode = transitionSandboxInteraction("neutral", {
      type: "select-building",
      selected: true,
    });
    expect(mode).toBe("placing-building");
    expect(transitionSandboxInteraction(mode, { type: "begin-box" }))
      .toBe("placing-building");
    mode = transitionSandboxInteraction(mode, { type: "begin-camera" });
    expect(mode).toBe("camera-dragging");
    expect(transitionSandboxInteraction(mode, { type: "cancel" })).toBe("neutral");
  });
});
