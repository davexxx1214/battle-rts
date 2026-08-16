import type { UnitRole } from "../../game/battle";
import battleFxManifest from "./battleFxManifest.json";

export const BATTLE_FX_SEQUENCES: Readonly<{
  readonly arrowImpact: readonly string[];
  readonly magicFlight: readonly string[];
}> = battleFxManifest;

export type BattleFxSequenceName = keyof typeof BATTLE_FX_SEQUENCES;

export const BATTLE_FX_URLS = Object.values(BATTLE_FX_SEQUENCES).flat();

const PROJECTILE_ARC_HEIGHTS = {
  knight: 0,
  ranger: 0.74,
  mage: 0.34,
  catapult: 3.8,
} as const satisfies Readonly<Record<UnitRole, number>>;

const PROJECTILE_IMPACT_LIFETIMES = {
  knight: 0,
  ranger: 0.3,
  mage: 0,
  catapult: 0.24,
} as const satisfies Readonly<Record<UnitRole, number>>;

export function projectileImpactLifetime(role: UnitRole): number {
  return PROJECTILE_IMPACT_LIFETIMES[role];
}

export function effectFrameIndex(
  ageSeconds: number,
  durationSeconds: number,
  frameCount: number,
): number | null {
  if (durationSeconds <= 0 || frameCount <= 0 || ageSeconds >= durationSeconds) return null;
  const progress = Math.max(0, ageSeconds) / durationSeconds;
  return Math.min(frameCount - 1, Math.floor(progress * frameCount));
}

export function projectileArcOffset(role: UnitRole, progress: number): number {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return Math.sin(normalizedProgress * Math.PI) * PROJECTILE_ARC_HEIGHTS[role];
}

export function projectileArcSlope(
  role: UnitRole,
  progress: number,
  totalDistance: number,
): number {
  if (totalDistance <= 0) return 0;
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return (
    Math.cos(normalizedProgress * Math.PI)
    * Math.PI
    * PROJECTILE_ARC_HEIGHTS[role]
    / totalDistance
  );
}
