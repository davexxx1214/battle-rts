import { describe, expect, it } from "vitest";

import { axialToWorld, BATTLEFIELD_MAP, BATTLEFIELD_WORLD_BOUNDS } from "../../src/map/battlefield";
import { normalizedPanProgress } from "../../src/scene/camera/BattleCamera";
import {
  cameraGroundAxes,
  clampCameraTarget,
  screenPanWorldDelta,
} from "../../src/scene/camera/cameraPan";

describe("mobile camera pan range", () => {
  it("unlocks travel as the camera zooms in from the overview", () => {
    expect(normalizedPanProgress(11, 11, 56)).toBe(0);
    expect(normalizedPanProgress(22, 11, 56)).toBeGreaterThan(0.5);
    expect(normalizedPanProgress(56, 11, 56)).toBe(1);
    expect(normalizedPanProgress(80, 11, 56)).toBe(1);
  });

  it("maps touch movement to the camera's screen axes at an isometric yaw", () => {
    const yaw = 0.68;
    const axes = cameraGroundAxes(yaw);
    const upward = screenPanWorldDelta(0, -120, yaw, 24, 18, 25);
    const rightward = screenPanWorldDelta(120, 0, yaw, 24, 18, 25);

    expect(dot(upward, axes.right)).toBeCloseTo(0, 8);
    expect(dot(upward, axes.up)).toBeLessThan(0);
    expect(dot(rightward, axes.up)).toBeCloseTo(0, 8);
    expect(dot(rightward, axes.right)).toBeLessThan(0);
  });

  it("keeps camera-aligned movement straight when it reaches a map boundary", () => {
    const yaw = 0.68;
    const axes = cameraGroundAxes(yaw);
    const bounds = { minX: -18, maxX: 18, minZ: -19, maxZ: 19 };
    const start = combine(axes, 3, 100);
    const clamped = clampCameraTarget(start, bounds, yaw, 1);

    expect(dot(clamped, axes.right)).toBeCloseTo(3, 8);
    expect(dot(clamped, axes.up)).toBeLessThan(100);
  });

  it("allows the enemy castle latitude into the camera's reachable range", () => {
    const enemyCastle = axialToWorld(BATTLEFIELD_MAP.castles.crimson);
    const clamped = clampCameraTarget(
      enemyCastle,
      BATTLEFIELD_WORLD_BOUNDS,
      0.68,
      1,
    );

    expect(clamped.x).toBeCloseTo(enemyCastle.x, 8);
    expect(clamped.z).toBeCloseTo(enemyCastle.z, 8);
  });
});

function dot(
  first: { readonly x: number; readonly z: number },
  second: { readonly x: number; readonly z: number },
): number {
  return first.x * second.x + first.z * second.z;
}

function combine(
  axes: ReturnType<typeof cameraGroundAxes>,
  horizontal: number,
  vertical: number,
) {
  return {
    x: axes.right.x * horizontal + axes.up.x * vertical,
    z: axes.right.z * horizontal + axes.up.z * vertical,
  };
}
