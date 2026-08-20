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
import type {
  BattleEconomyPolicy,
  BuildingLifecyclePolicy,
  ProductionPolicy,
} from "./battleMode";
import type { CombatDamageIntent, CombatTarget } from "./combat";
import { grantGold, type EconomyState } from "./economy";
import {
  barracksDesignForRace,
  barracksRulesForRace,
  GAME_RULES,
  unitRoleForRace,
  type BuildingKind,
} from "./rules";
import {
  sandboxBuildingSlotForKind,
  sandboxBuildingSpec,
  type SandboxAdvancedBuildingKind,
} from "./sandboxCatalog";
import { resolveBattleRace } from "./factions";
import type {
  BattleRace,
  Faction,
  FactionRaces,
  UnitRole,
  WorldPoint,
} from "./types";

export type BattleBuildingKind =
  | BuildingKind
  | SandboxAdvancedBuildingKind
  | "castle"
  | "arrow-tower";
export type BattleBuildingStatus = "active" | "destroyed";
export type BattleBuildingConstructionPhase =
  | "constructing"
  | "operational"
  | "destroyed";

export interface CastleCombatState {
  readonly activatedAt: number | null;
  readonly cooldownRemaining: number;
}

export interface ArrowTowerCombatState {
  readonly cooldownRemaining: number;
}

export interface BattleBuilding extends CombatTarget {
  readonly targetType: "building";
  readonly id: string;
  readonly kind: BattleBuildingKind;
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly maxHealth: number;
  readonly health: number;
  readonly createdAt: number;
  readonly constructionCompletedAt: number;
  readonly lifetimeSeconds: number | null;
  readonly productionSequence: number;
  readonly castleCombat: CastleCombatState | null;
  readonly arrowTowerCombat: ArrowTowerCombatState | null;
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
  readonly constructionSeconds?: number;
}

export interface BuildingSpawnBlocker {
  readonly position: WorldPoint;
  readonly health: number;
}

export interface BuildingUnitSpawn {
  readonly buildingId: string;
  readonly unitId: string;
  readonly faction: Faction;
  readonly race: BattleRace;
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
      readonly race: BattleRace;
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
  readonly economyPolicy?: BattleEconomyPolicy;
  readonly productionPolicy?: ProductionPolicy;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
}

export interface AdvanceBuildingsResult {
  readonly buildings: readonly BattleBuilding[];
  readonly economy: EconomyState;
  readonly occupancy: BuildingOccupancy;
  readonly unitSpawns: readonly BuildingUnitSpawn[];
  readonly events: readonly BuildingSimulationEvent[];
  readonly newlyFullFactions: readonly Faction[];
}

export interface SettleBuildingHealthInput {
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly damageIntents: readonly CombatDamageIntent[];
  readonly productionPolicy?: ProductionPolicy;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
}

export interface BuildingHealthSettlement {
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
  readonly pendingProduction: readonly BuildingProductionAction[];
  readonly destructionEvents: readonly BuildingSimulationEvent[];
}

export interface AdvanceBuildingProductionInput {
  readonly settlement: BuildingHealthSettlement;
  readonly economy: EconomyState;
  readonly map: BattlefieldMap;
  readonly units: readonly BuildingSpawnBlocker[];
  readonly economyPolicy?: BattleEconomyPolicy;
  readonly productionPolicy?: ProductionPolicy;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
}

export interface BuildingCleanupResult {
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
}

export type BuildingProductionAction =
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

type BuildingAction = BuildingProductionAction | DestructionAction;

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
  lifecyclePolicy?: BuildingLifecyclePolicy,
): BattleBuilding {
  if (input.id.trim().length === 0) {
    throw new Error("Building requires a non-empty id.");
  }
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) {
    throw new Error("Building requires a finite creation time at or after zero.");
  }
  if (
    input.constructionSeconds !== undefined
    && (
      !Number.isFinite(input.constructionSeconds)
      || input.constructionSeconds < 0
    )
  ) {
    throw new Error("Building construction duration must be finite and non-negative.");
  }
  if (
    !Number.isFinite(input.coordinate.q)
    || !Number.isFinite(input.coordinate.r)
    || !Number.isInteger(input.coordinate.q)
    || !Number.isInteger(input.coordinate.r)
  ) {
    throw new Error("Building requires a finite integer hex coordinate.");
  }
  const spec = buildingHealthSpec(input.kind, lifecyclePolicy);
  const {
    constructionSeconds: requestedConstructionSeconds = 0,
    ...buildingIdentity
  } = input;
  const constructionSeconds = lifecyclePolicy?.construction === "timed"
    ? requestedConstructionSeconds
    : 0;
  return {
    ...buildingIdentity,
    targetType: "building",
    coordinate: { ...input.coordinate },
    position: axialToWorld(input.coordinate),
    maxHealth: spec.maxHealth,
    health: spec.maxHealth,
    constructionCompletedAt: input.createdAt + constructionSeconds,
    lifetimeSeconds: lifecyclePolicy?.naturalDecay === "disabled"
      ? null
      : spec.lifetimeSeconds,
    productionSequence: 0,
    castleCombat: input.kind === "castle"
      ? { activatedAt: null, cooldownRemaining: 0 }
      : null,
    arrowTowerCombat: input.kind === "arrow-tower" || input.kind === "guard-tower"
      ? { cooldownRemaining: 0 }
      : null,
    status: "active",
    diedAt: null,
    removeAt: null,
  };
}

export function battleBuildingConstructionPhaseAt(
  building: BattleBuilding,
  elapsedSeconds: number,
): BattleBuildingConstructionPhase {
  if (building.status === "destroyed" || building.health <= 0) return "destroyed";
  const constructionCompletedAt = Number.isFinite(building.constructionCompletedAt)
    ? building.constructionCompletedAt
    : building.createdAt;
  return Number.isFinite(elapsedSeconds)
    && elapsedSeconds + TIME_EPSILON >= constructionCompletedAt
    ? "operational"
    : "constructing";
}

export function isBattleBuildingOperationalAt(
  building: BattleBuilding,
  elapsedSeconds: number,
): boolean {
  return battleBuildingConstructionPhaseAt(building, elapsedSeconds) === "operational";
}

export function advanceBuildings(
  input: AdvanceBuildingsInput,
): AdvanceBuildingsResult {
  const settlement = settleBuildingHealth({
    buildings: input.buildings,
    occupancy: input.occupancy,
    elapsedSeconds: input.elapsedSeconds,
    deltaSeconds: input.deltaSeconds,
    damageIntents: input.damageIntents,
    productionPolicy: input.productionPolicy,
    factionRaces: input.factionRaces,
    undeadOpponent: input.undeadOpponent,
  });
  return advanceBuildingProduction({
    settlement,
    economy: input.economy,
    map: input.map,
    units: input.units,
    economyPolicy: input.economyPolicy,
    productionPolicy: input.productionPolicy,
    factionRaces: input.factionRaces,
    undeadOpponent: input.undeadOpponent,
  });
}

export function settleBuildingHealth(
  input: SettleBuildingHealthInput,
): BuildingHealthSettlement {
  if (
    !Number.isFinite(input.elapsedSeconds)
    || input.elapsedSeconds < 0
    || !Number.isFinite(input.deltaSeconds)
    || input.deltaSeconds <= 0
  ) {
    return unchangedHealthSettlement(input);
  }
  const end = input.elapsedSeconds + input.deltaSeconds;
  if (!Number.isFinite(end)) return unchangedHealthSettlement(input);
  const damageByBuildingId = collectDamage(input.damageIntents);
  const settlements = input.buildings.map((building) => {
    const race = resolveBattleRace(
      input.factionRaces,
      building.faction,
      input.undeadOpponent,
    );
    return settleBuilding(
      building,
      input.elapsedSeconds,
      end,
      damageByBuildingId.get(building.id) ?? 0,
      race,
      input.productionPolicy,
    );
  });
  const actions = settlements
    .flatMap((settlement) => settlement.actions)
    .sort(compareActions);
  const cleanup = removeDestroyedBuildingsAt(
    settlements.map((settlement) => settlement.building),
    input.occupancy,
    end,
  );
  return {
    buildings: cleanup.buildings,
    occupancy: cleanup.occupancy,
    pendingProduction: actions.filter((action): action is BuildingProductionAction => (
      action.type !== "destroy"
    )),
    destructionEvents: actions
      .filter((action): action is DestructionAction => action.type === "destroy")
      .map(destructionEvent),
  };
}

export function advanceBuildingProduction(
  input: AdvanceBuildingProductionInput,
): AdvanceBuildingsResult {
  const spawnedCoordinateKeys = new Set<string>();
  const unitSpawns: BuildingUnitSpawn[] = [];
  const events: BuildingSimulationEvent[] = [];
  const newlyFullFactions = new Set<Faction>();
  let economy = input.economy;
  const sequenceByBuildingId = new Map<string, number>();

  const pendingProduction = usesLegacyAutomaticProduction(input.productionPolicy)
    ? input.settlement.pendingProduction
    : [];
  for (const action of pendingProduction) {
    sequenceByBuildingId.set(action.building.id, action.sequence);
    if (action.type === "produce-gold") {
      const producedAmount = GAME_RULES.buildings.goldMine.goldPerProduction;
      const grant = grantGold(
        economy,
        action.building.faction,
        producedAmount,
        input.economyPolicy,
      );
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
        input.settlement.occupancy,
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
      const race = resolveBattleRace(
        input.factionRaces,
        action.building.faction,
        input.undeadOpponent,
      );
      const spawnedUnit = barracksDesignForRace(race).spawnedUnit;
      const spawn: BuildingUnitSpawn = {
        buildingId: action.building.id,
        unitId: `${action.building.id}-${spawnedUnit}-${action.sequence}`,
        faction: action.building.faction,
        race,
        role: unitRoleForRace(spawnedUnit, race),
        position,
        scheduledAt: action.scheduledAt,
        spawnSequence: action.sequence,
      };
      unitSpawns.push(spawn);
      events.push({ type: "building-unit-spawned", ...spawn });
    }
  }
  events.push(...input.settlement.destructionEvents);
  events.sort(compareSimulationEvents);

  return {
    buildings: input.settlement.buildings.map((building) => ({
      ...building,
      productionSequence: sequenceByBuildingId.get(building.id)
        ?? building.productionSequence,
    })),
    economy,
    occupancy: input.settlement.occupancy,
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
  race: BattleRace,
  productionPolicy?: ProductionPolicy,
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
  const production = collectProductionActions(
    building,
    productionCutoff,
    race,
    productionPolicy,
  );
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
  const actions: BuildingAction[] = [...production];
  if (destroyed) {
    actions.push({ type: "destroy", building, scheduledAt: deathAt, cause });
  }
  return {
    actions,
    building: {
      ...building,
      health: destroyed ? 0 : health,
      productionSequence: building.productionSequence,
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
  race: BattleRace,
  productionPolicy?: ProductionPolicy,
): readonly BuildingProductionAction[] {
  if (!usesLegacyAutomaticProduction(productionPolicy)) return [];
  if (
    building.kind === "castle"
    || building.kind === "arrow-tower"
    || building.kind === "guard-tower"
  ) return [];
  const barracksRules = barracksRulesForRace(race);
  const config = building.kind === "gold-mine"
    ? {
        first: GAME_RULES.buildings.goldMine.firstProductionSeconds,
        interval: GAME_RULES.buildings.goldMine.productionIntervalSeconds,
        maximum: Number.POSITIVE_INFINITY,
        type: "produce-gold" as const,
      }
    : {
        first: barracksRules.firstSpawnSeconds,
        interval: barracksRules.spawnIntervalSeconds,
        maximum: barracksRules.spawnCount,
        type: "spawn-unit" as const,
      };
  const actions: BuildingProductionAction[] = [];
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
  return actions;
}

function usesLegacyAutomaticProduction(
  policy: ProductionPolicy | undefined,
): boolean {
  return policy === undefined || policy.kind === "legacy-auto-spawn";
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

function destructionEvent(action: DestructionAction): BuildingSimulationEvent {
  return {
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
  };
}

function compareSimulationEvents(
  first: BuildingSimulationEvent,
  second: BuildingSimulationEvent,
): number {
  const time = first.scheduledAt - second.scheduledAt;
  if (Math.abs(time) > TIME_EPSILON) return time;
  const priority = Number(first.type === "building-destroyed")
    - Number(second.type === "building-destroyed");
  if (priority !== 0) return priority;
  const building = first.buildingId.localeCompare(second.buildingId);
  if (building !== 0) return building;
  return simulationEventSequence(first) - simulationEventSequence(second);
}

function simulationEventSequence(event: BuildingSimulationEvent): number {
  if (event.type === "building-gold-produced") return event.productionSequence;
  if (
    event.type === "building-unit-spawned"
    || event.type === "building-unit-spawn-skipped"
  ) return event.spawnSequence;
  return Number.POSITIVE_INFINITY;
}

function actionPriority(action: BuildingAction): number {
  return action.type === "destroy" ? 1 : 0;
}

function buildingHealthSpec(
  kind: BattleBuildingKind,
  lifecyclePolicy?: BuildingLifecyclePolicy,
): {
  readonly maxHealth: number;
  readonly lifetimeSeconds: number | null;
} {
  const sandboxSlot = sandboxBuildingSlotForKind(kind);
  if (sandboxSlot && lifecyclePolicy?.naturalDecay === "disabled") {
    return {
      maxHealth: sandboxBuildingSpec(sandboxSlot).maxHealth,
      lifetimeSeconds: null,
    };
  }
  if (kind === "gold-mine") return GAME_RULES.buildings.goldMine;
  if (kind === "barracks") return GAME_RULES.buildings.barracks;
  if (kind === "arrow-tower") {
    return { maxHealth: GAME_RULES.buildings.arrowTower.maxHealth, lifetimeSeconds: null };
  }
  if (kind === "guard-tower") return GAME_RULES.buildings.guardTower;
  if (sandboxSlot) {
    return {
      maxHealth: sandboxBuildingSpec(sandboxSlot).maxHealth,
      lifetimeSeconds: null,
    };
  }
  return { maxHealth: GAME_RULES.castle.maxHealth, lifetimeSeconds: null };
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function normalizeSimulationTime(time: number): number {
  return Number(time.toFixed(9));
}

function unchangedHealthSettlement(
  input: SettleBuildingHealthInput,
): BuildingHealthSettlement {
  return {
    buildings: input.buildings,
    occupancy: input.occupancy,
    pendingProduction: [],
    destructionEvents: [],
  };
}
