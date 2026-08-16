import type { Faction, UnitRole, WorldPoint } from "./types";
import type { BuildingSimulationEvent } from "./buildings";
import type { BuildingKind, TroopKind } from "./rules";
import type { HexCoordinate } from "../map/battlefield";
import type { CombatTargetType } from "./combat";
import type { CastleActivationEvent } from "./castleCombat";

interface BattleEventBase {
  readonly sequence: number;
  readonly time: number;
}

export type BattleEventInput =
  | BuildingSimulationEvent
  | CastleActivationEvent
  | {
      readonly type: "gold-full";
      readonly faction: Faction;
      readonly promptSequence: number;
    }
  | ({
      readonly type: "deployment-succeeded";
      readonly faction: Faction;
      readonly deploymentId: string;
      readonly coordinate: HexCoordinate;
      readonly position: WorldPoint;
    } & (
      | {
          readonly entityType: "building";
          readonly kind: BuildingKind;
          readonly buildingId: string;
          readonly quantity: 1;
        }
      | {
          readonly entityType: "squad";
          readonly kind: TroopKind;
          readonly squadId: string;
          readonly unitIds: readonly string[];
          readonly quantity: number;
        }
    ))
  | {
      readonly type: "attack-started";
      readonly attackerId: string;
      readonly targetId: string;
      readonly targetType: CombatTargetType;
      readonly role: UnitRole | "castle" | "arrow-tower";
      readonly origin: WorldPoint;
      readonly targetPosition: WorldPoint;
    }
  | {
      readonly type: "projectile-spawned";
      readonly projectileId: string;
      readonly attackerId: string;
      readonly targetId: string;
      readonly targetType: CombatTargetType;
      readonly role: UnitRole;
      readonly origin: WorldPoint;
      readonly destination: WorldPoint;
    }
  | {
      readonly type: "projectile-hit";
      readonly projectileId: string;
      readonly attackerId: string;
      readonly targetId: string;
      readonly targetType: CombatTargetType;
      readonly role: UnitRole;
      readonly position: WorldPoint;
      readonly splashRadius: number;
    }
  | {
      readonly type: "damage-applied";
      readonly sourceId: string;
      readonly sourceRole: UnitRole | "castle" | "arrow-tower";
      readonly sourcePosition: WorldPoint;
      readonly targetId: string;
      readonly targetType: CombatTargetType;
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
