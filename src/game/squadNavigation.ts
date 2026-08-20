import {
  axialToWorld,
  battlefieldMapIndexFor,
  coordinateKey,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import { findHexPath, type NavigationContext } from "./navigation";
import type { Faction, WorldPoint } from "./types";

export interface SquadNavigationMember {
  readonly id: string;
  readonly squadId: string;
  readonly faction: Faction;
  readonly position: WorldPoint;
  readonly destination: HexCoordinate;
  readonly navigationKey: string;
  readonly needsRoute: boolean;
}

export interface SquadMemberNavigationRoute {
  readonly memberId: string;
  readonly canonicalJoinIndex: number;
  readonly waypoints: readonly WorldPoint[];
}

export interface SquadNavigationPlan {
  readonly squadId: string;
  readonly faction: Faction;
  readonly destination: HexCoordinate;
  readonly navigationKey: string;
  readonly canonicalMemberId: string;
  readonly canonicalRoute: readonly HexCoordinate[];
  readonly memberRoutes: readonly SquadMemberNavigationRoute[];
}

export interface BuildSquadNavigationPlanInput {
  readonly map: BattlefieldMap;
  readonly squadId: string;
  readonly faction: Faction;
  readonly destination: HexCoordinate;
  readonly navigationKey: string;
  readonly members: readonly Pick<SquadNavigationMember, "id" | "position">[];
  readonly navigationContext?: NavigationContext;
}

/**
 * Computes one authoritative long route for a squad. Every member joins that
 * immutable trunk through a local breadth-first connector, so formation
 * spacing never multiplies long-distance A* work.
 */
export function buildSquadNavigationPlan(
  input: BuildSquadNavigationPlanInput,
): SquadNavigationPlan | null {
  const members = [...input.members].sort((first, second) => first.id.localeCompare(second.id));
  const canonicalMember = members[0];
  if (!canonicalMember) return null;
  const canonicalRoute = findHexPath(
    input.map,
    worldToAxial(canonicalMember.position),
    input.destination,
    input.navigationContext,
  );
  if (canonicalRoute.length === 0) return null;

  const frozenCanonicalRoute = freezeCoordinates(canonicalRoute);
  const memberRoutes = members.flatMap((member): SquadMemberNavigationRoute[] => {
    const joined = joinCanonicalRoute(
      input.map,
      worldToAxial(member.position),
      frozenCanonicalRoute,
      input.navigationContext?.blockedKeys,
    );
    if (!joined) return [];
    return [Object.freeze({
      memberId: member.id,
      canonicalJoinIndex: joined.canonicalJoinIndex,
      waypoints: freezeWorldPoints(joined.route.slice(1).map(axialToWorld)),
    })];
  });

  return Object.freeze({
    squadId: input.squadId,
    faction: input.faction,
    destination: Object.freeze({ ...input.destination }),
    navigationKey: input.navigationKey,
    canonicalMemberId: canonicalMember.id,
    canonicalRoute: frozenCanonicalRoute,
    memberRoutes: Object.freeze(memberRoutes),
  });
}

/** Builds at most one canonical route for each squad/faction/target tuple. */
export function buildSquadNavigationPlans(
  map: BattlefieldMap,
  members: readonly SquadNavigationMember[],
  navigationContext?: NavigationContext,
): ReadonlyMap<string, SquadNavigationPlan> {
  const groups = new Map<string, SquadNavigationMember[]>();
  for (const member of members) {
    const groupKey = JSON.stringify([
      member.squadId,
      member.faction,
      coordinateKey(member.destination),
      member.navigationKey,
    ]);
    const group = groups.get(groupKey);
    if (group) group.push(member);
    else groups.set(groupKey, [member]);
  }

  const planByMemberId = new Map<string, SquadNavigationPlan>();
  for (const group of groups.values()) {
    // Independent one-unit squads retain the existing direct navigation path.
    if (group.length < 2 || !group.some((member) => member.needsRoute)) continue;
    const first = group[0]!;
    const plan = buildSquadNavigationPlan({
      map,
      squadId: first.squadId,
      faction: first.faction,
      destination: first.destination,
      navigationKey: first.navigationKey,
      members: group,
      navigationContext,
    });
    if (!plan) continue;
    for (const member of group) planByMemberId.set(member.id, plan);
  }
  return planByMemberId;
}

export function squadNavigationWaypointsFor(
  plan: SquadNavigationPlan,
  memberId: string,
): WorldPoint[] | null {
  const route = plan.memberRoutes.find((candidate) => candidate.memberId === memberId);
  return route ? route.waypoints.map((point) => ({ ...point })) : null;
}

interface CanonicalJoin {
  readonly canonicalJoinIndex: number;
  readonly route: readonly HexCoordinate[];
}

function joinCanonicalRoute(
  map: BattlefieldMap,
  start: HexCoordinate,
  canonicalRoute: readonly HexCoordinate[],
  blockedKeys?: ReadonlySet<string>,
): CanonicalJoin | null {
  const index = battlefieldMapIndexFor(map);
  const startKey = coordinateKey(start);
  if (!index.cellByKey.get(startKey)?.walkable || blockedKeys?.has(startKey)) return null;
  const canonicalIndexByKey = new Map(
    canonicalRoute.map((coordinate, routeIndex) => [coordinateKey(coordinate), routeIndex] as const),
  );
  const directJoinIndex = canonicalIndexByKey.get(startKey);
  if (directJoinIndex !== undefined) {
    return {
      canonicalJoinIndex: directJoinIndex,
      route: canonicalRoute.slice(directJoinIndex),
    };
  }

  const cameFrom = new Map<string, string>();
  const visited = new Set([startKey]);
  let frontier = [startKey];
  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    const joins: { readonly key: string; readonly routeIndex: number }[] = [];
    for (const currentKey of frontier) {
      for (const neighborKey of index.neighborKeysByKey.get(currentKey) ?? []) {
        if (
          visited.has(neighborKey)
          || blockedKeys?.has(neighborKey)
          || !index.cellByKey.get(neighborKey)?.walkable
        ) continue;
        visited.add(neighborKey);
        cameFrom.set(neighborKey, currentKey);
        nextFrontier.push(neighborKey);
        const routeIndex = canonicalIndexByKey.get(neighborKey);
        if (routeIndex !== undefined) joins.push({ key: neighborKey, routeIndex });
      }
    }
    if (joins.length > 0) {
      const join = joins.sort((first, second) => (
        first.routeIndex - second.routeIndex || first.key.localeCompare(second.key)
      ))[0]!;
      const localRoute = reconstructLocalRoute(index.cellByKey, cameFrom, startKey, join.key);
      return {
        canonicalJoinIndex: join.routeIndex,
        route: [
          ...localRoute,
          ...canonicalRoute.slice(join.routeIndex + 1),
        ],
      };
    }
    frontier = nextFrontier;
  }
  return null;
}

function reconstructLocalRoute(
  cellByKey: ReadonlyMap<string, HexCoordinate>,
  cameFrom: ReadonlyMap<string, string>,
  startKey: string,
  joinKey: string,
): HexCoordinate[] {
  const keys = [joinKey];
  let currentKey = joinKey;
  while (currentKey !== startKey) {
    currentKey = cameFrom.get(currentKey)!;
    keys.push(currentKey);
  }
  return keys.reverse().map((key) => {
    const coordinate = cellByKey.get(key)!;
    return { q: coordinate.q, r: coordinate.r };
  });
}

function freezeCoordinates(coordinates: readonly HexCoordinate[]): readonly HexCoordinate[] {
  return Object.freeze(coordinates.map((coordinate) => Object.freeze({ ...coordinate })));
}

function freezeWorldPoints(points: readonly WorldPoint[]): readonly WorldPoint[] {
  return Object.freeze(points.map((point) => Object.freeze({ ...point })));
}
