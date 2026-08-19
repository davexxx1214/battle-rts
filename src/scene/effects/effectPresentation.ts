import type { UnitCombatProfile, UnitRole } from "../../game/types";
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
export const FROST_BREATH_MOUTH_OFFSET = 1.65;
export const FROST_BREATH_MOUTH_HEIGHT = 0.56;

export const LIGHTNING_STRIKE_PARTICLES = {
  bolt: "/assets/fx/kenney-particles/spark_05.png",
  boltAlt: "/assets/fx/kenney-particles/spark_06.png",
  glow: "/assets/fx/kenney-particles/trace_04.png",
  burst: "/assets/fx/kenney-particles/spark_01.png",
  flare: "/assets/fx/kenney-particles/flare_01.png",
  impact: "/assets/fx/kenney-particles/circle_05.png",
} as const;

export const LIGHTNING_STRIKE_DURATION_SECONDS = 0.4;
export const LIGHTNING_STRIKE_HEIGHT = 6.2;
export const LIGHTNING_STRIKE_WIDTH = 1.55;
export const LIGHTNING_STRIKE_GROUND_OFFSET = 0.16;

export const LIGHTNING_STRIKE_COLORS = {
  core: "#f6eeff",
  bolt: "#c084ff",
  glow: "#8b5cf6",
  impact: "#9aff6e",
  spark: "#e9ff9a",
} as const;

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

const FROST_BREATH_URLS = new Set<string>(Object.values(FROST_BREATH_PARTICLES));

export const BATTLE_FX_URLS = [
  ...Object.values(BATTLE_FX_SEQUENCES).flat(),
  ...Object.values(FROST_BREATH_PARTICLES),
  ...Object.values(LIGHTNING_STRIKE_PARTICLES).filter((url) => !FROST_BREATH_URLS.has(url)),
];

export function mageAttackUsesSkyLightning(
  role: UnitRole | string,
  combatProfile: UnitCombatProfile | undefined,
): boolean {
  return role === "mage" && combatProfile === "undead";
}

export function combatProfileForAttacker(
  units: readonly { readonly id: string; readonly combatProfile: UnitCombatProfile }[],
  attackerId: string,
): UnitCombatProfile | undefined {
  return units.find((unit) => unit.id === attackerId)?.combatProfile;
}

export function lightningStrikePose(progress: number, sequence = 0): {
  readonly drop: number;
  readonly boltOpacity: number;
  readonly glowOpacity: number;
  readonly impactOpacity: number;
  readonly flareOpacity: number;
  readonly burstOpacity: number;
  readonly boltWidth: number;
  readonly yaw: number;
  readonly flicker: 0 | 1;
} {
  const normalized = Math.max(0, Math.min(1, progress));
  const drop = Math.max(0, Math.min(1, normalized / 0.16));
  const rise = Math.min(1, normalized / 0.08);
  const hold = normalized < 0.58 ? 1 : Math.max(0, 1 - (normalized - 0.58) / 0.42);
  const envelope = rise * hold;
  const flicker = Math.floor((normalized * 24 + sequence) % 2) as 0 | 1;
  const burstWave = Math.max(0, Math.min(1, (normalized - 0.12) / 0.55));
  return {
    drop,
    boltOpacity: envelope * (flicker === 0 ? 1 : 0.72),
    glowOpacity: envelope * 0.55,
    impactOpacity: envelope * (0.35 + drop * 0.65) * 0.9,
    flareOpacity: envelope * drop * 0.95,
    burstOpacity: Math.sin(burstWave * Math.PI) * 0.88,
    boltWidth: LIGHTNING_STRIKE_WIDTH * (0.88 + flicker * 0.18),
    yaw: (sequence * 2.399) % Math.PI,
    flicker,
  };
}

export function lightningBoltCenterOffset(drop: number): number {
  const height = LIGHTNING_STRIKE_HEIGHT * Math.max(drop, 0.04);
  return LIGHTNING_STRIKE_HEIGHT - height / 2;
}

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
