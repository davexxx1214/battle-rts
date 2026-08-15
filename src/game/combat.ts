import type { Faction, WorldPoint } from "./types";

export type CombatTargetType = "unit" | "building";

export interface CombatTarget {
  readonly targetType: CombatTargetType;
  readonly id: string;
  readonly faction: Faction;
  readonly health: number;
  readonly position: WorldPoint;
}

export interface CombatDamageIntent {
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetType: CombatTargetType;
  readonly amount: number;
}
