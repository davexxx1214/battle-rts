import {
  pruneBattleEvents,
  stampBattleEvent,
  type BattleEvent,
  type BattleEventInput,
} from "./events";
import {
  advanceProjectiles,
  type BattleProjectile,
  type ProjectileImpact,
} from "./projectiles";
import { buildSquads, type BattleSquad } from "./squads";
import {
  assignMeleeEngagementSlots,
  type MeleeEngagementSlot,
} from "./engagements";
import {
  separateLivingAllies,
} from "./formation";
import {
  areWorldPointsConnected,
  castleChargeNavigationKey,
  findWorldPath,
} from "./navigation";
import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_BATTLE_STRUCTURES,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../map/battlefield";
import type { Faction, UnitRole, WorldPoint } from "./types";
import { BattleSpatialIndex } from "./spatialIndex";
import { UNIT_SPECS } from "./rules";
import {
  advanceEconomy,
  createEconomyState,
  getMatchClock,
  type EconomyState,
  type MatchClock,
} from "./economy";
import {
  createBuildingOccupancy,
  createDeploymentCounts,
  type BuildingOccupancy,
  type DeploymentCounts,
} from "./deployment";
import {
  advanceBuildingProduction,
  createBattleBuilding,
  removeDestroyedBuildingsAt,
  settleBuildingHealth,
  type BattleBuilding,
} from "./buildings";
import type {
  CombatDamageIntent,
  CombatTarget,
  CombatTargetRef,
} from "./combat";
import {
  clampToForwardProgress,
  selectAutomaticTarget,
  type AutomaticCombatTarget,
} from "./autoCombat";
import {
  activateCastlesFromDamage,
  advanceCastleAttacks,
} from "./castleCombat";
import { advanceArrowTowerAttacks } from "./arrowTowerCombat";

export type { Faction, UnitRole, WorldPoint } from "./types";
export { UNIT_SPECS } from "./rules";
export type { UnitSpec } from "./rules";
export type UnitStatus = "idle" | "moving" | "attacking" | "dead";
export type UnitBehavior = "charging" | "engaging" | "castle-locked";

export interface BattleUnit extends CombatTarget {
  readonly targetType: "unit";
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly squadId: string;
  readonly maxHealth: number;
  readonly health: number;
  readonly position: WorldPoint;
  readonly formationSlot: WorldPoint;
  readonly waypoints: readonly WorldPoint[];
  readonly navigationKey: string | null;
  readonly behavior: UnitBehavior;
  readonly status: UnitStatus;
  readonly cooldownRemaining: number;
  readonly facing: number;
  readonly currentTarget: CombatTargetRef | null;
  readonly engagementSlot: MeleeEngagementSlot | null;
  readonly diedAt: number | null;
}

export interface BattleState {
  readonly units: readonly BattleUnit[];
  readonly squads: readonly BattleSquad[];
  readonly projectiles: readonly BattleProjectile[];
  readonly events: readonly BattleEvent[];
  readonly economy: EconomyState;
  readonly matchElapsed: number;
  readonly buildings: readonly BattleBuilding[];
  readonly buildingOccupancy: BuildingOccupancy;
  readonly deploymentCounts: DeploymentCounts;
  readonly nextDeploymentSequence: number;
  readonly nextEventSequence: number;
  readonly elapsed: number;
  readonly winner: Faction | "draw" | null;
  readonly resolvedAt: number | null;
  readonly revision: number;
}

export interface CreateBattleUnitInput {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly position: WorldPoint;
  readonly squadId?: string;
}

type EmitBattleEvent = (input: BattleEventInput) => BattleEvent;

const ARRIVAL_DISTANCE = 0.12;
const NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE = 0.55;
const MAX_STEP_SECONDS = 0.1;
const EVENT_WINDOW_SECONDS = 2;
const POST_BATTLE_PRESENTATION_SECONDS = 8;

export function createBattleUnit(input: CreateBattleUnitInput): BattleUnit {
  const spec = UNIT_SPECS[input.role];
  return {
    ...input,
    targetType: "unit",
    squadId: input.squadId ?? `${input.faction}-independent-${input.id}`,
    position: { ...input.position },
    formationSlot: { ...input.position },
    waypoints: [],
    navigationKey: null,
    maxHealth: spec.maxHealth,
    health: spec.maxHealth,
    behavior: "charging",
    status: "idle",
    cooldownRemaining: 0,
    facing: input.faction === "verdant" ? Math.PI : 0,
    currentTarget: null,
    engagementSlot: null,
    diedAt: null,
  };
}

export function createBattleState(units: readonly BattleUnit[]): BattleState {
  const clonedUnits = units.map(cloneUnit);
  return {
    units: clonedUnits,
    squads: buildSquads(clonedUnits),
    projectiles: [],
    events: [],
    economy: createEconomyState(),
    matchElapsed: 0,
    buildings: createInitialDefensiveBuildings(),
    buildingOccupancy: createBuildingOccupancy(),
    deploymentCounts: createDeploymentCounts(),
    nextDeploymentSequence: 0,
    nextEventSequence: 0,
    elapsed: 0,
    winner: null,
    resolvedAt: null,
    revision: 0,
  };
}

export function createInitialBattle(): BattleState {
  return createBattleState([]);
}

export function getBattleMatchClock(state: BattleState): MatchClock {
  return getMatchClock(state.matchElapsed);
}

export function stepBattle(state: BattleState, requestedDeltaSeconds: number): BattleState {
  if (!Number.isFinite(requestedDeltaSeconds) || requestedDeltaSeconds <= 0) {
    return state;
  }
  const deltaSeconds = Math.min(MAX_STEP_SECONDS, requestedDeltaSeconds);
  if (state.resolvedAt !== null) {
    if (state.elapsed - state.resolvedAt >= POST_BATTLE_PRESENTATION_SECONDS) return state;
    const elapsed = Math.min(
      state.resolvedAt + POST_BATTLE_PRESENTATION_SECONDS,
      state.elapsed + deltaSeconds,
    );
    const cleanup = removeDestroyedBuildingsAt(
      state.buildings,
      state.buildingOccupancy,
      elapsed,
    );
    return {
      ...state,
      buildings: cleanup.buildings,
      buildingOccupancy: cleanup.occupancy,
      projectiles: [],
      events: pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      elapsed,
      revision: state.revision + 1,
    };
  }
  const elapsed = state.elapsed + deltaSeconds;
  const livingAtStart = state.units.filter((unit) => unit.health > 0);
  const damage: CombatDamageIntent[] = [];
  const emitted: BattleEvent[] = [];
  let nextEventSequence = state.nextEventSequence;
  const emit: EmitBattleEvent = (input) => {
    const event = stampBattleEvent(input, nextEventSequence, elapsed);
    nextEventSequence += 1;
    emitted.push(event);
    return event;
  };
  const matchIsActive = state.winner === null
    && getBattleMatchClock(state).remainingSeconds > 0;
  const matchElapsed = matchIsActive
    ? getMatchClock(state.matchElapsed + deltaSeconds).elapsedSeconds
    : state.matchElapsed;
  const activeMatchDeltaSeconds = matchElapsed - state.matchElapsed;
  const activeBuildingsAtStart = state.buildings.filter((building) => (
    building.health > 0 && building.status === "active"
  ));
  const combatTargetsAtStart: CombatTarget[] = [
    ...livingAtStart,
    ...activeBuildingsAtStart,
  ];
  const projectileStep = advanceProjectiles(
    state.projectiles,
    combatTargetsAtStart,
    deltaSeconds,
  );
  for (const impact of projectileStep.impacts) {
    resolveProjectileImpact(
      impact,
      livingAtStart,
      activeBuildingsAtStart,
      damage,
      emit,
    );
  }
  const spawnedProjectiles: BattleProjectile[] = [];
  const combatantsAtStart = livingAtStart;
  const spatialIndex = new BattleSpatialIndex(combatantsAtStart);
  const targetsByUnitId = new Map(
    combatantsAtStart.map((unit) => [unit.id, selectAutomaticTarget({
      unit,
      units: nearbyEnemyUnits(unit, spatialIndex),
      buildings: activeBuildingsAtStart,
    })] as const),
  );
  const engagementSlots = assignMeleeEngagementSlots(
    combatantsAtStart
      .filter((unit) => UNIT_SPECS[unit.role].attackMode === "melee")
      .map((attacker) => {
        const target = targetsByUnitId.get(attacker.id);
        if (!target) return null;
        return {
          attacker,
          target,
          previousSlotIndex: attacker.engagementSlot?.targetType === target.targetType
            && attacker.engagementSlot.targetId === target.id
            ? attacker.engagementSlot.index
            : undefined,
        };
      })
      .filter((request): request is NonNullable<typeof request> => request !== null),
    (position, request) => (
      Boolean(getBattlefieldCell(worldToAxial(position))?.walkable)
      && areWorldPointsConnected(BATTLEFIELD_MAP, request.attacker.position, position)
    ),
  );
  const engagementByAttackerId = new Map(
    engagementSlots.map((slot) => [slot.attackerId, slot] as const),
  );
  const advancedUnits = state.units.map((unit) => advanceUnit(
    unit,
    targetsByUnitId.get(unit.id) ?? null,
    engagementByAttackerId.get(unit.id) ?? null,
    deltaSeconds,
    damage,
    spawnedProjectiles,
    emit,
  ));
  const separatedUnits = separateLivingAllies(advancedUnits).map((unit, index) => {
    const position = clampToForwardProgress(
      unit.faction,
      advancedUnits[index]!.position,
      unit.position,
    );
    return {
      ...unit,
      position: getBattlefieldCell(worldToAxial(position))?.walkable
        ? position
        : advancedUnits[index]!.position,
    };
  });
  const damagedUnits = applyDamageIntents(
    separatedUnits,
    damage,
    elapsed,
    emit,
    state.buildings,
  );
  const castleActivationStep = matchIsActive && activeMatchDeltaSeconds > 0
    ? activateCastlesFromDamage(state.buildings, damage, elapsed)
    : { buildings: state.buildings, events: [] };
  for (const event of castleActivationStep.events) emit(event);
  const buildingHealthSettlement = matchIsActive && activeMatchDeltaSeconds > 0
    ? settleBuildingHealth({
        buildings: castleActivationStep.buildings,
        occupancy: state.buildingOccupancy,
        elapsedSeconds: state.matchElapsed,
        deltaSeconds: activeMatchDeltaSeconds,
        damageIntents: damage,
      })
    : {
        buildings: castleActivationStep.buildings,
        occupancy: state.buildingOccupancy,
        pendingProduction: [],
        destructionEvents: [],
      };
  const castleWinnerAfterBuildingHealth = resolveCastleWinner(
    buildingHealthSettlement.buildings,
  );
  const economyStep = castleWinnerAfterBuildingHealth === null && matchIsActive
    ? advanceEconomy(state.economy, state.matchElapsed, activeMatchDeltaSeconds)
    : { state: state.economy, newlyFullFactions: [] };
  const buildingStep = castleWinnerAfterBuildingHealth === null
    ? advanceBuildingProduction({
        settlement: buildingHealthSettlement,
        economy: economyStep.state,
        map: BATTLEFIELD_MAP,
        units: damagedUnits,
      })
    : {
        buildings: buildingHealthSettlement.buildings,
        economy: state.economy,
        occupancy: buildingHealthSettlement.occupancy,
        unitSpawns: [],
        events: buildingHealthSettlement.destructionEvents,
        newlyFullFactions: [],
      };
  for (const event of buildingStep.events) emit(event);
  const arrowTowerAttackStep = castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
    ? advanceArrowTowerAttacks(
        buildingStep.buildings,
        damagedUnits,
        activeMatchDeltaSeconds,
      )
    : { buildings: buildingStep.buildings, attacks: [] };
  for (const attack of arrowTowerAttackStep.attacks) {
    const attackEvent = emit({
      type: "attack-started",
      attackerId: attack.towerId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "arrow-tower",
      origin: attack.origin,
      targetPosition: attack.targetPosition,
    });
    const projectileId = `projectile-${attackEvent.sequence}`;
    spawnedProjectiles.push({
      id: projectileId,
      attackerId: attack.towerId,
      sourceType: "building",
      targetId: attack.targetId,
      targetType: "unit",
      role: "ranger",
      origin: { ...attack.origin },
      position: { ...attack.origin },
      destination: { ...attack.targetPosition },
      speed: attack.projectileSpeed,
      damage: attack.damage,
      splashRadius: 0,
    });
    emit({
      type: "projectile-spawned",
      projectileId,
      attackerId: attack.towerId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "ranger",
      origin: attack.origin,
      destination: attack.targetPosition,
    });
  }
  const castleAttackStep = castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
    ? advanceCastleAttacks(
        arrowTowerAttackStep.buildings,
        damagedUnits,
        activeMatchDeltaSeconds,
      )
    : { buildings: arrowTowerAttackStep.buildings, attacks: [], damageIntents: [] };
  for (const attack of castleAttackStep.attacks) {
    emit({
      type: "attack-started",
      attackerId: attack.castleId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "castle",
      origin: attack.origin,
      targetPosition: attack.targetPosition,
    });
  }
  const unitsAfterCastleAttacks = applyDamageIntents(
    damagedUnits,
    castleAttackStep.damageIntents,
    elapsed,
    emit,
    castleAttackStep.buildings,
  );
  const newlyFullFactions = new Set([
    ...economyStep.newlyFullFactions,
    ...buildingStep.newlyFullFactions,
  ]);
  for (const faction of newlyFullFactions) {
    emit({
      type: "gold-full",
      faction,
      promptSequence: buildingStep.economy.accounts[faction].fullPromptSequence,
    });
  }
  const producedUnits = buildingStep.unitSpawns.map((spawn) => createBattleUnit({
    id: spawn.unitId,
    faction: spawn.faction,
    role: spawn.role,
    squadId: `${spawn.buildingId}-spawned`,
    position: spawn.position,
  }));
  const buildingCleanup = removeDestroyedBuildingsAt(
    castleAttackStep.buildings,
    buildingStep.occupancy,
    elapsed,
  );
  const units = [...unitsAfterCastleAttacks, ...producedUnits];
  const matchTimedOut = getMatchClock(matchElapsed).remainingSeconds <= 0;
  const winner = castleWinnerAfterBuildingHealth
    ?? (matchTimedOut ? resolveTimeoutWinner(buildingCleanup.buildings) : null);
  return {
    units,
    squads: appendUnitsToSquads(state.squads, producedUnits),
    projectiles: winner
      ? []
      : [...projectileStep.projectiles, ...spawnedProjectiles],
    events: [
      ...pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      ...emitted,
    ],
    economy: buildingStep.economy,
    matchElapsed,
    buildings: buildingCleanup.buildings,
    buildingOccupancy: buildingCleanup.occupancy,
    deploymentCounts: state.deploymentCounts,
    nextDeploymentSequence: state.nextDeploymentSequence,
    nextEventSequence,
    elapsed,
    winner,
    resolvedAt: state.resolvedAt ?? (winner ? elapsed : null),
    revision: state.revision + 1,
  };
}

function advanceUnit(
  unit: BattleUnit,
  target: AutomaticCombatTarget | null,
  engagementSlot: MeleeEngagementSlot | null,
  deltaSeconds: number,
  damage: CombatDamageIntent[],
  spawnedProjectiles: BattleProjectile[],
  emit: EmitBattleEvent,
): BattleUnit {
  if (unit.health <= 0 || unit.status === "dead") {
    return {
      ...unit,
      health: 0,
      status: "dead",
      waypoints: [],
      currentTarget: null,
      engagementSlot: null,
    };
  }
  let next: BattleUnit = {
    ...unit,
    cooldownRemaining: Math.max(0, unit.cooldownRemaining - deltaSeconds),
    currentTarget: target
      ? { targetType: target.targetType, targetId: target.id }
      : null,
    engagementSlot: UNIT_SPECS[unit.role].attackMode === "melee" ? engagementSlot : null,
  };
  if (!target) {
    const destination = axialToWorld(
      BATTLEFIELD_MAP.castleApproaches[oppositeFaction(next.faction)],
    );
    return advanceTowardDestination({
      ...next,
      behavior: next.behavior === "castle-locked" ? "castle-locked" : "charging",
      engagementSlot: null,
    }, destination, deltaSeconds);
  }
  next = {
    ...next,
    behavior: next.behavior === "castle-locked" ? "castle-locked" : "engaging",
  };
  const spec = UNIT_SPECS[next.role];
  const targetDistance = distance(next.position, target.position);
  const facing = Math.atan2(target.position.x - next.position.x, target.position.z - next.position.z);
  if (
    spec.attackMode === "melee"
    && targetDistance > spec.attackRange
  ) {
    if (!engagementSlot) return { ...next, facing, status: "idle" };
    if (distance(next.position, engagementSlot.position) > ARRIVAL_DISTANCE) {
      return advanceTowardCombatPosition(
        next,
        engagementSlot.position,
        `slot:${engagementSlot.targetType}:${engagementSlot.targetId}:${engagementSlot.index}`,
        facing,
        deltaSeconds,
      );
    }
  }
  if (targetDistance > spec.attackRange) {
    return advanceTowardTarget(next, target, facing, deltaSeconds);
  }
  if (next.cooldownRemaining > 0) return { ...next, facing, status: "attacking" };

  const attackEvent = emit({
    type: "attack-started",
    attackerId: next.id,
    targetId: target.id,
    targetType: target.targetType,
    role: next.role,
    origin: { ...next.position },
    targetPosition: { ...target.position },
  });
  if (spec.attackMode === "melee") {
    damage.push({
      sourceId: next.id,
      sourceType: "unit",
      targetId: target.id,
      targetType: target.targetType,
      amount: spec.damage,
    });
  } else {
    const projectileId = `projectile-${attackEvent.sequence}`;
    const projectile: BattleProjectile = {
      id: projectileId,
      attackerId: next.id,
      sourceType: "unit",
      targetId: target.id,
      targetType: target.targetType,
      role: next.role,
      origin: { ...next.position },
      position: { ...next.position },
      destination: { ...target.position },
      speed: spec.projectileSpeed,
      damage: spec.damage,
      splashRadius: spec.splashRadius,
    };
    spawnedProjectiles.push(projectile);
    emit({
      type: "projectile-spawned",
      projectileId,
      attackerId: next.id,
      targetId: target.id,
      targetType: target.targetType,
      role: next.role,
      origin: { ...next.position },
      destination: { ...target.position },
    });
  }
  return {
    ...next,
    behavior: target.targetType === "building" && target.kind === "castle"
      ? "castle-locked"
      : next.behavior,
    facing,
    status: "attacking",
    cooldownRemaining: spec.attackCooldown,
  };
}

function advanceTowardDestination(
  unit: BattleUnit,
  destination: WorldPoint,
  deltaSeconds: number,
): BattleUnit {
  const navigationKey = castleChargeNavigationKey(oppositeFaction(unit.faction));
  const waypoints = unit.navigationKey === navigationKey && unit.waypoints.length > 0
    ? unit.waypoints
    : findWorldPath(BATTLEFIELD_MAP, unit.position, destination);
  const waypoint = waypoints[0];
  if (!waypoint) {
    return {
      ...unit,
      status: "idle",
      waypoints: [],
      navigationKey: null,
    };
  }
  const remaining = distance(unit.position, waypoint);
  const arrivalDistance = waypoints.length > 1
    ? NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE
    : ARRIVAL_DISTANCE;
  if (remaining <= arrivalDistance) {
    const remainingWaypoints = waypoints.slice(1);
    const position = walkableForwardPosition(unit.faction, unit.position, waypoint)
      ?? unit.position;
    if (remainingWaypoints.length > 0) {
      return {
        ...unit,
        position,
        waypoints: remainingWaypoints,
        status: "moving",
        navigationKey,
      };
    }
    return {
      ...unit,
      position: walkableForwardPosition(unit.faction, unit.position, destination)
        ?? unit.position,
      status: "idle",
      waypoints: [],
      navigationKey: null,
    };
  }
  const facing = Math.atan2(waypoint.x - unit.position.x, waypoint.z - unit.position.z);
  const requested = moveToward(
    unit.position,
    waypoint,
    UNIT_SPECS[unit.role].moveSpeed * deltaSeconds,
  );
  const position = walkableForwardPosition(unit.faction, unit.position, requested);
  if (!position) {
    return { ...unit, status: "idle", waypoints: [], navigationKey: null };
  }
  return {
    ...unit,
    position,
    waypoints,
    facing,
    status: "moving",
    navigationKey,
  };
}

function resolveProjectileImpact(
  impact: ProjectileImpact,
  units: readonly BattleUnit[],
  buildings: readonly BattleBuilding[],
  damage: CombatDamageIntent[],
  emit: EmitBattleEvent,
): void {
  const { projectile, position } = impact;
  emit({
    type: "projectile-hit",
    projectileId: projectile.id,
    attackerId: projectile.attackerId,
    targetId: projectile.targetId,
    targetType: projectile.targetType,
    role: projectile.role,
    position: { ...position },
    splashRadius: projectile.splashRadius,
  });
  const target = projectile.targetType === "unit"
    ? units.find((unit) => unit.id === projectile.targetId && unit.health > 0)
    : buildings.find((building) => (
        building.id === projectile.targetId
        && building.health > 0
        && building.status === "active"
      ));
  if (!target) return;

  damage.push({
    sourceId: projectile.attackerId,
    sourceType: projectile.sourceType,
    targetId: target.id,
    targetType: projectile.targetType,
    amount: projectile.damage,
  });
  if (projectile.splashRadius <= 0 || projectile.targetType !== "unit") return;
  for (const candidate of units) {
    if (
      candidate.id === target.id
      || candidate.health <= 0
      || candidate.faction !== target.faction
      || distance(candidate.position, position) > projectile.splashRadius
    ) continue;
    damage.push({
      sourceId: projectile.attackerId,
      sourceType: "unit",
      targetId: candidate.id,
      targetType: "unit",
      amount: projectile.damage * 0.55,
    });
  }
}

function applyDamageIntents(
  units: readonly BattleUnit[],
  intents: readonly CombatDamageIntent[],
  elapsed: number,
  emit: EmitBattleEvent,
  buildingSources: readonly BattleBuilding[] = [],
): BattleUnit[] {
  const livingIds = new Set(
    units.filter((unit) => unit.health > 0).map((unit) => unit.id),
  );
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));
  const buildingsById = new Map(buildingSources.map((building) => [building.id, building] as const));
  const remainingHealthById = new Map(units.map((unit) => [unit.id, unit.health] as const));
  const totals = new Map<string, { amount: number; killerId: string }>();

  for (const intent of intents) {
    if (intent.targetType !== "unit") continue;
    if (intent.amount <= 0 || !livingIds.has(intent.targetId)) continue;
    const source = intent.sourceType === "unit"
      ? unitsById.get(intent.sourceId)
      : buildingsById.get(intent.sourceId);
    const target = unitsById.get(intent.targetId);
    if (!source || !target) continue;
    const mitigatedAmount = intent.amount * (1 - UNIT_SPECS[target.role].damageReduction);
    const remainingHealth = remainingHealthById.get(target.id) ?? 0;
    const appliedAmount = Math.min(mitigatedAmount, remainingHealth);
    if (appliedAmount <= 0) continue;
    remainingHealthById.set(target.id, remainingHealth - appliedAmount);
    emit({
      type: "damage-applied",
      sourceId: intent.sourceId,
      sourceRole: source.targetType === "unit"
        ? source.role
        : source.kind === "arrow-tower" || source.kind === "guard-tower"
          ? "arrow-tower"
          : "castle",
      sourcePosition: { ...source.position },
      targetId: intent.targetId,
      targetType: "unit",
      targetPosition: { ...target.position },
      amount: appliedAmount,
    });
    const current = totals.get(intent.targetId);
    totals.set(intent.targetId, {
      amount: (current?.amount ?? 0) + appliedAmount,
      killerId: current?.killerId ?? intent.sourceId,
    });
  }

  return units.map((unit) => {
    const total = totals.get(unit.id);
    if (!total) return unit;
    const damaged = applyDamage(unit, total.amount, elapsed);
    if (unit.health > 0 && damaged.health === 0) {
      emit({ type: "unit-died", unitId: unit.id, killerId: total.killerId });
    }
    return damaged;
  });
}

function resolveCastleWinner(
  buildings: readonly BattleBuilding[],
): Faction | "draw" | null {
  const verdant = buildings.find((building) => (
    building.kind === "castle" && building.faction === "verdant"
  ));
  const crimson = buildings.find((building) => (
    building.kind === "castle" && building.faction === "crimson"
  ));
  if (!verdant || !crimson) return null;
  const verdantDestroyed = verdant.health <= 0 || verdant.status === "destroyed";
  const crimsonDestroyed = crimson.health <= 0 || crimson.status === "destroyed";
  if (verdantDestroyed && crimsonDestroyed) return "draw";
  if (verdantDestroyed) return "crimson";
  if (crimsonDestroyed) return "verdant";
  return null;
}

function resolveTimeoutWinner(
  buildings: readonly BattleBuilding[],
): Faction | "draw" {
  const verdantHealth = buildings.find((building) => (
    building.kind === "castle" && building.faction === "verdant"
  ))?.health;
  const crimsonHealth = buildings.find((building) => (
    building.kind === "castle" && building.faction === "crimson"
  ))?.health;
  if (verdantHealth === undefined || crimsonHealth === undefined) return "draw";
  if (verdantHealth > crimsonHealth) return "verdant";
  if (crimsonHealth > verdantHealth) return "crimson";
  return "draw";
}

function applyDamage(unit: BattleUnit, amount: number, elapsed: number): BattleUnit {
  if (amount <= 0 || unit.health <= 0) return unit;
  const health = Math.max(0, unit.health - amount);
  return health === 0
    ? {
        ...unit,
        health,
        status: "dead",
        diedAt: elapsed,
        waypoints: [],
        currentTarget: null,
      }
    : { ...unit, health };
}

function advanceTowardTarget(
  unit: BattleUnit,
  target: CombatTarget,
  facing: number,
  deltaSeconds: number,
): BattleUnit {
  const spec = UNIT_SPECS[unit.role];
  const maximumDistance = Math.min(
    spec.moveSpeed * deltaSeconds,
    Math.max(0, distance(unit.position, target.position) - spec.attackRange),
  );
  const navigationKey = `target:${target.targetType}:${target.id}`;
  let waypoints = unit.navigationKey === navigationKey ? unit.waypoints : [];
  if (waypoints.length === 0) {
    const proposed = moveToward(unit.position, target.position, maximumDistance);
    const position = walkableForwardPosition(unit.faction, unit.position, proposed);
    if (position) {
      return {
        ...unit,
        position,
        facing,
        status: "moving",
        waypoints: [],
        navigationKey,
      };
    }
    const route = findWorldPath(BATTLEFIELD_MAP, unit.position, target.position);
    const waypoint = route[0];
    if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
    waypoints = route;
  }
  const waypoint = waypoints[0] ?? target.position;
  const requested = moveToward(unit.position, waypoint, maximumDistance);
  const moved = walkableForwardPosition(unit.faction, unit.position, requested);
  if (!moved) return { ...unit, facing, status: "idle", waypoints: [], navigationKey: null };
  const arrivalDistance = waypoints.length > 1
    ? NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE
    : ARRIVAL_DISTANCE;
  if (distance(moved, waypoint) <= arrivalDistance) waypoints = waypoints.slice(1);
  return {
    ...unit,
    position: clampToForwardProgress(unit.faction, unit.position, moved),
    waypoints,
    navigationKey,
    facing,
    status: "moving",
  };
}

function advanceTowardCombatPosition(
  unit: BattleUnit,
  destination: WorldPoint,
  navigationKey: string,
  facing: number,
  deltaSeconds: number,
): BattleUnit {
  const maximumDistance = UNIT_SPECS[unit.role].moveSpeed * deltaSeconds;
  if (unit.navigationKey === navigationKey && unit.waypoints.length > 0) {
    let waypoints = unit.waypoints;
    const waypoint = waypoints[0]!;
    const requested = moveToward(unit.position, waypoint, maximumDistance);
    const position = walkableForwardPosition(unit.faction, unit.position, requested);
    if (position) {
      if (distance(position, waypoint) <= NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE) {
        waypoints = waypoints.slice(1);
      }
      return {
        ...unit,
        position,
        facing,
        status: "moving",
        waypoints,
        navigationKey,
      };
    }
  }
  const requestedDirect = moveToward(unit.position, destination, maximumDistance);
  const direct = walkableForwardPosition(unit.faction, unit.position, requestedDirect);
  if (direct) {
    return {
      ...unit,
      position: direct,
      facing,
      status: "moving",
      waypoints: [],
      navigationKey,
    };
  }
  const route = findWorldPath(BATTLEFIELD_MAP, unit.position, destination);
  const waypoint = route[0];
  if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
  const position = walkableForwardPosition(
    unit.faction,
    unit.position,
    moveToward(unit.position, waypoint, maximumDistance),
  );
  if (!position) {
    return { ...unit, facing, status: "idle", waypoints: route, navigationKey };
  }
  return {
    ...unit,
    position,
    facing,
    status: "moving",
    waypoints: distance(position, waypoint) <= NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE
      ? route.slice(1)
      : route,
    navigationKey,
  };
}

export function appendUnitsToSquads(
  squads: readonly BattleSquad[],
  units: readonly BattleUnit[],
): readonly BattleSquad[] {
  if (units.length === 0) return squads;
  const next = new Map(squads.map((squad) => [squad.id, squad] as const));
  for (const unit of units) {
    const existing = next.get(unit.squadId);
    next.set(unit.squadId, existing
      ? {
          ...existing,
          memberIds: [...existing.memberIds, unit.id],
          initialSize: existing.initialSize + 1,
        }
      : {
          id: unit.squadId,
          faction: unit.faction,
          role: unit.role,
          memberIds: [unit.id],
          initialSize: 1,
        });
  }
  return [...next.values()];
}

function createInitialDefensiveBuildings(): BattleBuilding[] {
  return BATTLEFIELD_BATTLE_STRUCTURES.flatMap((structure) => {
    if (
      (structure.kind !== "castle" && structure.kind !== "arrow-tower")
      || structure.faction === null
    ) return [];
    return [createBattleBuilding({
      id: structure.id,
      kind: structure.kind,
      faction: structure.faction,
      coordinate: structure.coordinate,
      createdAt: 0,
    })];
  });
}

function moveToward(origin: WorldPoint, destination: WorldPoint, maximumDistance: number): WorldPoint {
  const dx = destination.x - origin.x;
  const dz = destination.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (length <= maximumDistance || length === 0) return { ...destination };
  const ratio = maximumDistance / length;
  return { x: origin.x + dx * ratio, z: origin.z + dz * ratio };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function walkableForwardPosition(
  faction: Faction,
  origin: WorldPoint,
  requested: WorldPoint,
): WorldPoint | null {
  const position = clampToForwardProgress(faction, origin, requested);
  return getBattlefieldCell(worldToAxial(position))?.walkable ? position : null;
}

function cloneUnit(unit: BattleUnit): BattleUnit {
  return {
    ...unit,
    position: { ...unit.position },
    formationSlot: { ...unit.formationSlot },
    waypoints: unit.waypoints.map((waypoint) => ({ ...waypoint })),
    engagementSlot: unit.engagementSlot
      ? { ...unit.engagementSlot, position: { ...unit.engagementSlot.position } }
      : null,
  };
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function nearbyEnemyUnits(
  unit: BattleUnit,
  spatialIndex: BattleSpatialIndex,
): BattleUnit[] {
  const nearby = spatialIndex.enemiesWithin(unit, UNIT_SPECS[unit.role].aggroRange);
  if (
    !unit.currentTarget
    || unit.currentTarget.targetType !== "unit"
    || nearby.some((candidate) => candidate.id === unit.currentTarget?.targetId)
  ) {
    return nearby;
  }
  const current = spatialIndex.unitById(unit.currentTarget.targetId);
  return current && current.health > 0 && current.faction !== unit.faction
    ? [...nearby, current]
    : nearby;
}
