export type MiningCartPoint = readonly [x: number, y: number, z: number];

export interface MiningCartPose {
  readonly position: MiningCartPoint;
  readonly rotationY: number;
}

const MINING_CART_CYCLES_PER_SECOND = 0.32;
export const MINING_CART_HALF_CYCLE_SECONDS = 1 / MINING_CART_CYCLES_PER_SECOND;

export function miningCartPose(
  elapsedSeconds: number,
  phase: number,
  start: MiningCartPoint,
  destination: MiningCartPoint,
): MiningCartPose {
  const cycle = positiveModulo(elapsedSeconds * MINING_CART_CYCLES_PER_SECOND + phase, 2);
  const forward = cycle < 1;
  const halfProgress = forward ? cycle : cycle - 1;
  const eased = smoothstep(halfProgress);
  const progress = forward ? eased : 1 - eased;
  const heading = Math.atan2(destination[0] - start[0], destination[2] - start[2]);
  return {
    position: [
      mix(start[0], destination[0], progress),
      mix(start[1], destination[1], progress) + Math.sin(halfProgress * Math.PI) * 0.025,
      mix(start[2], destination[2], progress),
    ],
    rotationY: heading + (forward ? 0 : Math.PI),
  };
}

function smoothstep(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
