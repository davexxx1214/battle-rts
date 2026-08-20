import { describe, expect, it } from "vitest";

import {
  BATTLE_FX_SEQUENCES,
  BATTLE_FX_URLS,
  FIREBALL_COLORS,
  FROST_BREATH_PARTICLES,
  FROST_BREATH_DURATION_SECONDS,
  FROST_BREATH_MOUTH_HEIGHT,
  FROST_BREATH_MOUTH_OFFSET,
  LIGHTNING_STRIKE_COLORS,
  LIGHTNING_STRIKE_DURATION_SECONDS,
  LIGHTNING_STRIKE_HEIGHT,
  LIGHTNING_STRIKE_PARTICLES,
  POISON_CLOUD_COLORS,
  POISON_CLOUD_CORE_SCALE,
  POISON_CLOUD_FLIGHT_SCALE,
  POISON_CLOUD_IMPACT_DURATION_SECONDS,
  POISON_CLOUD_LANDING_HEIGHT,
  POISON_CLOUD_LAUNCH_HEIGHT,
  POISON_CLOUD_MUZZLE_DURATION_SECONDS,
  POISON_CLOUD_PARTICLES,
  combatProfileForAttacker,
  effectFrameIndex,
  frostBreathLayout,
  lightningBoltCenterOffset,
  lightningStrikePose,
  mageAttackUsesSkyLightning,
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
    expect(BATTLE_FX_URLS).toHaveLength(25);
  });

  it("preloads compact Kenney poison clouds for undead tower attacks", () => {
    expect(Object.values(POISON_CLOUD_PARTICLES)).toEqual([
      "/assets/fx/kenney-particles/smoke_08.png",
      "/assets/fx/kenney-particles/smoke_09.png",
      "/assets/fx/kenney-particles/smoke_10.png",
    ]);
    expect(BATTLE_FX_URLS).toEqual(expect.arrayContaining(
      Object.values(POISON_CLOUD_PARTICLES),
    ));
    expect(POISON_CLOUD_COLORS).toEqual({
      cloud: "#69c846",
      core: "#c0ed57",
      ring: "#78b936",
    });
    expect(POISON_CLOUD_FLIGHT_SCALE).toBe(0.82);
    expect(POISON_CLOUD_CORE_SCALE).toBeLessThan(POISON_CLOUD_FLIGHT_SCALE);
    expect(POISON_CLOUD_LAUNCH_HEIGHT).toBeLessThan(2.65);
    expect(POISON_CLOUD_LANDING_HEIGHT).toBeLessThan(1);
    expect(POISON_CLOUD_MUZZLE_DURATION_SECONDS).toBe(0.24);
    expect(POISON_CLOUD_IMPACT_DURATION_SECONDS).toBe(0.42);
  });

  it("uses Kenney lightning bolts for undead mage sky strikes", () => {
    expect(LIGHTNING_STRIKE_DURATION_SECONDS).toBe(0.4);
    expect(LIGHTNING_STRIKE_PARTICLES.bolt).toBe("/assets/fx/kenney-particles/spark_05.png");
    expect(LIGHTNING_STRIKE_PARTICLES.boltAlt).toBe("/assets/fx/kenney-particles/spark_06.png");
    expect(Object.values(LIGHTNING_STRIKE_PARTICLES)).toEqual([
      "/assets/fx/kenney-particles/spark_05.png",
      "/assets/fx/kenney-particles/spark_06.png",
      "/assets/fx/kenney-particles/trace_04.png",
      "/assets/fx/kenney-particles/spark_01.png",
      "/assets/fx/kenney-particles/flare_01.png",
      "/assets/fx/kenney-particles/circle_05.png",
    ]);
    expect(BATTLE_FX_URLS).toEqual(expect.arrayContaining([
      LIGHTNING_STRIKE_PARTICLES.bolt,
      LIGHTNING_STRIKE_PARTICLES.boltAlt,
      LIGHTNING_STRIKE_PARTICLES.glow,
      LIGHTNING_STRIKE_PARTICLES.burst,
    ]));
    expect(LIGHTNING_STRIKE_COLORS.bolt).toBe("#c084ff");
    expect(LIGHTNING_STRIKE_COLORS.impact).toBe("#9aff6e");
    expect(mageAttackUsesSkyLightning("mage", "undead")).toBe(true);
    expect(mageAttackUsesSkyLightning("mage", "human")).toBe(false);
    expect(mageAttackUsesSkyLightning("ranger", "undead")).toBe(false);
    expect(combatProfileForAttacker([
      { id: "crimson-mage-1", combatProfile: "undead" },
    ], "crimson-mage-1")).toBe("undead");
  });

  it("drops the lightning bolt from the sky before it flashes on the ground", () => {
    const start = lightningStrikePose(0, 3);
    const falling = lightningStrikePose(0.08, 3);
    const landed = lightningStrikePose(0.22, 3);
    const fading = lightningStrikePose(0.9, 3);
    expect(start.drop).toBeCloseTo(0);
    expect(falling.drop).toBeGreaterThan(0.4);
    expect(falling.drop).toBeLessThan(1);
    expect(landed.drop).toBeCloseTo(1);
    expect(landed.boltOpacity).toBeGreaterThan(start.boltOpacity);
    expect(fading.boltOpacity).toBeLessThan(0.4);
    expect(lightningBoltCenterOffset(0.04)).toBeGreaterThan(lightningBoltCenterOffset(1));
    expect(lightningBoltCenterOffset(1)).toBeCloseTo(LIGHTNING_STRIKE_HEIGHT / 2);
    expect(lightningStrikePose(0.2, 2).yaw).toBe(lightningStrikePose(0.8, 2).yaw);
    expect(lightningStrikePose(1, 0).boltOpacity).toBeCloseTo(0);
  });

  it("aims the frost jet from the dragon mouth along the attack ray", () => {
    const layout = frostBreathLayout({ x: 0, z: 0 }, { x: 8, z: 0 }, 6.8);
    expect(FROST_BREATH_MOUTH_OFFSET).toBe(1.9);
    expect(FROST_BREATH_MOUTH_HEIGHT).toBe(0.5);
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

  it("gives human fireballs and arrows readable impact feedback", () => {
    expect(FIREBALL_COLORS.flame).toBe("#ff6329");
    expect(projectileImpactLifetime("mage")).toBe(0.24);
    expect(projectileImpactLifetime("ranger")).toBe(0.3);
  });
});
