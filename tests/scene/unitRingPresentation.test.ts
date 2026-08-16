import { describe, expect, it } from "vitest";

import { UNIT_BASE_RING_GEOMETRY } from "../../src/scene/assets";
import {
  deploymentPreviewRingGeometry,
  unitBaseRingGeometry,
} from "../../src/scene/units/unitRingPresentation";

describe("unit ring presentation", () => {
  it("gives swordsmen and archers the same deployed ring size as catapults", () => {
    expect(unitBaseRingGeometry("knight")).toBe(UNIT_BASE_RING_GEOMETRY.catapult);
    expect(unitBaseRingGeometry("ranger")).toBe(UNIT_BASE_RING_GEOMETRY.catapult);
    expect(unitBaseRingGeometry("catapult")).toBe(UNIT_BASE_RING_GEOMETRY.catapult);
    expect(unitBaseRingGeometry("mage")).toBe(UNIT_BASE_RING_GEOMETRY.character);
  });

  it("uses the same larger circle for their placement previews", () => {
    for (const kind of ["swordsman", "archer", "catapult"] as const) {
      expect(deploymentPreviewRingGeometry(kind)).toBe(UNIT_BASE_RING_GEOMETRY.catapult);
    }
    expect(deploymentPreviewRingGeometry("mage")).toEqual({
      innerRadius: 0.38,
      outerRadius: 0.5,
      segments: 18,
    });
  });
});
