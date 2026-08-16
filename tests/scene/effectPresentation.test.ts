import { describe, expect, it } from "vitest";

import {
  BATTLE_FX_SEQUENCES,
  effectFrameIndex,
  projectileImpactLifetime,
  projectileArcOffset,
  projectileArcSlope,
} from "../../src/scene/effects/effectPresentation";

describe("battle effect presentation", () => {
  it("keeps only arrow and magic flight FX sequences", () => {
    expect(BATTLE_FX_SEQUENCES.arrowImpact).toHaveLength(6);
    expect(BATTLE_FX_SEQUENCES.magicFlight).toHaveLength(6);
    expect(BATTLE_FX_SEQUENCES).not.toHaveProperty("meleeSlash");
    expect(BATTLE_FX_SEQUENCES).not.toHaveProperty("magicImpact");
    expect(BATTLE_FX_SEQUENCES.arrowImpact[5]).toBe(
      "/assets/fx/battle/arrow-impact/Classic_24.png",
    );
    expect(BATTLE_FX_SEQUENCES.magicFlight[0]).toBe(
      "/assets/fx/battle/magic-flight/Alternative_1_25.png",
    );
    expect(new Set(Object.values(BATTLE_FX_SEQUENCES).flat()).size).toBe(12);
  });

  it("advances effect frames once and hides an effect after its duration", () => {
    expect(effectFrameIndex(-0.1, 0.3, 6)).toBe(0);
    expect(effectFrameIndex(0, 0.3, 6)).toBe(0);
    expect(effectFrameIndex(0.149, 0.3, 6)).toBe(2);
    expect(effectFrameIndex(0.299, 0.3, 6)).toBe(5);
    expect(effectFrameIndex(0.3, 0.3, 6)).toBeNull();
  });

  it("gives arrows a readable parabolic arc and tangent", () => {
    expect(projectileArcOffset("ranger", 0)).toBeCloseTo(0);
    expect(projectileArcOffset("ranger", 0.5)).toBeGreaterThanOrEqual(0.7);
    expect(projectileArcOffset("ranger", 1)).toBeCloseTo(0);
    expect(projectileArcSlope("ranger", 0, 8)).toBeGreaterThan(0);
    expect(projectileArcSlope("ranger", 0.5, 8)).toBeCloseTo(0);
    expect(projectileArcSlope("ranger", 1, 8)).toBeLessThan(0);
  });

  it("keeps magic launch-only while retaining arrow impact feedback", () => {
    expect(projectileImpactLifetime("mage")).toBe(0);
    expect(projectileImpactLifetime("ranger")).toBe(0.3);
  });
});
