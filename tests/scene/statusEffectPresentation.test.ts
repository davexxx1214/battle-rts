import { describe, expect, it } from "vitest";

import {
  BONE_DRAGON_FROST_SLOW,
  HUMAN_MAGE_BURNING,
  applyUnitStatusEffect,
} from "../../src/game/unitStatusEffects";
import {
  BURNING_STATUS_FADE_OUT_SECONDS,
  STATUS_EFFECT_MODEL_TINTS,
  STATUS_EFFECT_FADE_OUT_SECONDS,
  unitStatusEffectOpacity,
  unitStatusEffectPhase,
  unitStatusEffectVisualRadius,
  unitStatusModelTint,
  visibleUnitStatusEffects,
} from "../../src/scene/effects/statusEffectPresentation";

describe("unit status-effect presentation", () => {
  it("shows simultaneous active effects and hides them at expiry", () => {
    const slowed = applyUnitStatusEffect(
      [],
      BONE_DRAGON_FROST_SLOW,
      { id: "dragon", targetType: "unit" },
      2,
    );
    const combined = applyUnitStatusEffect(
      slowed,
      HUMAN_MAGE_BURNING,
      { id: "mage", targetType: "unit" },
      2,
    );

    expect(visibleUnitStatusEffects(combined, 2.25).map(({ kind }) => kind))
      .toEqual(["frost-slow", "burning"]);
    expect(visibleUnitStatusEffects(combined, 2.5).map(({ kind }) => kind))
      .toEqual(["frost-slow"]);
    expect(visibleUnitStatusEffects(combined, 3)).toEqual([]);
  });

  it("scales status visuals to each unit footprint", () => {
    expect(unitStatusEffectVisualRadius("bone-dragon"))
      .toBeGreaterThan(unitStatusEffectVisualRadius("catapult"));
    expect(unitStatusEffectVisualRadius("catapult"))
      .toBeGreaterThan(unitStatusEffectVisualRadius("mage"));
  });

  it("uses a stable per-unit phase and fades during the final presentation window", () => {
    const effect = applyUnitStatusEffect(
      [],
      BONE_DRAGON_FROST_SLOW,
      { id: "dragon", targetType: "unit" },
      0,
    )[0]!;

    expect(unitStatusEffectPhase("unit-a")).toBe(unitStatusEffectPhase("unit-a"));
    expect(unitStatusEffectPhase("unit-a")).not.toBe(unitStatusEffectPhase("unit-b"));
    expect(unitStatusEffectOpacity(effect, 0.1)).toBe(1);
    expect(unitStatusEffectOpacity(effect, 1 - STATUS_EFFECT_FADE_OUT_SECONDS / 2))
      .toBeCloseTo(0.5);
    expect(unitStatusEffectOpacity(effect, 1)).toBe(0);
  });

  it("keeps the short burning effect readable with a faster fade", () => {
    const burning = applyUnitStatusEffect(
      [],
      HUMAN_MAGE_BURNING,
      { id: "mage", targetType: "unit" },
      0,
    )[0]!;

    expect(unitStatusEffectOpacity(burning, 0.1)).toBe(1);
    expect(unitStatusEffectOpacity(
      burning,
      burning.expiresAt - BURNING_STATUS_FADE_OUT_SECONDS / 2,
    )).toBeCloseTo(0.5);
    expect(unitStatusEffectOpacity(burning, burning.expiresAt)).toBe(0);
  });

  it("uses the most recently applied status for the model tint", () => {
    const slowed = applyUnitStatusEffect(
      [],
      BONE_DRAGON_FROST_SLOW,
      { id: "dragon", targetType: "unit" },
      0,
    );
    const combined = applyUnitStatusEffect(
      slowed,
      HUMAN_MAGE_BURNING,
      { id: "mage", targetType: "unit" },
      0.1,
    );
    const slowedLast = applyUnitStatusEffect(
      combined,
      BONE_DRAGON_FROST_SLOW,
      { id: "dragon-2", targetType: "unit" },
      0.3,
    );

    expect(unitStatusModelTint(slowed, 0.25)).toMatchObject({
      kind: "frost-slow",
      color: STATUS_EFFECT_MODEL_TINTS["frost-slow"].color,
    });
    expect(unitStatusModelTint(combined, 0.25)).toMatchObject({
      kind: "burning",
      color: STATUS_EFFECT_MODEL_TINTS.burning.color,
    });
    expect(unitStatusModelTint(slowedLast, 0.35)).toMatchObject({
      kind: "frost-slow",
      color: STATUS_EFFECT_MODEL_TINTS["frost-slow"].color,
    });
    expect(unitStatusModelTint(slowedLast, 1.3)).toBeNull();
  });
});
