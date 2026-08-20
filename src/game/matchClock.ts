import {
  MATCH_POLICIES,
  type MatchBonusResource,
  type MatchFinalBonus,
  type MatchPolicy,
} from "./rules";

export type MatchClockPhase = "normal" | "bonus";

export interface MatchClock {
  readonly elapsedSeconds: number;
  /** `null` means that this match has no time limit. */
  readonly remainingSeconds: number | null;
  readonly phase: MatchClockPhase;
  readonly activeBonus: MatchFinalBonus | null;
  readonly timedOut: boolean;
}

export function getMatchClock(
  elapsedSeconds: number,
  policy: MatchPolicy = MATCH_POLICIES.normal,
): MatchClock {
  const safeElapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  if (policy.durationSeconds === null) {
    return {
      elapsedSeconds: safeElapsed,
      remainingSeconds: null,
      phase: "normal",
      activeBonus: null,
      timedOut: false,
    };
  }

  const elapsed = Math.min(safeElapsed, policy.durationSeconds);
  const remainingSeconds = policy.durationSeconds - elapsed;
  const activeBonus = policy.finalBonus
    && remainingSeconds <= policy.finalBonus.startsAtRemainingSeconds
    ? policy.finalBonus
    : null;
  return {
    elapsedSeconds: elapsed,
    remainingSeconds,
    phase: activeBonus ? "bonus" : "normal",
    activeBonus,
    timedOut: remainingSeconds <= 0,
  };
}

export function getMatchResourceMultiplier(
  clock: MatchClock,
  resource: MatchBonusResource,
): number {
  return clock.activeBonus?.resource === resource
    ? clock.activeBonus.multiplier
    : 1;
}
