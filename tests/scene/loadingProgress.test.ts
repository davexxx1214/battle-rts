import { describe, expect, it } from "vitest";

import { sceneAssetLoadPercentage } from "../../src/scene/loadingProgress";

describe("scene asset loading progress", () => {
  it("reports a bounded percentage", () => {
    expect(sceneAssetLoadPercentage({ loaded: 0, total: 0 })).toBe(0);
    expect(sceneAssetLoadPercentage({ loaded: 3, total: 8 })).toBe(38);
    expect(sceneAssetLoadPercentage({ loaded: 12, total: 8 })).toBe(100);
    expect(sceneAssetLoadPercentage({ loaded: -2, total: 8 })).toBe(0);
  });
});
