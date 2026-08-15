import {
  axialToWorld,
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import {
  removeBuildingFromOccupancy,
  type BuildingOccupancy,
} from "./deployment";
import type { CombatDamageIntent, CombatTarget } from "./combat";
import { grantGold, type EconomyState } from "./economy";
import {
  GAME_RULES,
  TROOP_ROLE_BY_DEPLOYABLE,
  type BuildingKind,
} from "./rules";
import type { Faction, UnitRole, WorldPoint } from "./types";

export type BattleBuildingKind = BuildingKind | "castle";
export type BattleBuildingStatus = "active" | "destroyed";

export interface BattleBuilding extends CombatTarget {
  readonly targetType: "building";
  readonly id: string;
  readonly kind: BattleBuildingKind;
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly maxHealth: number;
  readonly health: number;
  readonly createdAt: number;
  readonly lifetimeSeconds: number | null;
  readonly productionSequence: number;
  readonly status: BattleBuildingStatus;
  readonly diedAt: number | null;
  readonly removeAt: number | null;
}

export interface CreateBattleBuildingInput {
  readonly id: string;
  readonly kind: BattleBuildingKind;
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly createdAt: number;
}

export interface BuildingSpawnBlocker {
  readonly position: WorldPoint;
  readonly health: number;
}

export interface BuildingUnitSpawn {
  readonly buildingId: string;
  readonly unitId: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly position: WorldPoint;
  readonly scheduledAt: number;
  readonly spawnSequence: number;
}

export type BuildingSimulationEvent =
  | {
      readonly type: "building-gold-produced";
      readonly buildingId: string;
      readonly faction: Faction;
      readonly scheduledAt: number;
      readonly productionSequence: number;
      readonly producedAmount: number;
      readonly creditedAmount: number;
      readonly wastedAmount: number;
    }
  | {
      readonly type: "building-unit-spawned";
      readonly buildingId: string;
      readonly faction: Faction;
      readonly unitId: string;
      readonly role: UnitRole;
      readonly position: WorldPoint;
      readonly scheduledAt: number;
      readonly spawnSequence: number;
    }
  | {
      readonly type: "building-unit-spawn-skipped";
      readonly buildingId: string;
      readonly faction: Faction;
      readonly scheduledAt: number;
      readonly spawnSequence: number;
      readonly reason: "no-valid-position";
    }
  | {
      readonly type: "building-destroyed";
      readonly buildingId: string;
      readonly faction: Faction;
      readonly kind: BattleBuildingKind;
      readonly scheduledAt: number;
      readonly coordinate: HexCoordinate;
      readonly position: WorldPoint;
      readonly removeAt: number;
      readonly cause: "expired" | "damage" | "combined";
    };

export interface AdvanceBuildingsInput {
  readonly buildings: readonly BattleBuilding[];
  readonly economy: EconomyState;
  readonly occupancy: BuildingOccupancy;
  readonly map: BattlefieldMap;
  readonly units: readonly BuildingSpawnBlocker[];
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly damageIntents: readonly CombatDamageIntent[];
}

export interface AdvanceBuildingsResult {
  readonly buildings: readonly BattleBuilding[];
  readonly economy: EconomyState;
  readonly occupancy: BuildingOccupancy;
  readonly unitSpawns: readonly BuildingUnitSpawn[];
  readonly events: readonly BuildingSimulationEvent[];
  readonly newlyFullFactions: readonly Faction[];
}

export interface BuildingCleanupResult {
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
}

type ProductionAction =
  | {
      readonly type: "produce-gold";
      readonly building: BattleBuilding;
      readonly scheduledAt: number;
      readonly sequence: number;
    }
  | {
      readonly type: "spawn-unit";
      readonly building: BattleBuilding;
      readonly scheduledAt: number;
      readonly sequence: number;
    };

interface DestructionAction {
  readonly type: "destroy";
  readonly building: BattleBuilding;
  readonly scheduledAt: number;
  readonly cause: "expired" | "damage" | "combined";
}

type BuildingAction = ProductionAction | DestructionAction;

interface BuildingSettlement {
  readonly building: BattleBuilding;
  readonly actions: readonly BuildingAction[];
}

const TIME_EPSILON = 1e-9;
const FACTIONS: readonly Faction[] = ["verdant", "crimson"];
const VERDANT_SPAWN_DIRECTIONS: readonly HexCoordinate[] = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 0 },
  { q: 1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function createBattleBuilding(
  input: CreateBattleBuildingInput,
): BattleBuilding {
  if (input.id.trim().length === 0) {
    throw new Error("Building requires a non-empty id.");
  }
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) {
    throw new Error("Building requires a finite creation time at or after zero.");
  }
  if (
    !Number.isFinite(input.coordinate.q)
    || !Number.isFinite(input.coordinate.r)
    || !Number.isInteger(input.coordinate.q)
    || !Number.isInteger(input.coordinate.r)
  ) {
    throw new Error("Building requires a finite integer hex coordinate.");
  }
  const spec = buildingHealthSpec(input.kind);
  return {
    ...input,
    targetType: "building",
    coordinate: { ...input.coordinate },
    position: axialToWorld(input.coordinate),
    maxHealth: spec.maxHealth,
    health: spec.maxHealth,
    lifetimeSeconds: spec.lifetimeSeconds,
    productionSequence: 0,
    status: "active",
    diedAt: null,
    removeAt: null,
  };
}

export function advanceBuildings(
  input: AdvanceBuildingsInput,
): AdvanceBuildingsResult {
  if (
    !Number.isFinite(input.elapsedSeconds)
    || input.elapsedSeconds < 0
    || !Number.isFinite(input.deltaSeconds)
    || input.deltaSeconds <= 0
  ) {
    return unchangedResult(input);
  }
  const end = input.elapsedSeconds + input.deltaSeconds;
  if (!Number.isFinite(end)) return unchangedResult(input);
  const damageByBuildingId = collectDamage(input.damageIntents);
  const settlements = input.buildings.map((building) => settleBuilding(
    building,
    input.elapsedSeconds,
    end,
    damageByBuildingId.get(building.id) ?? 0,
  ));
  const actions = settlements
    .flatMap((settlement) => settlement.actions)
    .sort(compareActions);
  const spawnedCoordinateKeys = new Set<string>();
  const unitSpawns: BuildingUnitSpawn[] = [];
  const events: BuildingSimulationEvent[] = [];
  const newlyFullFactions = new Set<Faction>();
  let economy = input.economy;

  for (const action of actions) {
    if (action.type === "produce-gold") {
      const producedAmount = GAME_RULES.buildings.goldMine.goldPerProduction;
      const grant = grantGold(economy, action.building.faction, producedAmount);
      economy = grant.state;
      if (grant.becameFull) newlyFullFactions.add(action.building.faction);
      events.push({
        type: "building-gold-produced",
        buildingId: action.building.id,
        faction: action.building.faction,
        scheduledAt: action.scheduledAt,
        productionSequence: action.sequence,
        producedAmount,
        creditedAmount: grant.creditedAmount,
        wastedAmount: grant.wastedAmount,
      });
      continue;
    }
    if (action.type === "spawn-unit") {
      const position = resolveSpawnPosition(
        action.building,
        input.map,
        input.occupancy,
        input.units,
        spawnedCoordinateKeys,
      );
      if (!position) {
        events.push({
          type: "building-unit-spawn-skipped",
          buildingId: action.building.id,
          faction: action.building.faction,
          scheduledAt: action.scheduledAt,
          spawnSequence: action.sequence,
          reason: "no-valid-position",
        });
        continue;
      }
      spawnedCoordinateKeys.add(coordinateKey(worldToAxial(position)));
      const spawnedUnit = GAME_RULES.buildings.barracks.spawnedUnit;
      const spawn: BuildingUnitSpawn = {
        buildingId: action.building.id,
        unitId: `${action.building.id}-${spawnedUnit}-${action.sequence}`,
        faction: action.building.faction,
        role: TROOP_ROLE_BY_DEPLOYABLE[spawnedUnit],
        position,
        scheduledAt: action.scheduledAt,
        spawnSequence: action.sequence,
      };
      unitSpawns.push(spawn);
      events.push({ type: "building-unit-spawned", ...spawn });
      continue;
    }
    events.push({
      type: "building-destroyed",
      buildingId: action.building.id,
      faction: action.building.faction,
      kind: action.building.kind,
      scheduledAt: action.scheduledAt,
      coordinate: { ...action.building.coordinate },
      position: { ...action.building.position },
      removeAt: normalizeSimulationTime(
        action.scheduledAt + GAME_RULES.buildings.destructionSeconds,
      ),
      cause: action.cause,
    });
  }

  const cleanup = removeDestroyedBuildingsAt(
    settlements.map((settlement) => settlement.building),
    input.occupancy,
    end,
  );

  return {
    buildings: cleanup.buildings,
    economy,
    occupancy: cleanup.occupancy,
    unitSpawns,
    events,
    newlyFullFactions: FACTIONS.filter((faction) => newlyFullFactions.has(faction)),
  };
}

export function removeDestroyedBuildingsAt(
  buildings: readonly BattleBuilding[],
  occupancy: BuildingOccupancy,
  elapsedSeconds: number,
): BuildingCleanupResult {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return { buildings, occupancy };
  }
  const removedIds = buildings
    .filter((building) => (
      building.status === "destroyed"
      && building.removeAt !== null
      && building.removeAt <= elapsedSeconds + TIME_EPSILON
    ))
    .map((building) => building.id);
  if (removedIds.length === 0) return { buildings, occupancy };
  const removed = new Set(removedIds);
  let nextOccupancy = occupancy;
  for (const buildingId of removedIds) {
    nextOccupancy = removeBuildingFromOccupancy(nextOccupancy, buildingId);
  }
  return {
    buildings: buildings.filter((building) => !removed.has(building.id)),
    occupancy: nextOccupancy,
  };
}

function settleBuilding(
  building: BattleBuilding,
  start: number,
  end: number,
  directDamage: number,
): BuildingSettlement {
  if (building.status === "destroyed" || building.health <= 0 || end <= building.createdAt) {
    return { building, actions: [] };
  }
  const activeStart = Math.max(start, building.createdAt);
  const naturalDamageRate = building.lifetimeSeconds === null
    ? 0
    : building.maxHealth / building.lifetimeSeconds;
  const naturalDeathAt = naturalDamageRate > 0
    ? activeStart + building.health / naturalDamageRate
    : Number.POSITIVE_INFINITY;
  const productionCutoff = Math.min(end, naturalDeathAt);
  const production = collectProductionActions(building, productionCutoff);
  const activeEnd = Math.min(end, naturalDeathAt);
  const naturalDamage = naturalDamageRate * Math.max(0, activeEnd - activeStart);
  const healthAfterNatural = Math.max(0, building.health - naturalDamage);
  const naturallyDestroyed = naturalDeathAt <= end + TIME_EPSILON;
  const appliedDirectDamage = naturallyDestroyed && naturalDeathAt < end - TIME_EPSILON
    ? 0
    : directDamage;
  const health = Math.max(0, healthAfterNatural - appliedDirectDamage);
  const destroyed = health <= TIME_EPSILON;
  const deathAt = normalizeSimulationTime(
    naturallyDestroyed ? Math.min(naturalDeathAt, end) : end,
  );
  const cause = naturallyDestroyed
    ? appliedDirectDamage > 0 ? "combined" : "expired"
    : naturalDamage > 0 && appliedDirectDamage > 0 ? "combined" : "damage";
  const actions: BuildingAction[] = [...production.actions];
  if (destroyed) {
    actions.push({ type: "destroy", building, scheduledAt: deathAt, cause });
  }
  return {
    actions,
    building: {
      ...building,
      health: destroyed ? 0 : health,
      productionSequence: production.sequence,
      status: destroyed ? "destroyed" : "active",
      diedAt: destroyed ? deathAt : null,
      removeAt: destroyed
        ? normalizeSimulationTime(deathAt + GAME_RULES.buildings.destructionSeconds)
        : null,
    },
  };
}

function collectProductionActions(
  building: BattleBuilding,
  cutoff: number,
): { readonly actions: readonly ProductionAction[]; readonly sequence: number } {
  if (building.kind === "castle") {
    return { actions: [], sequence: building.productionSequence };
  }
  const config = building.kind === "gold-mine"
    ? {
        first: GAME_RULES.buildings.goldMine.firstProductionSeconds,
        interval: GAME_RULES.buildings.goldMine.productionIntervalSeconds,
        maximum: Number.POSITIVE_INFINITY,
        type: "produce-gold" as const,
      }
    : {
        first: GAME_RULES.buildings.barracks.firstSpawnSeconds,
        interval: GAME_RULES.buildings.barracks.spawnIntervalSeconds,
        maximum: GAME_RULES.buildings.barracks.spawnCount,
        type: "spawn-unit" as const,
      };
  const actions: ProductionAction[] = [];
  let sequence = building.productionSequence;
  while (sequence < config.maximum) {
    const nextSequence = sequence + 1;
    const scheduledAt = building.createdAt + config.first + (nextSequence - 1) * config.interval;
    if (scheduledAt > cutoff + TIME_EPSILON) break;
    actions.push({
      type: config.type,
      building,
      scheduledAt,
      sequence: nextSequence,
    });
    sequence = nextSequence;
  }
  return { actions, sequence };
}

function resolveSpawnPosition(
  building: BattleBuilding,
  map: BattlefieldMap,
  occupancy: BuildingOccupancy,
  units: readonly BuildingSpawnBlocker[],
  spawnedCoordinateKeys: ReadonlySet<string>,
): WorldPoint | null {
  const occupiedByUnit = new Set(units
    .filter((unit) => unit.health > 0)
    .map((unit) => coordinateKey(worldToAxial(unit.position))));
  const directions = building.faction === "verdant"
    ? VERDANT_SPAWN_DIRECTIONS
    : VERDANT_SPAWN_DIRECTIONS.map(({ q, r }) => ({ q: -q, r: -r }));
  for (const direction of directions) {
    const coordinate = {
      q: building.coordinate.q + direction.q,
      r: building.coordinate.r + direction.r,
    };
    const cell = getMapCell(map, coordinate);
    const key = coordinateKey(coordinate);
    if (
      !cell?.walkable
      || cell.territory === oppositeFaction(building.faction)
      || occupancy[key]
      || occupiedByUnit.has(key)
      || spawnedCoordinateKeys.has(key)
    ) continue;
    return axialToWorld(coordinate);
  }
  return null;
}

function collectDamage(
  intents: readonly CombatDamageIntent[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const intent of intents) {
    if (intent.targetType !== "building") continue;
    if (!Number.isFinite(intent.amount) || intent.amount <= 0) continue;
    result.set(intent.targetId, (result.get(intent.targetId) ?? 0) + intent.amount);
  }
  return result;
}

function compareActions(first: BuildingAction, second: BuildingAction): number {
  const time = first.scheduledAt - second.scheduledAt;
  if (Math.abs(time) > TIME_EPSILON) return time;
  const priority = actionPriority(first) - actionPriority(second);
  if (priority !== 0) return priority;
  const building = first.building.id.localeCompare(second.building.id);
  if (building !== 0) return building;
  const firstSequence = first.type === "destroy" ? Number.POSITIVE_INFINITY : first.sequence;
  const secondSequence = second.type === "destroy" ? Number.POSITIVE_INFINITY : second.sequence;
  return firstSequence - secondSequence;
}

function actionPriority(action: BuildingAction): number {
  return action.type === "destroy" ? 1 : 0;
}

function buildingHealthSpec(kind: BattleBuildingKind): {
  readonly maxHealth: number;
  readonly lifetimeSeconds: number | null;
} {
  if (kind === "gold-mine") return GAME_RULES.buildings.goldMine;
  if (kind === "barracks") return GAME_RULES.buildings.barracks;
  return { maxHealth: GAME_RULES.castle.maxHealth, lifetimeSeconds: null };
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function normalizeSimulationTime(time: number): number {
  return Number(time.toFixed(9));
}

function unchangedResult(input: AdvanceBuildingsInput): AdvanceBuildingsResult {
  return {
    buildings: input.buildings,
    economy: input.economy,
    occupancy: input.occupancy,
    unitSpawns: [],
    events: [],
    newlyFullFactions: [],
  };
}
