import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_DRAG_THRESHOLD_PX,
  deploymentGestureIntent,
} from "../../src/ui/deploymentDrag";

describe("deployment card drag gesture", () => {
  it("keeps a stationary press available for the existing tap action", () => {
    expect(deploymentGestureIntent(
      { x: 40, y: 520 },
      { x: 43, y: 517 },
    )).toBe("pending");
  });

  it("does not start dragging while the pointer remains still", () => {
    expect(deploymentGestureIntent(
      { x: 40, y: 520 },
      { x: 40, y: 520 },
    )).toBe("pending");
  });

  it("leaves an intentional horizontal swipe to the card scroller", () => {
    expect(deploymentGestureIntent(
      { x: 80, y: 520 },
      { x: 80 + DEPLOYMENT_DRAG_THRESHOLD_PX + 4, y: 522 },
    )).toBe("scroll");
  });

  it("starts a deployment drag as soon as the card is pulled upward", () => {
    expect(deploymentGestureIntent(
      { x: 80, y: 520 },
      { x: 82, y: 520 - DEPLOYMENT_DRAG_THRESHOLD_PX - 4 },
    )).toBe("drag");
  });
});
