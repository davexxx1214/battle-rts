import { describe, expect, it } from "vitest";

import { STRUCTURE_SCENE_ASSETS } from "../../src/scene/assets";

describe("scene asset presentation", () => {
  it("keeps the siege workshop broad but low enough to reveal its facade", () => {
    const workshop = STRUCTURE_SCENE_ASSETS["siege-workshop"];

    expect(workshop.scale).toEqual([2.3, 1.65, 2.3]);
    expect(workshop.scale[1]).toBeLessThan(workshop.scale[0]);
  });
});
