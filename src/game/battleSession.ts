import { stepBattle, type BattleState } from "./battle";
import type { BattlePhase, BattleSessionState } from "./battleSessionState";
import { advanceOpponentAi } from "./opponentAi";
import {
  advanceSandboxOpponentAi,
  SANDBOX_AI_DECISION_INTERVAL_SECONDS,
  SANDBOX_AI_FIRST_DECISION_SECONDS,
} from "./sandboxOpponentAi";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import {
  DEFAULT_AI_DIFFICULTY,
  GAME_RULES,
  type AiDifficulty,
} from "./rules";

export type { BattlePhase, BattleSessionState } from "./battleSessionState";

export const HARD_AI_GOLD_RECOVERY_SPEED_MULTIPLIER = 1.3;

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
    ...session,
    phase: "engaged",
  };
}

export function advanceBattleSession(
  state: BattleState,
  phase: BattlePhase,
  steps: number,
  stepSeconds: number,
  aiDifficulty: AiDifficulty = DEFAULT_AI_DIFFICULTY,
): BattleState {
  if (phase !== "engaged") return state;
  const usesLegacyOpponentAi = resolveBattleRuntimeContext(state).mode.opponentPolicy.kind
    === "legacy-deployment-ai";
  const usesSandboxOpponentAi = resolveBattleRuntimeContext(state).mode.opponentPolicy.kind
    === "sandbox-rts-ai";
  let next = usesLegacyOpponentAi && aiDifficulty === "hard" && state.matchElapsed === 0
    ? withOpponentStartingGold(state, GAME_RULES.economy.maximumGold)
    : state;
  for (let index = 0; index < steps; index += 1) {
    const previousMatchElapsed = next.matchElapsed;
    next = stepBattle(
      next,
      stepSeconds,
      aiDifficulty === "hard"
        ? { crimson: HARD_AI_GOLD_RECOVERY_SPEED_MULTIPLIER }
        : undefined,
    );
    const decisionCount = usesLegacyOpponentAi
      ? crossedDecisionCount(previousMatchElapsed, next.matchElapsed, aiDifficulty)
      : 0;
    for (let decision = 0; decision < decisionCount; decision += 1) {
      next = advanceOpponentAi({ battle: next, phase }, aiDifficulty).battle;
    }
    const sandboxDecisionCount = usesSandboxOpponentAi
      ? crossedFixedDecisionCount(
          previousMatchElapsed,
          next.matchElapsed,
          SANDBOX_AI_FIRST_DECISION_SECONDS,
          SANDBOX_AI_DECISION_INTERVAL_SECONDS,
        )
      : 0;
    for (let decision = 0; decision < sandboxDecisionCount; decision += 1) {
      next = advanceSandboxOpponentAi(next);
    }
  }
  return next;
}

function withOpponentStartingGold(state: BattleState, gold: number): BattleState {
  const account = state.economy.accounts.crimson;
  return {
    ...state,
    economy: {
      ...state.economy,
      accounts: {
        ...state.economy.accounts,
        crimson: {
          ...account,
          gold,
          recoveryProgress: 0,
          isFull: gold >= GAME_RULES.economy.maximumGold,
        },
      },
    },
  };
}

function crossedFixedDecisionCount(
  start: number,
  end: number,
  firstDecision: number,
  interval: number,
): number {
  if (end <= start || interval <= 0 || firstDecision <= 0) return 0;
  const epsilon = 1e-9;
  const decisionsThrough = (elapsed: number) => (
    elapsed + epsilon < firstDecision
      ? 0
      : Math.floor((elapsed - firstDecision + epsilon) / interval) + 1
  );
  return Math.max(0, decisionsThrough(end) - decisionsThrough(start));
}

function crossedDecisionCount(
  start: number,
  end: number,
  difficulty: AiDifficulty,
): number {
  const strategy = GAME_RULES.opponentAi.strategies[difficulty];
  const interval = strategy.decisionIntervalSeconds;
  const firstDecision = strategy.firstDecisionSeconds;
  if (end <= start || interval <= 0 || firstDecision <= 0) return 0;
  return crossedFixedDecisionCount(start, end, firstDecision, interval);
}
