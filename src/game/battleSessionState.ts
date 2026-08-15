import type { BattleState } from "./battle";

export type BattlePhase = "briefing" | "engaged";

export interface BattleSessionState {
  readonly battle: BattleState;
  readonly phase: BattlePhase;
}
