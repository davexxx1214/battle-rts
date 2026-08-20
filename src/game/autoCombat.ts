import {
  axialToWorld,
  BATTLEFIELD_MAP,
  coordinateKey,
  worldToAxial,
  type BattlefieldMap,
} from "../map/battlefield";
import type { BattleBuilding } from "./buildings";
import type { CombatTarget, CombatTargetRef } from "./combat";
import {
  castleChargeNavigationKey,
  findHexPath,
  type NavigationContext,
} from "./navigation";
import { GAME_RULES, unitSpecFor } from "./rules";
import type { Faction, UnitCombatProfile, UnitRole, WorldPoint } from "./types";

export interface AutomaticCombatUnit extends CombatTarget {
  readonly targetType: "unit";
  readonly role: UnitRole;
  readonly combatProfile: UnitCombatProfile;
  readonly behavior: "charging" | "engaging" | "castle-locked";
  readonly currentTarget: CombatTargetRef | null;
  readonly waypoints: readonly WorldPoint[];
  readonly navigationKey: string | null;
}

export type AutomaticCombatTarget = AutomaticCombatUnit | BattleBuilding;

export interface AutomaticTargetSelectionInput {
  readonly unit: AutomaticCombatUnit;
  readonly units: readonly AutomaticCombatUnit[];
  readonly buildings: readonly BattleBuilding[];
  readonly map?: BattlefieldMap;
  readonly navigationContext?: NavigationContext;
}

const POSITION_EPSILON = 1e-9;

export function selectAutomaticTarget(
  input: AutomaticTargetSelectionInput,
): AutomaticCombatTarget | null {
  const map = input.map ?? BATTLEFIELD_MAP;
  const targets: AutomaticCombatTarget[] = [
    ...input.units.filter((candidate) => (
      candidate.id !== input.unit.id
      && candidate.faction !== input.unit.faction
      && candidate.health > 0
    )),
    ...input.buildings.filter((candidate) => (
      candidate.faction !== input.unit.faction
      && candidate.health > 0
      && candidate.status === "active"
    )),
  ];
  const current = input.unit.currentTarget
    ? targets.find((candidate) => (
        candidate.targetType === input.unit.currentTarget?.targetType
        && candidate.id === input.unit.currentTarget.targetId
      )) ?? null
    : null;
  const destination = axialToWorld(
    map.castleApproaches[oppositeFaction(input.unit.faction)],
  );
  const aggroRange = unitSpecFor(input.unit.role, input.unit.combatProfile).aggroRange;
  const eligible = targets.filter((target) => (
    distance(input.unit.position, target.position) <= aggroRange + POSITION_EPSILON
    && forwardProgress(input.unit.faction, input.unit.position, target.position, map)
      >= -POSITION_EPSILON
    && distanceToSegment(target.position, input.unit.position, destination)
      <= GAME_RULES.targeting.routeCorridorWidth + POSITION_EPSILON
  ));
  const potentialBlockingBuildings = targets.filter((target): target is BattleBuilding => (
    target.targetType === "building"
    && target.kind !== "castle"
    && distance(input.unit.position, target.position) <= aggroRange + POSITION_EPSILON
    && forwardProgress(input.unit.faction, input.unit.position, target.position, map)
      >= -POSITION_EPSILON
  ));
  if (potentialBlockingBuildings.length > 0) {
    const attackRoute = new Set(castleAttackRoute(
      input.unit,
      map,
      input.navigationContext,
    ).map(coordinateKey));
    const blockingBuildings = potentialBlockingBuildings.filter((target) => (
      attackRoute.has(coordinateKey(target.coordinate))
    ));
    if (blockingBuildings.length > 0) {
      return [...blockingBuildings].sort((first, second) => (
        distance(input.unit.position, first.position)
        - distance(input.unit.position, second.position)
        || first.id.localeCompare(second.id)
      ))[0]!;
    }
  }
  if (input.unit.behavior === "castle-locked") {
    if (current?.targetType === "building" && current.kind === "castle") return current;
    return targets.find((target) => (
      target.targetType === "building" && target.kind === "castle"
    )) ?? null;
  }
  if (current && (current.targetType === "unit" || current.kind !== "castle")) return current;

  const ordinary = eligible.filter((target) => (
    target.targetType === "unit" || target.kind !== "castle"
  ));
  const candidates = ordinary.length > 0
    ? ordinary
    : eligible.filter((target) => target.targetType === "building" && target.kind === "castle");
  return [...candidates].sort((first, second) => (
    distance(input.unit.position, first.position)
    - distance(input.unit.position, second.position)
    || first.id.localeCompare(second.id)
  ))[0] ?? null;
}

function castleAttackRoute(
  unit: AutomaticCombatUnit,
  map: BattlefieldMap,
  navigationContext?: NavigationContext,
) {
  const enemyFaction = oppositeFaction(unit.faction);
  const chargeNavigationKey = castleChargeNavigationKey(enemyFaction);
  if (unit.navigationKey === chargeNavigationKey && unit.waypoints.length > 0) {
    return [unit.position, ...unit.waypoints].map(worldToAxial);
  }
  const start = worldToAxial(unit.position);
  return findHexPath(
    map,
    start,
    map.castleApproaches[enemyFaction],
    navigationContext,
  );
}

export function forwardProgress(
  faction: Faction,
  origin: WorldPoint,
  destination: WorldPoint,
  map: BattlefieldMap = BATTLEFIELD_MAP,
): number {
  const axis = attackAxis(faction, map);
  return (destination.x - origin.x) * axis.x + (destination.z - origin.z) * axis.z;
}

export function clampToForwardProgress(
  faction: Faction,
  origin: WorldPoint,
  requested: WorldPoint,
  map: BattlefieldMap = BATTLEFIELD_MAP,
): WorldPoint {
  if (!isFinitePoint(origin) || !isFinitePoint(requested)) return { ...origin };
  const progress = forwardProgress(faction, origin, requested, map);
  if (progress >= 0) return { ...requested };
  const axis = attackAxis(faction, map);
  return {
    x: requested.x - axis.x * progress,
    z: requested.z - axis.z * progress,
  };
}

function attackAxis(faction: Faction, map: BattlefieldMap): WorldPoint {
  const origin = axialToWorld(map.castles[faction]);
  const destination = axialToWorld(map.castles[oppositeFaction(faction)]);
  const dx = destination.x - origin.x;
  const dz = destination.z - origin.z;
  const length = Math.hypot(dx, dz);
  return length > 0 ? { x: dx / length, z: dz / length } : { x: 0, z: 0 };
}

function distanceToSegment(
  point: WorldPoint,
  start: WorldPoint,
  end: WorldPoint,
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= POSITION_EPSILON) return distance(point, start);
  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.z - start.z) * dz
  ) / lengthSquared));
  return distance(point, {
    x: start.x + dx * projection,
    z: start.z + dz * projection,
  });
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function isFinitePoint(point: WorldPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}
