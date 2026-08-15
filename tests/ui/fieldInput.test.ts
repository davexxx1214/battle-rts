import { describe, expect, it } from "vitest";

import { shouldStartFieldPointerInteraction } from "../../src/ui/fieldInput";

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
});
