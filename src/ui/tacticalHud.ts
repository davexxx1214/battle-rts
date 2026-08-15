import type {
  BattleState,
  UnitOrder,
  UnitStatus,
  WorldPoint,
} from "../game/battle";
import type { Faction, UnitRole } from "../game/types";
import { BATTLEFIELD_WORLD_BOUNDS } from "../map/battlefield";

export type SquadOrderSummary = UnitOrder["type"] | "mixed";
export type SquadStatusSummary = Exclude<UnitStatus, "dead"> | "holding" | "mixed";

export interface SelectedSquadSummary {
  readonly squadId: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly selectedCount: number;
  readonly livingCount: number;
  readonly initialSize: number;
  readonly averageHealthRatio: number;
  readonly order: SquadOrderSummary;
  readonly status: SquadStatusSummary;
}

export interface SquadMapMarker {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly position: WorldPoint;
  readonly livingCount: number;
}

export interface MinimapCameraInput {
  readonly center: WorldPoint;
  readonly width: number;
  readonly height: number;
  readonly yaw: number;
}

export interface MinimapCameraFrame {
  readonly center: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
}

export function summarizeSelectedSquads(
  battle: BattleState,
  selectedIds: readonly string[],
): SelectedSquadSummary[] {
  const selected = new Set(selectedIds);
  const unitsById = new Map(battle.units.map((unit) => [unit.id, unit]));

  return battle.squads.flatMap((squad) => {
    const members = squad.memberIds.flatMap((id) => {
      const unit = unitsById.get(id);
      return unit ? [unit] : [];
    });
    const living = members.filter((unit) => unit.health > 0);
    const selectedCount = living.filter((unit) => selected.has(unit.id)).length;
    if (selectedCount === 0) return [];

    const health = members.reduce((sum, unit) => sum + Math.max(0, unit.health), 0);
    const maximumHealth = members.reduce((sum, unit) => sum + unit.maxHealth, 0);
    const order = commonValue(living.map((unit) => unit.order.type));

    return [{
      squadId: squad.id,
      faction: squad.faction,
      role: squad.role,
      selectedCount,
      livingCount: living.length,
      initialSize: squad.initialSize,
      averageHealthRatio: maximumHealth > 0 ? health / maximumHealth : 0,
      order,
      status: summarizeSquadStatus(living.map((unit) => unit.status), order),
    }];
  });
}

export function createSquadMapMarkers(battle: BattleState): SquadMapMarker[] {
  const unitsById = new Map(battle.units.map((unit) => [unit.id, unit]));
  return battle.squads.flatMap((squad) => {
    const living = squad.memberIds.flatMap((id) => {
      const unit = unitsById.get(id);
      return unit && unit.health > 0 ? [unit] : [];
    });
    if (living.length === 0) return [];
    const position = living.reduce(
      (total, unit) => ({ x: total.x + unit.position.x, z: total.z + unit.position.z }),
      { x: 0, z: 0 },
    );
    return [{
      id: squad.id,
      faction: squad.faction,
      role: squad.role,
      position: {
        x: position.x / living.length,
        z: position.z / living.length,
      },
      livingCount: living.length,
    }];
  });
}

export function projectWorldToMinimap(point: WorldPoint): { x: number; y: number } {
  return {
    x: clampPercentage(((point.x - BATTLEFIELD_WORLD_BOUNDS.minX) / boundsWidth()) * 100),
    y: clampPercentage(((point.z - BATTLEFIELD_WORLD_BOUNDS.minZ) / boundsHeight()) * 100),
  };
}

export function createMinimapCameraFrame(input: MinimapCameraInput): MinimapCameraFrame {
  return {
    center: projectWorldToMinimap(input.center),
    width: Math.min(100, Math.max(0, (input.width / boundsWidth()) * 100)),
    height: Math.min(100, Math.max(0, (input.height / boundsHeight()) * 100)),
    rotationDegrees: input.yaw * (180 / Math.PI),
  };
}

function summarizeSquadStatus(
  statuses: readonly UnitStatus[],
  order: SquadOrderSummary,
): SquadStatusSummary {
  if (statuses.includes("attacking")) return "attacking";
  if (statuses.includes("moving")) return "moving";
  if (order === "hold") return "holding";
  const summary = commonValue(statuses);
  return summary === "dead" ? "idle" : summary;
}

function commonValue<T extends string>(values: readonly T[]): T | "mixed" {
  const first = values[0];
  if (!first) return "mixed";
  return values.every((value) => value === first) ? first : "mixed";
}

function boundsWidth(): number {
  return BATTLEFIELD_WORLD_BOUNDS.maxX - BATTLEFIELD_WORLD_BOUNDS.minX;
}

function boundsHeight(): number {
  return BATTLEFIELD_WORLD_BOUNDS.maxZ - BATTLEFIELD_WORLD_BOUNDS.minZ;
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}
