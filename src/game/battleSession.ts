import { stepBattle, type BattleState } from "./battle";
import { applyPlannedCommands, type PlannedCommand } from "./battlePlans";
import type { Faction } from "./types";

export type BattlePhase = "briefing" | "engaged";

export interface BattlePhaseAccess {
  readonly inspectField: boolean;
  readonly issueCommands: boolean;
  readonly planCommands: boolean;
}

export interface BattleSessionState {
  readonly battle: BattleState;
  readonly phase: BattlePhase;
  readonly plannedCommands: readonly PlannedCommand[];
}

const PHASE_ACCESS: Readonly<Record<BattlePhase, BattlePhaseAccess>> = {
  briefing: { inspectField: true, issueCommands: false, planCommands: true },
  engaged: { inspectField: true, issueCommands: true, planCommands: false },
};

export function getBattlePhaseAccess(phase: BattlePhase): BattlePhaseAccess {
  return PHASE_ACCESS[phase];
}

export function beginBattleSession(
  session: BattleSessionState,
  issuerFaction: Faction,
): BattleSessionState {
  if (session.phase === "engaged") return session;
  return {
    battle: applyPlannedCommands(session.battle, session.plannedCommands, issuerFaction),
    phase: "engaged",
    plannedCommands: [],
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
    next = stepBattle(next, stepSeconds);
  }
  return next;
}
