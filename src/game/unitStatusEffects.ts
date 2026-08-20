import type { CombatTargetType } from "./combat";

export type UnitStatusEffectKind = "frost-slow" | "burning";
export type UnitStatusDispelCategory = "harmful" | "beneficial";

interface UnitStatusEffectApplicationBase {
  readonly durationSeconds: number;
  readonly dispelCategory: UnitStatusDispelCategory;
}

export interface FrostSlowStatusApplication extends UnitStatusEffectApplicationBase {
  readonly kind: "frost-slow";
  readonly moveSpeedMultiplier: number;
  readonly attackSpeedMultiplier: number;
}

export interface BurningStatusApplication extends UnitStatusEffectApplicationBase {
  readonly kind: "burning";
  readonly tickIntervalSeconds: number;
  readonly damagePerTick: number;
}

export type UnitStatusEffectApplication =
  | FrostSlowStatusApplication
  | BurningStatusApplication;

interface UnitStatusEffectBase {
  /** Stable stacking/refresh key. Current effects refresh by kind instead of stacking. */
  readonly key: UnitStatusEffectKind;
  readonly sourceId: string;
  readonly sourceType: CombatTargetType;
  readonly appliedAt: number;
  readonly expiresAt: number;
  readonly dispelCategory: UnitStatusDispelCategory;
}

export type UnitStatusEffect =
  | (UnitStatusEffectBase & {
      readonly kind: "frost-slow";
      readonly moveSpeedMultiplier: number;
      readonly attackSpeedMultiplier: number;
    })
  | (UnitStatusEffectBase & {
      readonly kind: "burning";
      readonly tickIntervalSeconds: number;
      readonly damagePerTick: number;
    });

export interface CombatStatusEffectIntent {
  readonly sourceId: string;
  readonly sourceType: CombatTargetType;
  readonly targetId: string;
  readonly application: UnitStatusEffectApplication;
}

export interface UnitStatusEffectSource {
  readonly id: string;
  readonly targetType: CombatTargetType;
}

export interface UnitStatusEffectClearFilter {
  readonly kinds?: readonly UnitStatusEffectKind[];
  readonly dispelCategories?: readonly UnitStatusDispelCategory[];
  readonly sourceId?: string;
}

export interface UnitStatusModifiers {
  readonly moveSpeedMultiplier: number;
  readonly attackSpeedMultiplier: number;
}

export const BONE_DRAGON_FROST_SLOW = {
  kind: "frost-slow",
  durationSeconds: 1,
  dispelCategory: "harmful",
  moveSpeedMultiplier: 0.7,
  attackSpeedMultiplier: 0.7,
} as const satisfies FrostSlowStatusApplication;

export const HUMAN_MAGE_BURNING = {
  kind: "burning",
  durationSeconds: 0.5,
  dispelCategory: "harmful",
  tickIntervalSeconds: 0.25,
  damagePerTick: 1,
} as const satisfies BurningStatusApplication;

const TIME_EPSILON = 1e-9;

export function applyUnitStatusEffect(
  active: readonly UnitStatusEffect[],
  application: UnitStatusEffectApplication,
  source: UnitStatusEffectSource,
  appliedAt: number,
): readonly UnitStatusEffect[] {
  if (!Number.isFinite(application.durationSeconds) || application.durationSeconds <= 0) {
    return active;
  }
  const key = application.kind;
  const existingIndex = active.findIndex((effect) => effect.key === key);
  const originalAppliedAt = existingIndex >= 0
    ? active[existingIndex]!.appliedAt
    : appliedAt;
  const base = {
    key,
    sourceId: source.id,
    sourceType: source.targetType,
    appliedAt: originalAppliedAt,
    expiresAt: appliedAt + application.durationSeconds,
    dispelCategory: application.dispelCategory,
  } as const;
  const next: UnitStatusEffect = application.kind === "frost-slow"
    ? {
        ...base,
        kind: application.kind,
        moveSpeedMultiplier: Math.max(0, application.moveSpeedMultiplier),
        attackSpeedMultiplier: Math.max(0, application.attackSpeedMultiplier),
      }
    : {
        ...base,
        kind: application.kind,
        tickIntervalSeconds: application.tickIntervalSeconds,
        damagePerTick: application.damagePerTick,
      };
  if (existingIndex < 0) return [...active, next];
  return active.map((effect, index) => index === existingIndex ? next : effect);
}

export function pruneUnitStatusEffects(
  active: readonly UnitStatusEffect[],
  atTime: number,
): readonly UnitStatusEffect[] {
  return active.filter((effect) => isUnitStatusEffectActive(effect, atTime));
}

export function clearUnitStatusEffects(
  active: readonly UnitStatusEffect[],
  filter: UnitStatusEffectClearFilter = {},
): readonly UnitStatusEffect[] {
  return active.filter((effect) => !matchesClearFilter(effect, filter));
}

export function unitStatusModifiers(
  active: readonly UnitStatusEffect[],
): UnitStatusModifiers {
  let moveSpeedMultiplier = 1;
  let attackSpeedMultiplier = 1;
  for (const effect of active) {
    if (effect.kind !== "frost-slow") continue;
    moveSpeedMultiplier *= effect.moveSpeedMultiplier;
    attackSpeedMultiplier *= effect.attackSpeedMultiplier;
  }
  return { moveSpeedMultiplier, attackSpeedMultiplier };
}

export function periodicStatusDamageForInterval(
  effect: UnitStatusEffect,
  fromTime: number,
  toTime: number,
): number {
  if (
    effect.kind !== "burning"
    || effect.tickIntervalSeconds <= 0
    || effect.damagePerTick <= 0
    || toTime <= fromTime
  ) return 0;
  const intervalEnd = Math.min(toTime, effect.expiresAt);
  if (intervalEnd <= effect.appliedAt || intervalEnd + TIME_EPSILON < fromTime) return 0;
  const firstTickIndex = Math.floor(
    (Math.max(fromTime, effect.appliedAt) - effect.appliedAt + TIME_EPSILON)
      / effect.tickIntervalSeconds,
  ) + 1;
  const lastTickIndex = Math.floor(
    (intervalEnd - effect.appliedAt + TIME_EPSILON) / effect.tickIntervalSeconds,
  );
  const tickCount = Math.max(0, lastTickIndex - firstTickIndex + 1);
  return tickCount * effect.damagePerTick;
}

export function isUnitStatusEffectActive(
  effect: UnitStatusEffect,
  atTime: number,
): boolean {
  return effect.expiresAt - atTime > TIME_EPSILON;
}

function matchesClearFilter(
  effect: UnitStatusEffect,
  filter: UnitStatusEffectClearFilter,
): boolean {
  return (
    (!filter.kinds || filter.kinds.includes(effect.kind))
    && (!filter.dispelCategories || filter.dispelCategories.includes(effect.dispelCategory))
    && (!filter.sourceId || filter.sourceId === effect.sourceId)
  );
}
