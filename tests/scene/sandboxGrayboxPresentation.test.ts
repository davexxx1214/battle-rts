import { describe, expect, it } from "vitest";

import {
  LEGACY_BATTLEFIELD_DEFINITION,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";
import {
  BATTLEFIELD_HEX_CENTER_SPACING,
  BATTLEFIELD_HEX_CIRCUMRADIUS,
} from "../../src/map/battlefield";
import {
  SANDBOX_GRAYBOX_HEX_ROTATION_Y,
  SANDBOX_GRAYBOX_MAP_ID,
  createSandboxGrayboxPresentation,
} from "../../src/scene/terrain/sandboxGrayboxPresentation";

describe("sandbox graybox presentation", () => {
  it("tessellates pointy-top hexes without triangular gaps", () => {
    expect(SANDBOX_GRAYBOX_HEX_ROTATION_Y).toBe(0);
    expect(BATTLEFIELD_HEX_CIRCUMRADIUS * Math.cos(Math.PI / 6) * 2)
      .toBeCloseTo(BATTLEFIELD_HEX_CENTER_SPACING, 12);
  });

  it("leaves the legacy battlefield presentation unchanged", () => {
    expect(createSandboxGrayboxPresentation(LEGACY_BATTLEFIELD_DEFINITION)).toBeNull();
  });

  it("fails fast when the sandbox definition is missing graybox data", () => {
    expect(() => createSandboxGrayboxPresentation({
      ...SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
      routes: undefined,
    })).toThrow("Sandbox graybox definition is missing presentation data");
  });

  it("creates the large-map terrain and three distinct route layers deterministically", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const plan = createSandboxGrayboxPresentation(definition);

    expect(plan).not.toBeNull();
    if (!plan) throw new Error("Expected sandbox graybox presentation.");
    expect(definition.id).toBe(SANDBOX_GRAYBOX_MAP_ID);
    expect(plan.terrainCells).toHaveLength(871);
    expect(plan.terrainCells).toHaveLength(definition.map.cells.length);
    expect(plan.boundary.waterCells.length).toBeGreaterThan(0);
    expect(plan.boundary.waterCells.every(({ coordinate }) => (
      !definition.map.cells.some((cell) => (
        cell.q === coordinate.q && cell.r === coordinate.r
      ))
    ))).toBe(true);
    expect(plan.routes.map(({ id }) => id)).toEqual(["center", "west", "east"]);
    expect(new Set(plan.routes.map(({ color }) => color)).size).toBe(3);
    expect(plan.routes.every(({ cells }) => cells.length > 0)).toBe(true);
    expect(createSandboxGrayboxPresentation(definition)).toEqual(plan);
  });

  it("covers both 52-anchor build zones and all eight labeled two-entry mines", () => {
    const plan = createSandboxGrayboxPresentation(SANDBOX_LARGE_BATTLEFIELD_DEFINITION);
    if (!plan) throw new Error("Expected sandbox graybox presentation.");

    expect(plan.buildZones.map(({ faction, anchors }) => [faction, anchors.length]))
      .toEqual([["verdant", 52], ["crimson", 52]]);
    expect(plan.buildZones.every(({ anchors }) => (
      anchors.filter(({ wing }) => wing === "west").length === 26
      && anchors.filter(({ wing }) => wing === "east").length === 26
    ))).toBe(true);
    expect(plan.minePits).toHaveLength(8);
    expect(plan.minePits.map(({ label }) => label)).toEqual([
      "P-W", "P-E", "N-NW", "N-NE", "N-SW", "N-SE", "E-W", "E-E",
    ]);
    expect(plan.minePits.every(({ entrances }) => entrances.length === 2)).toBe(true);
    expect(plan.minePits.flatMap(({ entrances }) => entrances)).toHaveLength(16);
  });
});
