import { describe, expect, it } from "vitest";

import {
  BATTLE_FX_SEQUENCES,
  BATTLE_FX_URLS,
  FROST_BREATH_PARTICLES,
  FROST_BREATH_DURATION_SECONDS,
  FROST_BREATH_MOUTH_OFFSET,
  frostBreathLayout,
  effectFrameIndex,
  projectileImpactLifetime,
  projectileArcOffset,
  projectileArcSlope,
  projectileFlightHeight,
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

  it("keeps Kenney frost-breath particles on the shared battle FX preload list", () => {
    expect(FROST_BREATH_DURATION_SECONDS).toBe(0.62);
    expect(Object.values(FROST_BREATH_PARTICLES)).toEqual([
      "/assets/fx/kenney-particles/muzzle_03_rotated.png",
      "/assets/fx/kenney-particles/muzzle_01_rotated.png",
      "/assets/fx/kenney-particles/flare_01.png",
      "/assets/fx/kenney-particles/smoke_08.png",
      "/assets/fx/kenney-particles/flame_01.png",
      "/assets/fx/kenney-particles/magic_05.png",
      "/assets/fx/kenney-particles/circle_05.png",
    ]);
    expect(BATTLE_FX_URLS).toEqual(expect.arrayContaining(Object.values(FROST_BREATH_PARTICLES)));
    expect(BATTLE_FX_URLS).toHaveLength(19);
  });

  it("aims the frost jet from the dragon mouth along the attack ray", () => {
    const layout = frostBreathLayout({ x: 0, z: 0 }, { x: 8, z: 0 }, 6.8);
    expect(layout.directionX).toBeCloseTo(1);
    expect(layout.directionZ).toBeCloseTo(0);
    expect(layout.yaw).toBeCloseTo(0);
    expect(layout.mouthX).toBeCloseTo(FROST_BREATH_MOUTH_OFFSET);
    expect(layout.length).toBeCloseTo(6.8 - FROST_BREATH_MOUTH_OFFSET);
    expect(
      frostBreathLayout({ x: 0, z: 0 }, { x: 2, z: 0 }, 6.8).length,
    ).toBeCloseTo(layout.length);
  });

  it("advances effect frames once and hides an effect after its duration", () => {
    expect(effectFrameIndex(-0.1, 0.3, 6)).toBe(0);
    expect(effectFrameIndex(0, 0.3, 6)).toBe(0);
    expect(effectFrameIndex(0.149, 0.3, 6)).toBe(2);
    expect(effectFrameIndex(0.299, 0.3, 6)).toBe(5);
    expect(effectFrameIndex(0.3, 0.3, 6)).toBeNull();
  });

  it("lifts catapult stones on a smooth launch-to-landing arc instead of hex terrain steps", () => {
    const midArc = projectileFlightHeight("catapult", 0.5, 0.72, 0, 0.85, 0.85);
    expect(projectileFlightHeight("catapult", 0, 0.72, 0, 0.85, 0.85)).toBeCloseTo(1.57);
    expect(midArc).toBeCloseTo(0.72 + (0 - 0.72) * 0.5 + 0.85 + 3.8);
    expect(projectileFlightHeight("catapult", 1, 0.72, 0, 0.85, 0.85)).toBeCloseTo(0.85);
    expect(midArc).toBeGreaterThan(
      projectileFlightHeight("catapult", 0.25, 0.72, 0, 0.85, 0.85),
    );
    expect(midArc).toBeGreaterThan(
      projectileFlightHeight("catapult", 0.75, 0.72, 0, 0.85, 0.85),
    );
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
