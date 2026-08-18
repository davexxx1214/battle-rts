import type { UnitRole } from "../../game/battle";
import battleFxManifest from "./battleFxManifest.json";

export const BATTLE_FX_SEQUENCES: Readonly<{
  readonly arrowImpact: readonly string[];
  readonly magicFlight: readonly string[];
}> = battleFxManifest;

export type BattleFxSequenceName = keyof typeof BATTLE_FX_SEQUENCES;

export const FROST_BREATH_PARTICLES = {
  muzzle: "/assets/fx/kenney-particles/muzzle_03_rotated.png",
  burst: "/assets/fx/kenney-particles/muzzle_01_rotated.png",
  flare: "/assets/fx/kenney-particles/flare_01.png",
  smoke: "/assets/fx/kenney-particles/smoke_08.png",
  wisp: "/assets/fx/kenney-particles/flame_01.png",
  sparkle: "/assets/fx/kenney-particles/magic_05.png",
  impact: "/assets/fx/kenney-particles/circle_05.png",
} as const;

export const FROST_BREATH_DURATION_SECONDS = 0.62;
export const FROST_BREATH_MOUTH_OFFSET = 1.25;
export const FROST_BREATH_MOUTH_HEIGHT = 0.56;

export function frostBreathLayout(
  origin: { readonly x: number; readonly z: number },
  target: { readonly x: number; readonly z: number },
  attackRange: number,
): {
  readonly directionX: number;
  readonly directionZ: number;
  readonly length: number;
  readonly yaw: number;
  readonly mouthX: number;
  readonly mouthZ: number;
} {
  const offsetX = target.x - origin.x;
  const offsetZ = target.z - origin.z;
  const distance = Math.hypot(offsetX, offsetZ);
  const directionX = distance > 1e-8 ? offsetX / distance : 0;
  const directionZ = distance > 1e-8 ? offsetZ / distance : 1;
  const length = Math.max(attackRange - FROST_BREATH_MOUTH_OFFSET, 3.6);
  return {
    directionX,
    directionZ,
    length,
    yaw: Math.atan2(-directionZ, directionX),
    mouthX: origin.x + directionX * FROST_BREATH_MOUTH_OFFSET,
    mouthZ: origin.z + directionZ * FROST_BREATH_MOUTH_OFFSET,
  };
}

export const BATTLE_FX_URLS = [
  ...Object.values(BATTLE_FX_SEQUENCES).flat(),
  ...Object.values(FROST_BREATH_PARTICLES),
];

const PROJECTILE_ARC_HEIGHTS = {
  knight: 0,
  spearman: 0,
  ranger: 0.74,
  mage: 0.34,
  catapult: 3.8,
  "bone-dragon": 0,
} as const satisfies Readonly<Record<UnitRole, number>>;

const PROJECTILE_IMPACT_LIFETIMES = {
  knight: 0,
  spearman: 0,
  ranger: 0.3,
  mage: 0,
  catapult: 0.24,
  "bone-dragon": 0,
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

export function projectileFlightHeight(
  role: UnitRole,
  progress: number,
  originHeight: number,
  destinationHeight: number,
  launchClearance: number,
  landingClearance: number,
): number {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return originHeight
    + (destinationHeight - originHeight) * normalizedProgress
    + launchClearance
    + (landingClearance - launchClearance) * normalizedProgress
    + projectileArcOffset(role, progress);
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
