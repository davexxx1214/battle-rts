import { describe, expect, it } from "vitest";

import { axialToWorld } from "../../src/map/battlefield";
import {
  LEGACY_BATTLEFIELD_DEFINITION,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";
import { createBattlefieldScenePresentation } from "../../src/scene/battlefieldScenePresentation";
import { BATTLEFIELD_WATER_TILE_RADIUS } from "../../src/scene/terrain/battlefieldBoundaryPresentation";

describe("battlefield scene presentation bounds", () => {
  it("preserves the legacy fog, light and shadow framing", () => {
    const presentation = createBattlefieldScenePresentation(
      LEGACY_BATTLEFIELD_DEFINITION,
    );

    expect(presentation.fog).toEqual({ near: 34, far: 72 });
    expect(presentation.directionalLightPosition).toEqual([9, 18, 7]);
    expect(presentation.shadowCameraExtent).toBe(20);
    expect(presentation.center).toEqual({ x: 0, z: 0 });
  });

  it("expands fog, lighting, shadows and fallback coverage for the sandbox map", () => {
    const legacy = createBattlefieldScenePresentation(
      LEGACY_BATTLEFIELD_DEFINITION,
    );
    const sandbox = createBattlefieldScenePresentation(
      SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
    );

    expect(sandbox.fog.near).toBeGreaterThan(legacy.fog.near);
    expect(sandbox.fog.far).toBeGreaterThan(legacy.fog.far);
    expect(sandbox.shadowCameraExtent).toBeGreaterThan(legacy.shadowCameraExtent);
    expect(sandbox.directionalLightPosition[1])
      .toBeGreaterThan(legacy.directionalLightPosition[1]);
    expect(sandbox.fallbackRadius).toBeGreaterThan(legacy.fallbackRadius);
    expect(SANDBOX_LARGE_BATTLEFIELD_DEFINITION.map.cells.every((cell) => {
      const point = axialToWorld(cell);
      return Math.hypot(point.x - sandbox.center.x, point.z - sandbox.center.z)
        + BATTLEFIELD_WATER_TILE_RADIUS <= sandbox.fallbackRadius;
    })).toBe(true);
  });
});
