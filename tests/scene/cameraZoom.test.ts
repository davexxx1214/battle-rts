import { describe, expect, it } from "vitest";

import {
  cameraZoomBounds,
  clampedCameraZoom,
  initialCameraZoom,
  wheelZoomFactor,
} from "../../src/scene/camera/cameraZoom";

describe("battle camera zoom", () => {
  it("uses each battlefield's current desktop framing as its minimum size", () => {
    expect(cameraZoomBounds({ width: 1280, height: 720 }, 32)).toEqual({
      minimum: 32,
      maximum: 56,
    });
    expect(cameraZoomBounds({ width: 1280, height: 720 }, 31)).toEqual({
      minimum: 31,
      maximum: 56,
    });
  });

  it("preserves the existing compact viewport range", () => {
    expect(cameraZoomBounds({ width: 844, height: 390 }, 32)).toEqual({
      minimum: 11,
      maximum: 56,
    });
  });

  it("uses a dedicated portrait framing while preserving landscape defaults", () => {
    expect(initialCameraZoom({ width: 1280, height: 720 }, 32)).toBe(32);
    expect(initialCameraZoom({ width: 844, height: 390 }, 32)).toBe(13);
    expect(initialCameraZoom({ width: 390, height: 748 }, 32)).toBeCloseTo(32.857);
    expect(initialCameraZoom({ width: 320, height: 472 }, 32)).toBeCloseTo(17.692);
  });

  it("lets portrait screens zoom back out to the complete battlefield", () => {
    expect(cameraZoomBounds({ width: 768, height: 1024 }, 32)).toEqual({
      minimum: 11,
      maximum: 56,
    });
  });

  it("can enlarge from the desktop minimum but never shrink below it", () => {
    const bounds = cameraZoomBounds({ width: 1280, height: 720 }, 32);

    expect(clampedCameraZoom(32, 0.9, bounds)).toBe(32);
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
