import { describe, expect, it } from "vitest";

import { axialToWorld, BATTLEFIELD_MAP, BATTLEFIELD_WORLD_BOUNDS } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";
import {
  normalizedPanProgress,
  PORTRAIT_CAMERA_YAW,
} from "../../src/scene/camera/BattleCamera";
import {
  cameraCenterForWorldPoint,
  cameraGroundAxes,
  clampCameraTarget,
  screenPanWorldDelta,
} from "../../src/scene/camera/cameraPan";

describe("mobile camera pan range", () => {
  it("unlocks travel as the camera zooms in from a map-derived overview", () => {
    expect(normalizedPanProgress(14.61860365, 14.61860365, 56)).toBe(0);
    expect(normalizedPanProgress(32, 14.61860365, 56)).toBeGreaterThan(0.5);
    expect(normalizedPanProgress(56, 11, 56)).toBe(1);
    expect(normalizedPanProgress(80, 11, 56)).toBe(1);
  });

  it("does not use the start zoom as the pan-progress origin", () => {
    const overview = 14.61860365;

    expect(normalizedPanProgress(overview, overview, 56)).toBe(0);
    expect(normalizedPanProgress(32, overview, 56)).toBeGreaterThan(0);
    expect(normalizedPanProgress(56, overview, 56)).toBe(1);
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

  it("jumps to an in-bounds sandbox point without changing it at full travel", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const rally = axialToWorld({ q: -7, r: 14 });
    const centered = cameraCenterForWorldPoint(
      rally,
      definition.worldBounds,
      definition.cameraPreset.desktopYaw,
      1,
    );

    expect(centered.x).toBeCloseTo(rally.x, 8);
    expect(centered.z).toBeCloseTo(rally.z, 8);
  });

  it("clamps camera jump commands against the active battlefield bounds", () => {
    const sandbox = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const point = { x: 1_000, z: -1_000 };
    const centered = cameraCenterForWorldPoint(
      point,
      sandbox.worldBounds,
      sandbox.cameraPreset.desktopYaw,
      1,
    );

    expect(centered.x).toBeGreaterThanOrEqual(sandbox.worldBounds.minX);
    expect(centered.x).toBeLessThanOrEqual(sandbox.worldBounds.maxX);
    expect(centered.z).toBeGreaterThanOrEqual(sandbox.worldBounds.minZ);
    expect(centered.z).toBeLessThanOrEqual(sandbox.worldBounds.maxZ);
  });

  it("places both castles on the portrait screen's vertical center line", () => {
    const axes = cameraGroundAxes(PORTRAIT_CAMERA_YAW);
    const playerCastle = axialToWorld(BATTLEFIELD_MAP.castles.verdant);
    const enemyCastle = axialToWorld(BATTLEFIELD_MAP.castles.crimson);

    expect(dot(playerCastle, axes.right)).toBeCloseTo(0, 8);
    expect(dot(enemyCastle, axes.right)).toBeCloseTo(0, 8);
    expect(dot(playerCastle, axes.up)).toBeLessThan(0);
    expect(dot(enemyCastle, axes.up)).toBeGreaterThan(0);
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
