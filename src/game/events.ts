import type { Faction, UnitRole, WorldPoint } from "./types";
import type { BuildingSimulationEvent } from "./buildings";

interface BattleEventBase {
  readonly sequence: number;
  readonly time: number;
}

export type BattleEventInput =
  | BuildingSimulationEvent
  | {
      readonly type: "gold-full";
      readonly faction: Faction;
      readonly promptSequence: number;
    }
  | {
      readonly type: "attack-started";
      readonly attackerId: string;
      readonly targetId: string;
      readonly role: UnitRole;
      readonly origin: WorldPoint;
      readonly targetPosition: WorldPoint;
    }
  | {
      readonly type: "projectile-spawned";
      readonly projectileId: string;
      readonly attackerId: string;
      readonly targetId: string;
      readonly role: UnitRole;
      readonly origin: WorldPoint;
      readonly destination: WorldPoint;
    }
  | {
      readonly type: "projectile-hit";
      readonly projectileId: string;
      readonly attackerId: string;
      readonly targetId: string;
      readonly role: UnitRole;
      readonly position: WorldPoint;
      readonly splashRadius: number;
    }
  | {
      readonly type: "damage-applied";
      readonly sourceId: string;
      readonly sourceRole: UnitRole;
      readonly sourcePosition: WorldPoint;
      readonly targetId: string;
      readonly targetPosition: WorldPoint;
      readonly amount: number;
    }
  | {
      readonly type: "unit-died";
      readonly unitId: string;
      readonly killerId: string | null;
    };

export type BattleEvent = BattleEventInput & BattleEventBase;

export function stampBattleEvent(
  input: BattleEventInput,
  sequence: number,
  time: number,
): BattleEvent {
  return { ...input, sequence, time };
}

export function pruneBattleEvents(
  events: readonly BattleEvent[],
  minimumTime: number,
): BattleEvent[] {
  return events.filter((event) => event.time >= minimumTime);
}
