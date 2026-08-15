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
  assignSquadFormationDestinations,
  createFormationSlots,
  separateLivingAllies,
} from "./formation";
import {
  areWorldPointsConnected,
  findWorldPath,
  resolveWalkableWorldPoint,
} from "./navigation";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../map/battlefield";
import { BATTLEFIELD_DEPLOYMENTS } from "../scenarios/battlefieldScenario";
import type { Faction, UnitRole, WorldPoint } from "./types";

export type { Faction, UnitRole, WorldPoint } from "./types";
export type UnitStatus = "idle" | "moving" | "attacking" | "dead";

export type UnitOrder =
  | { readonly type: "idle" }
  | { readonly type: "stop" }
  | { readonly type: "move"; readonly destination: WorldPoint }
  | { readonly type: "attack"; readonly targetId: string }
  | {
      readonly type: "attack-move";
      readonly destination: WorldPoint;
      readonly startsAt: number;
      readonly targetId?: string;
    }
  | { readonly type: "hold"; readonly position: WorldPoint };

export interface UnitSpec {
  readonly attackMode: "melee" | "projectile";
  readonly rangeResponse: "stand" | "skirmish";
  readonly maxHealth: number;
  readonly damage: number;
  readonly attackRange: number;
  readonly minimumRange: number;
  readonly attackCooldown: number;
  readonly moveSpeed: number;
  readonly aggroRange: number;
  readonly splashRadius: number;
  readonly projectileSpeed: number;
}

export interface BattleUnit {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly squadId: string;
  readonly maxHealth: number;
  readonly health: number;
  readonly position: WorldPoint;
  readonly formationSlot: WorldPoint;
  readonly waypoints: readonly WorldPoint[];
  readonly order: UnitOrder;
  readonly status: UnitStatus;
  readonly cooldownRemaining: number;
  readonly facing: number;
  readonly currentTargetId: string | null;
  readonly evasionTargetId: string | null;
  readonly engagementSlot: MeleeEngagementSlot | null;
  readonly diedAt: number | null;
}

export interface BattleState {
  readonly units: readonly BattleUnit[];
  readonly squads: readonly BattleSquad[];
  readonly projectiles: readonly BattleProjectile[];
  readonly events: readonly BattleEvent[];
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

interface DamageIntent {
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
}

interface RangedEvasionDecision {
  readonly mode: "evade" | "screen";
  readonly threat: BattleUnit;
}

type EmitBattleEvent = (input: BattleEventInput) => BattleEvent;

const ARRIVAL_DISTANCE = 0.12;
const NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE = 0.55;
const MAX_STEP_SECONDS = 0.1;
const ENEMY_DEPLOYMENT_SECONDS = 2;
const EVENT_WINDOW_SECONDS = 2;
const RANGED_PRESSURE_ENTER_DISTANCE = 2.35;
const RANGED_PRESSURE_RELEASE_DISTANCE = 3.4;
const RANGED_TARGET_RELEASE_MARGIN = 0.75;
const POST_BATTLE_PRESENTATION_SECONDS = 8;

export const UNIT_SPECS = {
  knight: {
    attackMode: "melee",
    rangeResponse: "stand",
    maxHealth: 220,
    damage: 5.25,
    attackRange: 1.22,
    minimumRange: 0,
    attackCooldown: 1.1,
    moveSpeed: 3.25,
    aggroRange: 7.5,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  ranger: {
    attackMode: "projectile",
    rangeResponse: "skirmish",
    maxHealth: 122,
    damage: 4,
    attackRange: 7,
    minimumRange: 5.5,
    attackCooldown: 1.4,
    moveSpeed: 3.55,
    aggroRange: 9,
    splashRadius: 0,
    projectileSpeed: 14,
  },
  mage: {
    attackMode: "projectile",
    rangeResponse: "skirmish",
    maxHealth: 102,
    damage: 5,
    attackRange: 6.2,
    minimumRange: 4.5,
    attackCooldown: 2,
    moveSpeed: 3.05,
    aggroRange: 8.5,
    splashRadius: 2.25,
    projectileSpeed: 8,
  },
  catapult: {
    attackMode: "projectile",
    rangeResponse: "stand",
    maxHealth: 360,
    damage: 42,
    attackRange: 13.5,
    minimumRange: 0,
    attackCooldown: 4,
    moveSpeed: 1.65,
    aggroRange: 13,
    splashRadius: 2.8,
    projectileSpeed: 7,
  },
} as const satisfies Readonly<Record<UnitRole, UnitSpec>>;

export function createBattleUnit(input: CreateBattleUnitInput): BattleUnit {
  const spec = UNIT_SPECS[input.role];
  return {
    ...input,
    squadId: input.squadId ?? `${input.faction}-independent-${input.id}`,
    position: { ...input.position },
    formationSlot: { ...input.position },
    waypoints: [],
    maxHealth: spec.maxHealth,
    health: spec.maxHealth,
    order: { type: "idle" },
    status: "idle",
    cooldownRemaining: 0,
    facing: input.faction === "verdant" ? Math.PI : 0,
    currentTargetId: null,
    evasionTargetId: null,
    engagementSlot: null,
    diedAt: null,
  };
}

export function createBattleState(units: readonly BattleUnit[]): BattleState {
  const clonedUnits = units.map(cloneUnit);
  const winner = resolveWinner(units);
  return {
    units: clonedUnits,
    squads: buildSquads(clonedUnits),
    projectiles: [],
    events: [],
    nextEventSequence: 0,
    elapsed: 0,
    winner,
    resolvedAt: winner ? 0 : null,
    revision: 0,
  };
}

export function createInitialBattle(): BattleState {
  const units: BattleUnit[] = [];
  units.push(...createArmy("verdant"));
  units.push(...createArmy("crimson"));
  const state = createBattleState(units);
  const enemyIds = units
    .filter((unit) => unit.faction === "crimson")
    .map((unit) => unit.id);
  return issueAttackMoveCommand(
    state,
    enemyIds,
    axialToWorld(BATTLEFIELD_MAP.verdantCamp),
    ENEMY_DEPLOYMENT_SECONDS,
  );
}

export function issueMoveCommand(
  state: BattleState,
  unitIds: readonly string[],
  destination: WorldPoint,
): BattleState {
  if (!isFinitePoint(destination)) return state;
  const selected = new Set(unitIds);
  const commanded = state.units
    .filter((unit) => selected.has(unit.id) && unit.health > 0)
    .sort((first, second) => first.id.localeCompare(second.id));
  if (commanded.length === 0) return state;
  const destinationsById = assignSquadFormationDestinations(commanded, destination);
  const routesById = createSquadMovementRoutes(commanded, destinationsById);

  return {
    ...state,
    revision: state.revision + 1,
    units: state.units.map((unit) => {
      const route = routesById.get(unit.id);
      if (!route) return unit;
      return {
        ...unit,
        order: { type: "move", destination: route.destination },
        formationSlot: { ...route.destination },
        waypoints: route.waypoints,
        status: route.waypoints.length > 0 ? "moving" : "idle",
        currentTargetId: null,
        evasionTargetId: null,
        engagementSlot: null,
      };
    }),
  };
}

export function issueAttackMoveCommand(
  state: BattleState,
  unitIds: readonly string[],
  destination: WorldPoint,
  delaySeconds = 0,
): BattleState {
  const selected = new Set(unitIds);
  const currentTargets = new Map(
    state.units
      .filter((unit) => selected.has(unit.id))
      .map((unit) => [unit.id, currentCombatTargetId(unit, state)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );
  const moved = issueMoveCommand(state, unitIds, destination);
  if (moved === state) return state;
  return {
    ...moved,
    units: moved.units.map((unit) => (
      selected.has(unit.id) && unit.health > 0
        ? {
            ...unit,
            currentTargetId: currentTargets.get(unit.id) ?? null,
            order: {
              type: "attack-move",
              destination: unit.formationSlot,
              startsAt: state.elapsed + Math.max(0, delaySeconds),
              ...(currentTargets.has(unit.id)
                ? { targetId: currentTargets.get(unit.id) }
                : {}),
            },
          }
        : unit
    )),
  };
}

function currentCombatTargetId(
  unit: BattleUnit,
  state: BattleState,
): string | null {
  const targetId = unit.currentTargetId
    ?? (unit.order.type === "attack"
    ? unit.order.targetId
    : unit.order.type === "attack-move"
      ? unit.order.targetId ?? unit.engagementSlot?.targetId ?? null
      : unit.engagementSlot?.targetId ?? null);
  if (!targetId) return null;
  const target = state.units.find((candidate) => candidate.id === targetId);
  return target
    && target.health > 0
    && target.faction !== unit.faction
    ? targetId
    : null;
}

export function issueStopCommand(
  state: BattleState,
  unitIds: readonly string[],
): BattleState {
  const selected = new Set(unitIds);
  let changed = false;
  const units = state.units.map((unit) => {
    if (!selected.has(unit.id) || unit.health <= 0) return unit;
    changed = true;
    return {
      ...unit,
      order: { type: "stop" } as const,
      status: "idle" as const,
      waypoints: [],
      currentTargetId: null,
      evasionTargetId: null,
      engagementSlot: null,
    };
  });
  return changed ? { ...state, units, revision: state.revision + 1 } : state;
}

export function issueHoldCommand(
  state: BattleState,
  unitIds: readonly string[],
): BattleState {
  const selected = new Set(unitIds);
  let changed = false;
  const units = state.units.map((unit) => {
    if (!selected.has(unit.id) || unit.health <= 0) return unit;
    changed = true;
    return {
      ...unit,
      order: { type: "hold", position: { ...unit.position } } as const,
      status: "idle" as const,
      waypoints: [],
      currentTargetId: null,
      evasionTargetId: null,
      engagementSlot: null,
    };
  });
  return changed ? { ...state, units, revision: state.revision + 1 } : state;
}

export function issueAttackCommand(
  state: BattleState,
  unitIds: readonly string[],
  targetId: string,
): BattleState {
  const target = state.units.find((unit) => (
    unit.id === targetId && unit.health > 0
  ));
  if (!target) return state;
  const selected = new Set(unitIds);
  let changed = false;
  const units = state.units.map((unit) => {
    if (
      !selected.has(unit.id)
      || unit.health <= 0
      || unit.faction === target.faction
    ) return unit;
    changed = true;
    return {
      ...unit,
      order: { type: "attack", targetId } as const,
      status: "moving" as const,
      waypoints: [],
      currentTargetId: targetId,
      evasionTargetId: null,
      engagementSlot: unit.engagementSlot?.targetId === targetId
        ? unit.engagementSlot
        : null,
    };
  });
  return changed ? { ...state, units, revision: state.revision + 1 } : state;
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
    return {
      ...state,
      projectiles: [],
      events: pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      elapsed,
      revision: state.revision + 1,
    };
  }
  const elapsed = state.elapsed + deltaSeconds;
  const livingAtStart = state.units.filter((unit) => unit.health > 0);
  const damage: DamageIntent[] = [];
  const emitted: BattleEvent[] = [];
  let nextEventSequence = state.nextEventSequence;
  const emit: EmitBattleEvent = (input) => {
    const event = stampBattleEvent(input, nextEventSequence, elapsed);
    nextEventSequence += 1;
    emitted.push(event);
    return event;
  };
  const projectileStep = advanceProjectiles(
    state.projectiles,
    livingAtStart,
    deltaSeconds,
  );
  for (const impact of projectileStep.impacts) {
    resolveProjectileImpact(impact, livingAtStart, damage, emit);
  }
  const spawnedProjectiles: BattleProjectile[] = [];
  const combatantsAtStart = livingAtStart;
  const targetsByUnitId = new Map(
    combatantsAtStart.map((unit) => [unit.id, resolveTarget(unit, combatantsAtStart)] as const),
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
          previousSlotIndex: attacker.engagementSlot?.targetId === target.id
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
    livingAtStart,
    targetsByUnitId.get(unit.id) ?? null,
    engagementByAttackerId.get(unit.id) ?? null,
    deltaSeconds,
    state.elapsed,
    damage,
    spawnedProjectiles,
    emit,
  ));
  const separatedUnits = separateLivingAllies(advancedUnits);
  const damagedUnits = applyDamageIntents(separatedUnits, damage, elapsed, emit);
  const winner = resolveWinner(damagedUnits);
  return {
    units: damagedUnits,
    squads: state.squads,
    projectiles: winner
      ? []
      : [...projectileStep.projectiles, ...spawnedProjectiles],
    events: [
      ...pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      ...emitted,
    ],
    nextEventSequence,
    elapsed,
    winner,
    resolvedAt: state.resolvedAt ?? (winner ? elapsed : null),
    revision: state.revision + 1,
  };
}

function advanceUnit(
  unit: BattleUnit,
  allUnits: readonly BattleUnit[],
  target: BattleUnit | null,
  engagementSlot: MeleeEngagementSlot | null,
  deltaSeconds: number,
  elapsed: number,
  damage: DamageIntent[],
  spawnedProjectiles: BattleProjectile[],
  emit: EmitBattleEvent,
): BattleUnit {
  if (unit.health <= 0 || unit.status === "dead") {
    return {
      ...unit,
      health: 0,
      status: "dead",
      order: { type: "idle" },
      waypoints: [],
      currentTargetId: null,
      evasionTargetId: null,
      engagementSlot: null,
    };
  }
  let next: BattleUnit = {
    ...unit,
    cooldownRemaining: Math.max(0, unit.cooldownRemaining - deltaSeconds),
    currentTargetId: target?.id ?? null,
    engagementSlot: UNIT_SPECS[unit.role].attackMode === "melee" ? engagementSlot : null,
  };
  if (target && next.order.type === "attack-move" && next.order.targetId !== target.id) {
    next = { ...next, order: { ...next.order, targetId: target.id } };
  }
  if (next.order.type === "stop") {
    return { ...next, status: "idle", waypoints: [], engagementSlot: null };
  }
  if (next.order.type === "move") {
    return advanceTowardDestination(next, next.order.destination, deltaSeconds);
  }

  if (next.order.type === "attack-move" && elapsed < next.order.startsAt) {
    return { ...next, status: "idle" };
  }

  if (!target && next.order.type === "attack-move") {
    return advanceTowardDestination(next, next.order.destination, deltaSeconds);
  }
  if (!target && next.order.type === "hold") {
    return { ...next, status: "idle", engagementSlot: null };
  }
  if (!target) {
    return {
      ...next,
      order: { type: "idle" },
      status: "idle",
      waypoints: [],
      engagementSlot: null,
    };
  }
  const spec = UNIT_SPECS[next.role];
  const targetDistance = distance(next.position, target.position);
  const facing = Math.atan2(target.position.x - next.position.x, target.position.z - next.position.z);
  let screenedByThreat = false;
  if (spec.rangeResponse === "skirmish") {
    const evasion = resolveRangedEvasion(next, allUnits, target);
    if (evasion?.mode === "evade") {
      return {
        ...advanceRangedTowardRear(next, evasion.threat, facing, deltaSeconds),
        evasionTargetId: evasion.threat.id,
      };
    }
    screenedByThreat = evasion?.mode === "screen";
    next = {
      ...next,
      evasionTargetId: evasion?.threat.id ?? null,
    };
  }
  if (
    spec.attackMode === "melee"
    && next.order.type !== "hold"
    && targetDistance > spec.attackRange
  ) {
    if (!engagementSlot) return { ...next, facing, status: "idle" };
    if (distance(next.position, engagementSlot.position) > ARRIVAL_DISTANCE) {
      return advanceTowardCombatPosition(next, engagementSlot.position, facing, deltaSeconds);
    }
  }
  if (targetDistance > spec.attackRange) {
    if (next.order.type === "hold") return { ...next, facing, status: "idle" };
    if (screenedByThreat) return { ...next, facing, status: "idle", waypoints: [] };
    return advanceTowardTarget(next, target, facing, deltaSeconds);
  }
  if (next.cooldownRemaining > 0) return { ...next, facing, status: "attacking" };

  const attackEvent = emit({
    type: "attack-started",
    attackerId: next.id,
    targetId: target.id,
    role: next.role,
    origin: { ...next.position },
    targetPosition: { ...target.position },
  });
  if (spec.attackMode === "melee") {
    damage.push({ sourceId: next.id, targetId: target.id, amount: spec.damage });
  } else {
    const projectileId = `projectile-${attackEvent.sequence}`;
    const projectile: BattleProjectile = {
      id: projectileId,
      attackerId: next.id,
      targetId: target.id,
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
      role: next.role,
      origin: { ...next.position },
      destination: { ...target.position },
    });
  }
  return {
    ...next,
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
  const waypoints = unit.waypoints.length > 0
    ? unit.waypoints
    : findWorldPath(BATTLEFIELD_MAP, unit.position, destination);
  const waypoint = waypoints[0] ?? destination;
  const remaining = distance(unit.position, waypoint);
  const arrivalDistance = waypoints.length > 1
    ? NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE
    : ARRIVAL_DISTANCE;
  if (remaining <= arrivalDistance) {
    const remainingWaypoints = waypoints.slice(1);
    if (remainingWaypoints.length > 0) {
      return {
        ...unit,
        position: { ...waypoint },
        waypoints: remainingWaypoints,
        status: "moving",
      };
    }
    return {
      ...unit,
      position: { ...destination },
      order: { type: "idle" },
      status: "idle",
      waypoints: [],
    };
  }
  const facing = Math.atan2(waypoint.x - unit.position.x, waypoint.z - unit.position.z);
  return {
    ...unit,
    position: moveToward(
      unit.position,
      waypoint,
      UNIT_SPECS[unit.role].moveSpeed * deltaSeconds,
    ),
    waypoints,
    facing,
    status: "moving",
  };
}

function resolveTarget(
  unit: BattleUnit,
  allUnits: readonly BattleUnit[],
): BattleUnit | null {
  if (unit.order.type === "stop") return null;
  if (unit.order.type === "attack") {
    const targetId = unit.order.targetId;
    const ordered = allUnits.find((candidate) => (
      candidate.id === targetId
      && candidate.health > 0
      && candidate.faction !== unit.faction
    ));
    if (ordered) return ordered;
  }
  if (unit.order.type === "attack-move" && unit.order.targetId) {
    const targetId = unit.order.targetId;
    const ordered = allUnits.find((candidate) => (
      candidate.id === targetId
      && candidate.health > 0
      && candidate.faction !== unit.faction
    ));
    if (ordered) return ordered;
  }
  const enemies = allUnits
    .filter((candidate) => (
      candidate.health > 0 && candidate.faction !== unit.faction
    ))
    .map((candidate) => ({ candidate, distance: distance(unit.position, candidate.position) }))
    .sort((first, second) => first.distance - second.distance || first.candidate.id.localeCompare(second.candidate.id));
  const closest = enemies[0];
  if (!closest) return null;
  if (closest.distance <= UNIT_SPECS[unit.role].aggroRange) {
    return closest.candidate;
  }
  return null;
}

function resolveRangedEvasion(
  unit: BattleUnit,
  allUnits: readonly BattleUnit[],
  target: BattleUnit,
): RangedEvasionDecision | null {
  const spec = UNIT_SPECS[unit.role];
  const existing = unit.evasionTargetId
    ? allUnits.find((candidate) => (
        candidate.id === unit.evasionTargetId
        && candidate.health > 0
        && candidate.faction !== unit.faction
      ))
    : undefined;
  if (existing) {
    const releaseDistance = existing.id === target.id
      ? spec.minimumRange + RANGED_TARGET_RELEASE_MARGIN
      : RANGED_PRESSURE_RELEASE_DISTANCE;
    const existingDistance = distance(existing.position, unit.position);
    if (existingDistance < releaseDistance) return { mode: "evade", threat: existing };
    if (existingDistance < spec.aggroRange) return { mode: "screen", threat: existing };
  }
  if (distance(target.position, unit.position) < spec.minimumRange) {
    return { mode: "evade", threat: target };
  }
  const pressure = allUnits
    .filter((candidate) => (
      candidate.health > 0
      && candidate.faction !== unit.faction
      && UNIT_SPECS[candidate.role].attackMode === "melee"
      && distance(candidate.position, unit.position) < RANGED_PRESSURE_ENTER_DISTANCE
    ))
    .sort((first, second) => (
      distance(first.position, unit.position) - distance(second.position, unit.position)
      || first.id.localeCompare(second.id)
    ))[0];
  return pressure ? { mode: "evade", threat: pressure } : null;
}

function advanceRangedTowardRear(
  unit: BattleUnit,
  pressure: BattleUnit,
  facing: number,
  deltaSeconds: number,
): BattleUnit {
  const camp = axialToWorld(
    unit.faction === "verdant" ? BATTLEFIELD_MAP.verdantCamp : BATTLEFIELD_MAP.crimsonCamp,
  );
  const away = {
    x: unit.position.x + (unit.position.x - pressure.position.x) * 2.4,
    z: unit.position.z + (unit.position.z - pressure.position.z) * 2.4,
  };
  const requested = {
    x: away.x * 0.35 + camp.x * 0.65,
    z: away.z * 0.35 + camp.z * 0.65,
  };
  const route = findWorldPath(BATTLEFIELD_MAP, unit.position, requested);
  const waypoint = route[0]
    ?? resolveWalkableWorldPoint(BATTLEFIELD_MAP, requested)
    ?? unit.position;
  return {
    ...unit,
    position: moveToward(
      unit.position,
      waypoint,
      UNIT_SPECS[unit.role].moveSpeed * deltaSeconds,
    ),
    facing,
    status: "moving",
    waypoints: [],
  };
}

function resolveProjectileImpact(
  impact: ProjectileImpact,
  units: readonly BattleUnit[],
  damage: DamageIntent[],
  emit: EmitBattleEvent,
): void {
  const { projectile, position } = impact;
  emit({
    type: "projectile-hit",
    projectileId: projectile.id,
    attackerId: projectile.attackerId,
    targetId: projectile.targetId,
    role: projectile.role,
    position: { ...position },
    splashRadius: projectile.splashRadius,
  });
  const target = units.find((unit) => unit.id === projectile.targetId && unit.health > 0);
  if (!target) return;

  damage.push({
    sourceId: projectile.attackerId,
    targetId: target.id,
    amount: projectile.damage,
  });
  if (projectile.splashRadius <= 0) return;
  for (const candidate of units) {
    if (
      candidate.id === target.id
      || candidate.health <= 0
      || candidate.faction !== target.faction
      || distance(candidate.position, position) > projectile.splashRadius
    ) continue;
    damage.push({
      sourceId: projectile.attackerId,
      targetId: candidate.id,
      amount: projectile.damage * 0.55,
    });
  }
}

function applyDamageIntents(
  units: readonly BattleUnit[],
  intents: readonly DamageIntent[],
  elapsed: number,
  emit: EmitBattleEvent,
): BattleUnit[] {
  const livingIds = new Set(
    units.filter((unit) => unit.health > 0).map((unit) => unit.id),
  );
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));
  const totals = new Map<string, { amount: number; killerId: string }>();

  for (const intent of intents) {
    if (intent.amount <= 0 || !livingIds.has(intent.targetId)) continue;
    const source = unitsById.get(intent.sourceId);
    const target = unitsById.get(intent.targetId);
    if (!source || !target) continue;
    emit({
      type: "damage-applied",
      sourceId: intent.sourceId,
      sourceRole: source.role,
      sourcePosition: { ...source.position },
      targetId: intent.targetId,
      targetPosition: { ...target.position },
      amount: intent.amount,
    });
    const current = totals.get(intent.targetId);
    totals.set(intent.targetId, {
      amount: (current?.amount ?? 0) + intent.amount,
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

function applyDamage(unit: BattleUnit, amount: number, elapsed: number): BattleUnit {
  if (amount <= 0 || unit.health <= 0) return unit;
  const health = Math.max(0, unit.health - amount);
  return health === 0
    ? {
        ...unit,
        health,
        status: "dead",
        diedAt: elapsed,
        order: { type: "idle" },
        waypoints: [],
        currentTargetId: null,
        evasionTargetId: null,
      }
    : { ...unit, health };
}

interface MovementRoute {
  readonly destination: WorldPoint;
  readonly waypoints: readonly WorldPoint[];
}

function createSquadMovementRoutes(
  units: readonly BattleUnit[],
  destinationsById: ReadonlyMap<string, WorldPoint>,
): Map<string, MovementRoute> {
  const grouped = new Map<string, BattleUnit[]>();
  for (const unit of units) {
    const members = grouped.get(unit.squadId) ?? [];
    members.push(unit);
    grouped.set(unit.squadId, members);
  }
  const routes = new Map<string, MovementRoute>();
  for (const members of grouped.values()) {
    const proposed = members
      .map((unit) => destinationsById.get(unit.id))
      .filter((point): point is WorldPoint => point !== undefined);
    if (proposed.length === 0) continue;
    const origin = averagePoint(members.map((unit) => unit.position));
    const squadDestination = averagePoint(proposed);
    const resolvedSquadDestination = resolveWalkableWorldPoint(
      BATTLEFIELD_MAP,
      squadDestination,
    ) ?? origin;
    const macroRoute = findWorldPath(BATTLEFIELD_MAP, origin, resolvedSquadDestination);

    for (const unit of members) {
      const proposedDestination = destinationsById.get(unit.id);
      if (!proposedDestination) continue;
      const destination = resolveWalkableWorldPoint(BATTLEFIELD_MAP, proposedDestination)
        ?? unit.position;
      const offset = {
        x: destination.x - resolvedSquadDestination.x,
        z: destination.z - resolvedSquadDestination.z,
      };
      const waypoints = deduplicatePoints([
        ...macroRoute.map((point) => resolveWalkableWorldPoint(BATTLEFIELD_MAP, {
          x: point.x + offset.x,
          z: point.z + offset.z,
        }) ?? point),
        destination,
      ]).filter((point) => distance(point, unit.position) > ARRIVAL_DISTANCE);
      routes.set(unit.id, { destination, waypoints });
    }
  }
  return routes;
}

function advanceTowardTarget(
  unit: BattleUnit,
  target: BattleUnit,
  facing: number,
  deltaSeconds: number,
): BattleUnit {
  const spec = UNIT_SPECS[unit.role];
  const maximumDistance = Math.min(
    spec.moveSpeed * deltaSeconds,
    Math.max(0, distance(unit.position, target.position) - spec.attackRange),
  );
  if (unit.order.type !== "attack") {
    const proposed = moveToward(unit.position, target.position, maximumDistance);
    if (getBattlefieldCell(worldToAxial(proposed))?.walkable) {
      return { ...unit, position: proposed, facing, status: "moving", waypoints: [] };
    }
    const route = findWorldPath(BATTLEFIELD_MAP, unit.position, target.position);
    const waypoint = route[0];
    if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
    return {
      ...unit,
      position: moveToward(unit.position, waypoint, maximumDistance),
      facing,
      status: "moving",
      waypoints: route.slice(1),
    };
  }

  let waypoints = unit.waypoints;
  if (waypoints.length === 0) {
    waypoints = findWorldPath(BATTLEFIELD_MAP, unit.position, target.position);
  }
  const waypoint = waypoints[0] ?? target.position;
  const moved = moveToward(unit.position, waypoint, maximumDistance);
  const arrivalDistance = waypoints.length > 1
    ? NAVIGATION_WAYPOINT_ARRIVAL_DISTANCE
    : ARRIVAL_DISTANCE;
  if (distance(moved, waypoint) <= arrivalDistance) waypoints = waypoints.slice(1);
  return { ...unit, position: moved, waypoints, facing, status: "moving" };
}

function advanceTowardCombatPosition(
  unit: BattleUnit,
  destination: WorldPoint,
  facing: number,
  deltaSeconds: number,
): BattleUnit {
  const maximumDistance = UNIT_SPECS[unit.role].moveSpeed * deltaSeconds;
  const direct = moveToward(unit.position, destination, maximumDistance);
  if (getBattlefieldCell(worldToAxial(direct))?.walkable) {
    return { ...unit, position: direct, facing, status: "moving", waypoints: [] };
  }
  const route = findWorldPath(BATTLEFIELD_MAP, unit.position, destination);
  const waypoint = route[0];
  if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
  return {
    ...unit,
    position: moveToward(unit.position, waypoint, maximumDistance),
    facing,
    status: "moving",
    waypoints: route.slice(1),
  };
}

function createArmy(faction: Faction): BattleUnit[] {
  const facing = faction === "verdant" ? Math.PI : 0;
  const definitions = BATTLEFIELD_DEPLOYMENTS[faction];
  return definitions.flatMap((definition) => {
    const squadId = `${faction}-${definition.name}`;
    return createFormationSlots(definition.count, definition.center, facing).map((position, index) => (
      createBattleUnit({
        id: `${squadId}-${index + 1}`,
        squadId,
        faction,
        role: definition.role,
        position,
      })
    ));
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

function averagePoint(points: readonly WorldPoint[]): WorldPoint {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }),
    { x: 0, z: 0 },
  );
  return points.length === 0
    ? total
    : { x: total.x / points.length, z: total.z / points.length };
}

function deduplicatePoints(points: readonly WorldPoint[]): WorldPoint[] {
  return points.filter((point, index) => (
    index === 0 || distance(point, points[index - 1]!) > 0.01
  ));
}

function resolveWinner(units: readonly BattleUnit[]): BattleState["winner"] {
  const verdantAlive = units.some((unit) => (
    unit.faction === "verdant" && unit.health > 0
  ));
  const crimsonAlive = units.some((unit) => (
    unit.faction === "crimson" && unit.health > 0
  ));
  if (verdantAlive && crimsonAlive) return null;
  if (verdantAlive) return "verdant";
  if (crimsonAlive) return "crimson";
  return units.length > 0 ? "draw" : null;
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
    order: cloneOrder(unit.order),
  };
}

function cloneOrder(order: UnitOrder): UnitOrder {
  if (order.type === "move" || order.type === "attack-move") {
    return order.type === "attack-move"
      ? {
          type: order.type,
          destination: { ...order.destination },
          startsAt: order.startsAt,
          ...(order.targetId ? { targetId: order.targetId } : {}),
        }
      : { type: order.type, destination: { ...order.destination } };
  }
  if (order.type === "hold") return { type: "hold", position: { ...order.position } };
  return { ...order };
}

function isFinitePoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}
