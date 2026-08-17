import { describe, expect, it } from "vitest";

import {
  fieldPointerCoordinates,
  fieldPointerDistance,
  pinchZoomFactor,
  pointerDragExceedsThreshold,
  shouldStartFieldPointerInteraction,
} from "../../src/ui/fieldInput";

describe("battlefield pointer input", () => {
  it("does not capture a pointer that started from an embedded HUD control", () => {
    expect(shouldStartFieldPointerInteraction(0, {
      closest: () => ({ tagName: "BUTTON" }),
    })).toBe(false);
    expect(shouldStartFieldPointerInteraction(0, {
      closest: () => null,
    })).toBe(true);
    expect(shouldStartFieldPointerInteraction(2, {
      closest: () => null,
    })).toBe(false);
  });

  it("maps a clockwise-rotated portrait pointer back into landscape field space", () => {
    const landscape = fieldPointerCoordinates(
      { x: 360, y: 320 },
      { left: 0, right: 844, top: 56, width: 844, height: 334 },
      { width: 844, height: 334 },
      false,
    );
    const rotatedPortrait = fieldPointerCoordinates(
      { x: 70, y: 360 },
      { left: 0, right: 334, top: 0, width: 334, height: 844 },
      { width: 844, height: 334 },
      true,
    );

    expect(landscape).toEqual({ x: 360, y: 264 });
    expect(rotatedPortrait).toEqual(landscape);
  });

  it("converts pinch distance changes into bounded zoom factors", () => {
    expect(fieldPointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pinchZoomFactor(100, 110)).toBeCloseTo(1.1);
    expect(pinchZoomFactor(100, 20)).toBe(0.8);
    expect(pinchZoomFactor(100, 200)).toBe(1.25);
    expect(pinchZoomFactor(0, 100)).toBe(1);
  });

  it("distinguishes a deployment tap from a deliberate camera drag", () => {
    expect(pointerDragExceedsThreshold(
      { x: 20, y: 30 },
      { x: 25, y: 35 },
      8,
    )).toBe(false);
    expect(pointerDragExceedsThreshold(
      { x: 20, y: 30 },
      { x: 28, y: 30 },
      8,
    )).toBe(true);
  });
});
