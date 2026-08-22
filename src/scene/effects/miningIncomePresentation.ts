import type { BattleState, WorldPoint } from "../../game/battle";
import { axialToWorld } from "../../map/battlefield";

export const MINING_INCOME_EFFECT_DURATION_SECONDS = 1.35;

export interface MiningIncomeEffectPresentation {
  readonly sequence: number;
  readonly mineId: string;
  readonly amount: number;
  readonly position: WorldPoint;
  readonly age: number;
}

type MiningIncomeEffectSource = Pick<
  BattleState,
  "buildings" | "matchElapsed" | "mining" | "miningLedger"
>;

export function miningIncomeEffectsAt(
  battle: MiningIncomeEffectSource,
): readonly MiningIncomeEffectPresentation[] {
  const buildingsById = new Map(battle.buildings.map((building) => [building.id, building]));
  return battle.miningLedger.flatMap((event) => {
    const age = battle.matchElapsed - event.scheduledAt;
    if (
      event.netCredited <= 0
      || age < -1e-6
      || age > MINING_INCOME_EFFECT_DURATION_SECONDS
    ) return [];
    const building = buildingsById.get(event.mineId);
    const pit = battle.mining?.pitsById[event.pitId];
    const position = building?.position ?? (pit ? axialToWorld(pit.coordinate) : null);
    if (!position) return [];
    return [{
      sequence: event.sequence,
      mineId: event.mineId,
      amount: event.netCredited,
      position: { ...position },
      age: Math.max(0, age),
    }];
  });
}

export function formatMiningIncomeAmount(amount: number): string {
  if (Math.abs(amount - Math.round(amount)) < 1e-7) return String(Math.round(amount));
  return amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
