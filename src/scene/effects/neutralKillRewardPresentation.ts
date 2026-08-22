import type { BattleState, WorldPoint } from "../../game/battle";
import { MINING_INCOME_EFFECT_DURATION_SECONDS } from "./miningIncomePresentation";

export const NEUTRAL_KILL_REWARD_EFFECT_DURATION_SECONDS =
  MINING_INCOME_EFFECT_DURATION_SECONDS;

export interface NeutralKillRewardEffectPresentation {
  readonly sequence: number;
  readonly unitId: string;
  readonly amount: number;
  readonly position: WorldPoint;
  readonly age: number;
}

type NeutralKillRewardEffectSource = Pick<BattleState, "elapsed" | "events">;

export function neutralKillRewardEffectsAt(
  battle: NeutralKillRewardEffectSource,
): readonly NeutralKillRewardEffectPresentation[] {
  return battle.events.flatMap((event) => {
    if (event.type !== "neutral-kill-rewarded" || event.gold <= 0) return [];
    const age = battle.elapsed - event.time;
    if (age < -1e-6 || age > NEUTRAL_KILL_REWARD_EFFECT_DURATION_SECONDS) return [];
    return [{
      sequence: event.sequence,
      unitId: event.unitId,
      amount: event.gold,
      position: { ...event.position },
      age: Math.max(0, age),
    }];
  });
}
