export const SIMULATION_STEP_SECONDS = 0.05;
export const BATTLE_LOOP_POLL_INTERVAL_MS = 25;
export const BATTLE_LOOP_MAX_CATCH_UP_STEPS = 4;
export const BATTLE_LOOP_MAX_ELAPSED_SECONDS = 0.2;

export interface BattleLoopAdvance {
  readonly steps: number;
  readonly accumulatorSeconds: number;
}

export function advanceBattleLoopClock(
  accumulatorSeconds: number,
  elapsedSeconds: number,
): BattleLoopAdvance {
  const safeAccumulator = Number.isFinite(accumulatorSeconds)
    ? Math.max(0, accumulatorSeconds)
    : 0;
  const safeElapsed = Number.isFinite(elapsedSeconds)
    ? Math.min(BATTLE_LOOP_MAX_ELAPSED_SECONDS, Math.max(0, elapsedSeconds))
    : 0;
  const accumulated = safeAccumulator + safeElapsed;
  const steps = Math.min(
    BATTLE_LOOP_MAX_CATCH_UP_STEPS,
    Math.floor((accumulated + Number.EPSILON) / SIMULATION_STEP_SECONDS),
  );
  return Object.freeze({
    steps,
    accumulatorSeconds: accumulated - steps * SIMULATION_STEP_SECONDS,
  });
}
