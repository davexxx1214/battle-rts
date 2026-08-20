import { describe, expect, it } from "vitest";

import {
  LEGACY_BATTLEFIELD_DEFINITION,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";
import {
  BATTLE_CAMERA_GROUND_DISTANCE,
  BATTLE_CAMERA_HEIGHT,
  BATTLEFIELD_CELL_CENTER_SPACING,
  cameraZoomBounds,
  clampedCameraZoom,
  initialCameraZoom,
  overviewMinimumCameraZoom,
  wheelZoomFactor,
} from "../../src/scene/camera/cameraZoom";

describe("battle camera zoom", () => {
  it("derives the sandbox desktop overview from bounds, yaw, viewport, and one-cell padding", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const size = { width: 1280, height: 720 };
    const minimum = overviewMinimumCameraZoom({
      size,
      worldBounds: definition.worldBounds,
      yaw: definition.cameraPreset.desktopYaw,
      overviewPaddingCells: definition.cameraPreset.overviewPaddingCells,
    });

    expect(minimum).toBeCloseTo(14.61860365, 7);
    expect(cameraZoomBounds({
      size,
      worldBounds: definition.worldBounds,
      yaw: definition.cameraPreset.desktopYaw,
      overviewPaddingCells: definition.cameraPreset.overviewPaddingCells,
      maximumZoom: definition.cameraPreset.maximumZoom,
    })).toEqual({ minimum, maximum: 56 });
  });

  it("fits every padded corner in the orthographic viewport", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const size = { width: 1280, height: 720 };
    const yaw = definition.cameraPreset.desktopYaw;
    const minimum = overviewMinimumCameraZoom({
      size,
      worldBounds: definition.worldBounds,
      yaw,
      overviewPaddingCells: 1,
    });
    const padding = BATTLEFIELD_CELL_CENTER_SPACING;
    const xSpan = definition.worldBounds.maxX - definition.worldBounds.minX + padding * 2;
    const zSpan = definition.worldBounds.maxZ - definition.worldBounds.minZ + padding * 2;
    const horizontalSpan = Math.abs(Math.cos(yaw)) * xSpan
      + Math.abs(Math.sin(yaw)) * zSpan;
    const verticalSpan = (
      Math.abs(Math.sin(yaw)) * xSpan
      + Math.abs(Math.cos(yaw)) * zSpan
    ) * BATTLE_CAMERA_HEIGHT
      / Math.hypot(BATTLE_CAMERA_HEIGHT, BATTLE_CAMERA_GROUND_DISTANCE);

    expect(size.width / minimum + 1e-10).toBeGreaterThanOrEqual(horizontalSpan);
    expect(size.height / minimum + 1e-10).toBeGreaterThanOrEqual(verticalSpan);
  });

  it("uses the active map and current yaw instead of the start zoom", () => {
    const size = { width: 1280, height: 720 };
    const legacy = LEGACY_BATTLEFIELD_DEFINITION;
    const sandbox = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const legacyMinimum = cameraZoomBounds({
      size,
      worldBounds: legacy.worldBounds,
      yaw: legacy.cameraPreset.desktopYaw,
      overviewPaddingCells: 1,
      maximumZoom: 56,
    }).minimum;
    const sandboxMinimum = cameraZoomBounds({
      size,
      worldBounds: sandbox.worldBounds,
      yaw: sandbox.cameraPreset.desktopYaw,
      overviewPaddingCells: 1,
      maximumZoom: 56,
    }).minimum;
    const rotatedMinimum = cameraZoomBounds({
      size,
      worldBounds: sandbox.worldBounds,
      yaw: 0,
      overviewPaddingCells: 1,
      maximumZoom: 56,
    }).minimum;

    expect(legacyMinimum).toBeCloseTo(25.2861481, 6);
    expect(sandboxMinimum).toBeCloseTo(14.61860365, 7);
    expect(rotatedMinimum).not.toBeCloseTo(sandboxMinimum, 5);
  });

  it("preserves the existing responsive legacy start framing", () => {
    expect(initialCameraZoom({ width: 1280, height: 720 }, 32)).toBe(32);
    expect(initialCameraZoom({ width: 844, height: 390 }, 32)).toBe(13);
    expect(initialCameraZoom({ width: 390, height: 748 }, 32)).toBeCloseTo(32.857);
    expect(initialCameraZoom({ width: 320, height: 472 }, 32)).toBeCloseTo(17.692);
  });

  it("fits the full sandbox map on portrait screens independently of its start zoom", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const bounds = cameraZoomBounds({
      size: { width: 390, height: 748 },
      worldBounds: definition.worldBounds,
      yaw: definition.cameraPreset.portraitYaw,
      overviewPaddingCells: definition.cameraPreset.overviewPaddingCells,
      maximumZoom: definition.cameraPreset.maximumZoom,
    });

    expect(bounds).toEqual({ minimum: 7.5, maximum: 56 });
    expect(definition.cameraPreset.startZoom).toBe(32);
  });

  it("can enlarge from the dynamic overview and never cross either map limit", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const bounds = cameraZoomBounds({
      size: { width: 1280, height: 720 },
      worldBounds: definition.worldBounds,
      yaw: definition.cameraPreset.desktopYaw,
      overviewPaddingCells: 1,
      maximumZoom: 56,
    });

    expect(clampedCameraZoom(bounds.minimum, 0.9, bounds)).toBe(bounds.minimum);
    expect(clampedCameraZoom(32, 1.1, bounds)).toBeCloseTo(35.2);
    expect(clampedCameraZoom(55, 1.1, bounds)).toBe(56);
  });

  it("maps wheel direction to smooth reciprocal zoom factors", () => {
    const enlarge = wheelZoomFactor(-100);
    const shrink = wheelZoomFactor(100);

    expect(enlarge).toBeCloseTo(1.1);
    expect(shrink).toBeCloseTo(1 / enlarge);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  it("normalizes line-based wheel events and bounds a single event", () => {
    expect(wheelZoomFactor(-3, 1)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-10_000)).toBeCloseTo(1.18);
    expect(wheelZoomFactor(10_000)).toBeCloseTo(1 / 1.18);
  });
});
