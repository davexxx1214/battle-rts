export type CatapultPresentationStatus = "idle" | "moving" | "attacking" | "dead";

export interface CatapultMotionPose {
  readonly armRotation: number;
  readonly carriageRock: number;
}

export const CATAPULT_LOADED_ARM_ROTATION = -0.5;
const CATAPULT_RELEASED_ARM_ROTATION = 0.72;
const RELEASE_SECONDS = 0.28;
const REBOUND_END_SECONDS = 0.8;
const RELOAD_END_SECONDS = 3.35;

export function catapultMotionPose(attackAgeSeconds?: number): CatapultMotionPose {
  if (attackAgeSeconds === undefined || !Number.isFinite(attackAgeSeconds) || attackAgeSeconds < 0) {
    return { armRotation: CATAPULT_LOADED_ARM_ROTATION, carriageRock: 0 };
  }
  const age = attackAgeSeconds;
  if (age <= RELEASE_SECONDS) {
    const progress = easeOutCubic(age / RELEASE_SECONDS);
    return {
      armRotation: mix(
        CATAPULT_LOADED_ARM_ROTATION,
        CATAPULT_RELEASED_ARM_ROTATION,
        progress,
      ),
      carriageRock: -Math.sin((age / RELEASE_SECONDS) * Math.PI) * 0.075,
    };
  }
  if (age <= REBOUND_END_SECONDS) {
    const progress = smoothstep((age - RELEASE_SECONDS) / (REBOUND_END_SECONDS - RELEASE_SECONDS));
    return {
      armRotation: mix(CATAPULT_RELEASED_ARM_ROTATION, 0.58, progress),
      carriageRock: Math.sin(progress * Math.PI) * 0.035,
    };
  }
  if (age <= RELOAD_END_SECONDS) {
    const progress = smoothstep((age - REBOUND_END_SECONDS) / (RELOAD_END_SECONDS - REBOUND_END_SECONDS));
    return {
      armRotation: mix(0.58, CATAPULT_LOADED_ARM_ROTATION, progress),
      carriageRock: 0,
    };
  }
  return { armRotation: CATAPULT_LOADED_ARM_ROTATION, carriageRock: 0 };
}

export function wheelRotationForTravel(distance: number, wheelRadius = 0.31): number {
  if (!Number.isFinite(distance) || !Number.isFinite(wheelRadius) || wheelRadius <= 0) return 0;
  return Math.max(0, distance) / wheelRadius;
}

export function operatorAnimationForStatus(status: CatapultPresentationStatus): string {
  if (status === "dead") return "Death_A";
  if (status === "moving") return "Walking_A";
  if (status === "attacking") return "Working_B";
  return "Idle_A";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function smoothstep(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(progress: number): number {
  const clamped = clamp(progress, 0, 1);
  return 1 - (1 - clamped) ** 3;
}
