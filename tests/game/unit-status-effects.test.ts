import { describe, expect, it } from "vitest";

import {
  BONE_DRAGON_FROST_SLOW,
  HUMAN_MAGE_BURNING,
  applyUnitStatusEffect,
  clearUnitStatusEffects,
  periodicStatusDamageForInterval,
  pruneUnitStatusEffects,
  unitStatusModifiers,
  type UnitStatusEffect,
} from "../../src/game/unitStatusEffects";

const dragonSource = { id: "dragon-1", targetType: "unit" as const };
const mageSource = { id: "mage-1", targetType: "unit" as const };

describe("unit status effects", () => {
  it("keeps different effects together while refreshing the same kind without stacking", () => {
    const slowed = applyUnitStatusEffect([], BONE_DRAGON_FROST_SLOW, dragonSource, 0);
    const combined = applyUnitStatusEffect(slowed, HUMAN_MAGE_BURNING, mageSource, 0.2);
    const refreshed = applyUnitStatusEffect(
      combined,
      BONE_DRAGON_FROST_SLOW,
      { id: "dragon-2", targetType: "unit" },
      0.5,
    );

    expect(slowed).toHaveLength(1);
    expect(combined.map(({ kind }) => kind)).toEqual(["frost-slow", "burning"]);
    expect(refreshed).toHaveLength(2);
    expect(refreshed.find(({ kind }) => kind === "frost-slow")).toMatchObject({
      appliedAt: 0,
      expiresAt: 1.5,
      sourceId: "dragon-2",
    });
    expect(unitStatusModifiers(refreshed)).toEqual({
      moveSpeedMultiplier: 0.7,
      attackSpeedMultiplier: 0.7,
    });
  });

  it("supports a future cleanse by category, kind, or source without mutating input", () => {
    const harmful = applyUnitStatusEffect([], BONE_DRAGON_FROST_SLOW, dragonSource, 0);
    const mixed = applyUnitStatusEffect(harmful, {
      ...HUMAN_MAGE_BURNING,
      dispelCategory: "beneficial",
    }, mageSource, 0);

    expect(clearUnitStatusEffects(mixed, { dispelCategories: ["harmful"] }))
      .toEqual([expect.objectContaining({ kind: "burning" })]);
    expect(clearUnitStatusEffects(mixed, { kinds: ["burning"] }))
      .toEqual([expect.objectContaining({ kind: "frost-slow" })]);
    expect(clearUnitStatusEffects(mixed, { sourceId: dragonSource.id }))
      .toEqual([expect.objectContaining({ sourceId: mageSource.id })]);
    expect(clearUnitStatusEffects(mixed)).toEqual([]);
    expect(mixed).toHaveLength(2);
  });

  it("deals two deterministic burn ticks over half a second at different step sizes", () => {
    const burning = applyUnitStatusEffect([], HUMAN_MAGE_BURNING, mageSource, 2)[0]!;
    const accumulatedDamage = (step: number): number => {
      let total = 0;
      for (let from = 2; from < burning.expiresAt - 1e-9; from += step) {
        total += periodicStatusDamageForInterval(
          burning,
          from,
          Math.min(burning.expiresAt, from + step),
        );
      }
      return total;
    };

    expect(periodicStatusDamageForInterval(burning, 2, 2.24)).toBe(0);
    expect(periodicStatusDamageForInterval(burning, 2.24, 2.25)).toBe(1);
    expect(periodicStatusDamageForInterval(burning, 2.49, 2.5)).toBe(1);
    expect(accumulatedDamage(0.1)).toBe(2);
    expect(accumulatedDamage(0.05)).toBe(2);
    expect(periodicStatusDamageForInterval(burning, 2.5, 3)).toBe(0);
  });

  it("keeps an effect until its absolute expiry boundary and then prunes it", () => {
    const effects = applyUnitStatusEffect([], BONE_DRAGON_FROST_SLOW, dragonSource, 4);

    expect(pruneUnitStatusEffects(effects, 4.999)).toHaveLength(1);
    expect(pruneUnitStatusEffects(effects, 5)).toEqual([]);
    expect(BONE_DRAGON_FROST_SLOW.durationSeconds).toBe(1);
    expect(HUMAN_MAGE_BURNING.durationSeconds).toBe(0.5);
  });

  it("accepts multiple active effect records as an immutable value", () => {
    const input: readonly UnitStatusEffect[] = Object.freeze([
      Object.freeze(applyUnitStatusEffect([], BONE_DRAGON_FROST_SLOW, dragonSource, 0)[0]!),
    ]);

    const output = applyUnitStatusEffect(input, HUMAN_MAGE_BURNING, mageSource, 0);

    expect(input).toHaveLength(1);
    expect(output).toHaveLength(2);
  });
});
