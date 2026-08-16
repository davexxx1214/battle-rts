import type { Faction, WorldPoint } from "./types";
import {
  axialToWorld,
  getMapCell,
  hexDistance,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";

const NEIGHBORS: readonly HexCoordinate[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const componentIndexes = new WeakMap<BattlefieldMap, ReadonlyMap<string, number>>();

export function castleChargeNavigationKey(targetFaction: Faction): string {
  return `charge:${targetFaction}-castle`;
}

export function areWorldPointsConnected(
  map: BattlefieldMap,
  first: WorldPoint,
  second: WorldPoint,
): boolean {
  const components = walkableComponentIndex(map);
  const firstComponent = components.get(coordinateKey(worldToAxial(first)));
  return firstComponent !== undefined
    && firstComponent === components.get(coordinateKey(worldToAxial(second)));
}

export function findHexPath(
  map: BattlefieldMap,
  requestedStart: HexCoordinate,
  requestedGoal: HexCoordinate,
): HexCoordinate[] {
  const start = nearestWalkable(map, requestedStart);
  const goal = nearestWalkable(map, requestedGoal);
  if (!start || !goal) return [];
  const startKey = coordinateKey(start);
  const goalKey = coordinateKey(goal);
  const open = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const coordinates = new Map<string, HexCoordinate>([[startKey, start], [goalKey, goal]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, hexDistance(start, goal)]]);

  while (open.size > 0) {
    const currentKey = [...open].sort((first, second) => (
      (fScore.get(first) ?? Number.POSITIVE_INFINITY)
      - (fScore.get(second) ?? Number.POSITIVE_INFINITY)
      || first.localeCompare(second)
    ))[0]!;
    if (currentKey === goalKey) {
      return reconstructPath(cameFrom, coordinates, currentKey);
    }
    open.delete(currentKey);
    const current = coordinates.get(currentKey)!;
    const currentCell = getMapCell(map, current)!;

    for (const offset of NEIGHBORS) {
      const neighbor = { q: current.q + offset.q, r: current.r + offset.r };
      const neighborCell = getMapCell(map, neighbor);
      if (!neighborCell?.walkable) continue;
      const neighborKey = coordinateKey(neighbor);
      coordinates.set(neighborKey, neighbor);
      const heightCost = Math.abs(neighborCell.height - currentCell.height) * 1.5;
      const tentative = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + 1 + heightCost;
      if (tentative >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + hexDistance(neighbor, goal));
      open.add(neighborKey);
    }
  }

  return [];
}

export function findWorldPath(
  map: BattlefieldMap,
  origin: WorldPoint,
  destination: WorldPoint,
): WorldPoint[] {
  const path = findHexPath(map, worldToAxial(origin), worldToAxial(destination));
  if (path.length === 0) return [];
  const points = path.slice(1).map(axialToWorld);
  const destinationCell = getMapCell(map, worldToAxial(destination));
  if (destinationCell?.walkable) points.push({ ...destination });
  return deduplicatePoints(points);
}

export function resolveWalkableWorldPoint(
  map: BattlefieldMap,
  requested: WorldPoint,
): WorldPoint | null {
  const requestedCoordinate = worldToAxial(requested);
  const exact = getMapCell(map, requestedCoordinate);
  if (exact?.walkable) return { ...requested };
  const resolved = nearestWalkable(map, requestedCoordinate);
  return resolved ? axialToWorld(resolved) : null;
}

function nearestWalkable(
  map: BattlefieldMap,
  requested: HexCoordinate,
): HexCoordinate | null {
  const exact = getMapCell(map, requested);
  if (exact?.walkable) return { q: exact.q, r: exact.r };
  const nearest = map.cells
    .filter((cell) => cell.walkable)
    .sort((first, second) => (
      hexDistance(first, requested) - hexDistance(second, requested)
      || coordinateKey(first).localeCompare(coordinateKey(second))
    ))[0];
  return nearest ? { q: nearest.q, r: nearest.r } : null;
}

function reconstructPath(
  cameFrom: ReadonlyMap<string, string>,
  coordinates: ReadonlyMap<string, HexCoordinate>,
  goalKey: string,
): HexCoordinate[] {
  const path: HexCoordinate[] = [coordinates.get(goalKey)!];
  let currentKey = goalKey;
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    path.push(coordinates.get(currentKey)!);
  }
  return path.reverse();
}

function deduplicatePoints(points: readonly WorldPoint[]): WorldPoint[] {
  return points.filter((point, index) => (
    index === 0
    || Math.hypot(point.x - points[index - 1]!.x, point.z - points[index - 1]!.z) > 0.01
  ));
}

function coordinateKey(coordinate: HexCoordinate): string {
  return `${coordinate.q},${coordinate.r}`;
}

function walkableComponentIndex(map: BattlefieldMap): ReadonlyMap<string, number> {
  const cached = componentIndexes.get(map);
  if (cached) return cached;
  const components = new Map<string, number>();
  let component = 0;
  for (const cell of map.cells) {
    const startKey = coordinateKey(cell);
    if (!cell.walkable || components.has(startKey)) continue;
    const pending: HexCoordinate[] = [{ q: cell.q, r: cell.r }];
    components.set(startKey, component);
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const offset of NEIGHBORS) {
        const neighbor = { q: current.q + offset.q, r: current.r + offset.r };
        const neighborKey = coordinateKey(neighbor);
        if (components.has(neighborKey) || !getMapCell(map, neighbor)?.walkable) continue;
        components.set(neighborKey, component);
        pending.push(neighbor);
      }
    }
    component += 1;
  }
  componentIndexes.set(map, components);
  return components;
}
