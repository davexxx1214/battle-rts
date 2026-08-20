import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_DRAG_THRESHOLD_PX,
  DEPLOYMENT_LONG_PRESS_MS,
  deploymentGestureIntent,
} from "../../src/ui/deploymentDrag";

describe("deployment card drag gesture", () => {
  it("recognizes a long press after one second", () => {
    expect(DEPLOYMENT_LONG_PRESS_MS).toBe(1_000);
  });

  it("keeps a short stationary press available for the existing tap action", () => {
    expect(deploymentGestureIntent(
      { x: 40, y: 520 },
      { x: 43, y: 517 },
      false,
    )).toBe("pending");
  });

  it("starts dragging after a stationary long press", () => {
    expect(deploymentGestureIntent(
      { x: 40, y: 520 },
      { x: 40, y: 520 },
      true,
    )).toBe("drag");
  });

  it("leaves an intentional horizontal swipe to the card scroller", () => {
    expect(deploymentGestureIntent(
      { x: 80, y: 520 },
      { x: 80 + DEPLOYMENT_DRAG_THRESHOLD_PX + 4, y: 522 },
      false,
    )).toBe("scroll");
  });

  it("keeps an upward pull pending until the long press elapses", () => {
    expect(deploymentGestureIntent(
      { x: 80, y: 520 },
      { x: 82, y: 520 - DEPLOYMENT_DRAG_THRESHOLD_PX - 4 },
      false,
    )).toBe("pending");
    expect(deploymentGestureIntent(
      { x: 80, y: 520 },
      { x: 82, y: 520 - DEPLOYMENT_DRAG_THRESHOLD_PX - 4 },
      true,
    )).toBe("drag");
  });
});
