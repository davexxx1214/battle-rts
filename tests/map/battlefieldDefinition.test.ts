import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_BATTLE_STRUCTURES,
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_MAP,
  BATTLEFIELD_STATIC_STRUCTURES,
  BATTLEFIELD_STRUCTURES,
  BATTLEFIELD_WORLD_BOUNDS,
  axialToWorld,
  terrainHeightAtMap,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_DEFINITIONS,
  LEGACY_BATTLEFIELD_DEFINITION,
  LEGACY_BATTLEFIELD_ID,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
  battlefieldDefinitionFor,
} from "../../src/map/battlefieldDefinition";
import {
  SANDBOX_LARGE_BATTLEFIELD_ID,
  SANDBOX_LARGE_BATTLEFIELD_MAP,
} from "../../src/map/sandboxLargeBattlefield";

describe("battlefield definitions", () => {
  it("adapts every legacy battlefield export without duplicating the map", () => {
    const definition = battlefieldDefinitionFor(LEGACY_BATTLEFIELD_ID);

    expect(definition).toBe(LEGACY_BATTLEFIELD_DEFINITION);
    expect(definition.map).toBe(BATTLEFIELD_MAP);
    expect(definition.worldBounds).toBe(BATTLEFIELD_WORLD_BOUNDS);
    expect(definition.structures).toBe(BATTLEFIELD_STRUCTURES);
    expect(definition.battleStructures).toBe(BATTLEFIELD_BATTLE_STRUCTURES);
    expect(definition.staticStructures).toBe(BATTLEFIELD_STATIC_STRUCTURES);
    expect(definition.decorations).toBe(BATTLEFIELD_DECORATIONS);
    expect(Object.isFrozen(BATTLEFIELD_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it("registers the detailed sandbox battlefield independently from legacy geometry", () => {
    const definition = battlefieldDefinitionFor(SANDBOX_LARGE_BATTLEFIELD_ID);

    expect(definition).toBe(SANDBOX_LARGE_BATTLEFIELD_DEFINITION);
    expect(definition.map).toBe(SANDBOX_LARGE_BATTLEFIELD_MAP);
    expect(definition.map).not.toBe(BATTLEFIELD_MAP);
    expect(definition).toMatchObject({
      id: "sandbox-large-v1",
      navigationRevision: 3,
      fingerprint: "fnv1a32:9c5df2be",
      cameraPreset: {
        initialTarget: axialToWorld({ q: -7, r: 14 }),
        startZoom: 32,
        defaultZoom: 32,
        maximumZoom: 56,
        overviewPaddingCells: 1,
      },
    });
    expect(definition.routes).toHaveLength(3);
    expect(definition.roadNetworkCells).toHaveLength(327);
    expect(definition.roadReserve).toHaveLength(331);
    expect(definition.minePits).toHaveLength(8);
    expect(definition.buildAnchors?.verdant).toHaveLength(34);
    expect(definition.buildAnchors?.crimson).toHaveLength(34);
    expect(definition.scenery).toHaveLength(96);
  });

  it("fails fast instead of silently falling back for an unknown map id", () => {
    expect(() => battlefieldDefinitionFor("missing-map"))
      .toThrowError("Unknown battlefield definition: missing-map");
  });

  it("queries height from the supplied map rather than the legacy singleton", () => {
    const raisedMap = {
      ...BATTLEFIELD_MAP,
      cells: BATTLEFIELD_MAP.cells.map((cell) => (
        cell.q === 0 && cell.r === 0 ? { ...cell, height: 4.25 } : cell
      )),
    };

    expect(terrainHeightAtMap(raisedMap, { x: 0, z: 0 })).toBe(4.25);
    expect(terrainHeightAtMap(BATTLEFIELD_MAP, { x: 0, z: 0 })).not.toBe(4.25);
  });
});
