import { stepBattle, type BattleState } from "./battle";

export type BattlePhase = "briefing" | "engaged";

export interface BattlePhaseAccess {
  readonly inspectField: boolean;
  readonly issueCommands: boolean;
}

const PHASE_ACCESS: Readonly<Record<BattlePhase, BattlePhaseAccess>> = {
  briefing: { inspectField: true, issueCommands: false },
  engaged: { inspectField: true, issueCommands: true },
};

export function getBattlePhaseAccess(phase: BattlePhase): BattlePhaseAccess {
  return PHASE_ACCESS[phase];
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
    next = stepBattle(next, stepSeconds);
  }
  return next;
}
