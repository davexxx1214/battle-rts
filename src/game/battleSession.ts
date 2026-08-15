import { stepBattle, type BattleState } from "./battle";
import type { BattlePhase, BattleSessionState } from "./battleSessionState";
import { advanceOpponentAi } from "./opponentAi";
import { GAME_RULES } from "./rules";

export type { BattlePhase, BattleSessionState } from "./battleSessionState";

export interface BattlePhaseAccess {
  readonly inspectField: boolean;
  readonly deployEntities: boolean;
}

const PHASE_ACCESS: Readonly<Record<BattlePhase, BattlePhaseAccess>> = {
  briefing: { inspectField: true, deployEntities: false },
  engaged: { inspectField: true, deployEntities: true },
};

export function getBattlePhaseAccess(phase: BattlePhase): BattlePhaseAccess {
  return PHASE_ACCESS[phase];
}

export function beginBattleSession(
  session: BattleSessionState,
): BattleSessionState {
  if (session.phase === "engaged") return session;
  return {
    battle: session.battle,
    phase: "engaged",
  };
}

export function advanceBattleSession(
  state: BattleState,
  phase: BattlePhase,
  steps: number,
  stepSeconds: number,
): BattleState {
  if (phase !== "engaged") return state;
  let next = state;
  for (let index = 0; index < steps; index += 1) {
    const previousMatchElapsed = next.matchElapsed;
    next = stepBattle(next, stepSeconds);
    const decisionCount = crossedDecisionCount(
      previousMatchElapsed,
      next.matchElapsed,
    );
    for (let decision = 0; decision < decisionCount; decision += 1) {
      next = advanceOpponentAi({ battle: next, phase }).battle;
    }
  }
  return next;
}

function crossedDecisionCount(start: number, end: number): number {
  const interval = GAME_RULES.opponentAi.decisionIntervalSeconds;
  if (end <= start || interval <= 0) return 0;
  const epsilon = 1e-9;
  const first = Math.floor((start + epsilon) / interval) + 1;
  const last = Math.floor((end + epsilon) / interval);
  return Math.max(0, last - first + 1);
}
