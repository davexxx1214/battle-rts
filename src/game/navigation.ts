import {
  axialToWorld,
  battlefieldMapIndexFor,
  coordinateKey,
  getMapCell,
  hexDistance,
  worldToAxial,
  type BattlefieldMap,
  type BattlefieldMapIndex,
  type HexCoordinate,
} from "../map/battlefield";
import type { Faction, WorldPoint } from "./types";

export interface NavigationContext {
  /** Increment whenever the dynamic blocker set changes. */
  readonly revision: number;
  /** Dynamic blockers live outside immutable battlefield definitions. */
  readonly blockedKeys?: ReadonlySet<string>;
  /** Included in cache identity even before movement rules diverge. */
  readonly movementMode?: string;
}

export interface NavigationCacheStats {
  readonly pathHits: number;
  readonly pathMisses: number;
  readonly cachedPaths: number;
  readonly cachedComponentIndexes: number;
}

interface ResolvedNavigationContext {
  readonly revision: number;
  readonly blockedKeys: ReadonlySet<string> | null;
  readonly movementMode: string;
  readonly scopeKey: string;
}

interface OpenNode {
  readonly key: string;
  readonly priority: number;
}

interface NavigationMapCache {
  readonly pathsByScope: Map<string, Map<string, readonly HexCoordinate[]>>;
  readonly componentsByScope: Map<string, ReadonlyMap<string, number>>;
  pathHits: number;
  pathMisses: number;
}

const MAX_CACHED_PATHS_PER_SCOPE = 2_048;
const MAX_CACHED_SCOPES_PER_MAP = 8;
let navigationCaches = new WeakMap<BattlefieldMap, NavigationMapCache>();
const blockerSetIds = new WeakMap<object, number>();
let nextBlockerSetId = 1;

export function castleChargeNavigationKey(targetFaction: Faction): string {
  return `charge:${targetFaction}-castle`;
}

export function areWorldPointsConnected(
  map: BattlefieldMap,
  first: WorldPoint,
  second: WorldPoint,
  context?: NavigationContext,
): boolean {
  const navigation = resolveNavigationContext(map, context);
  const components = walkableComponentIndex(map, navigation);
  const firstComponent = components.get(coordinateKey(worldToAxial(first)));
  return firstComponent !== undefined
    && firstComponent === components.get(coordinateKey(worldToAxial(second)));
}

export function findHexPath(
  map: BattlefieldMap,
  requestedStart: HexCoordinate,
  requestedGoal: HexCoordinate,
  context?: NavigationContext,
): HexCoordinate[] {
  const navigation = resolveNavigationContext(map, context);
  const mapCache = navigationMapCacheFor(map);
  const pathCache = pathCacheForScope(mapCache, navigation.scopeKey);
  const cacheKey = `${coordinateKey(requestedStart)}>${coordinateKey(requestedGoal)}`;
  const cached = pathCache.get(cacheKey);
  if (cached) {
    mapCache.pathHits += 1;
    return clonePath(cached);
  }

  mapCache.pathMisses += 1;
  const path = computeHexPath(map, requestedStart, requestedGoal, navigation);
  cachePath(pathCache, cacheKey, path);
  return clonePath(path);
}

export function findWorldPath(
  map: BattlefieldMap,
  origin: WorldPoint,
  destination: WorldPoint,
  context?: NavigationContext,
): WorldPoint[] {
  const navigation = resolveNavigationContext(map, context);
  const path = findHexPath(map, worldToAxial(origin), worldToAxial(destination), context);
  if (path.length === 0) return [];
  const points = path.slice(1).map(axialToWorld);
  const destinationCoordinate = worldToAxial(destination);
  const destinationCell = getMapCell(map, destinationCoordinate);
  if (
    destinationCell?.walkable
    && !navigation.blockedKeys?.has(coordinateKey(destinationCoordinate))
  ) points.push({ ...destination });
  return deduplicatePoints(points);
}

export function resolveWalkableWorldPoint(
  map: BattlefieldMap,
  requested: WorldPoint,
  context?: NavigationContext,
): WorldPoint | null {
  const navigation = resolveNavigationContext(map, context);
  const requestedCoordinate = worldToAxial(requested);
  const exact = getMapCell(map, requestedCoordinate);
  if (
    exact?.walkable
    && !navigation.blockedKeys?.has(coordinateKey(requestedCoordinate))
  ) return { ...requested };
  const resolved = nearestWalkable(map, requestedCoordinate, navigation);
  return resolved ? axialToWorld(resolved) : null;
}

export function getNavigationCacheStats(map: BattlefieldMap): NavigationCacheStats {
  const cache = navigationCaches.get(map);
  if (!cache) {
    return {
      pathHits: 0,
      pathMisses: 0,
      cachedPaths: 0,
      cachedComponentIndexes: 0,
    };
  }
  return {
    pathHits: cache.pathHits,
    pathMisses: cache.pathMisses,
    cachedPaths: [...cache.pathsByScope.values()].reduce(
      (total, paths) => total + paths.size,
      0,
    ),
    cachedComponentIndexes: cache.componentsByScope.size,
  };
}

export function clearNavigationCaches(map?: BattlefieldMap): void {
  if (map) {
    navigationCaches.delete(map);
    return;
  }
  navigationCaches = new WeakMap<BattlefieldMap, NavigationMapCache>();
}

function computeHexPath(
  map: BattlefieldMap,
  requestedStart: HexCoordinate,
  requestedGoal: HexCoordinate,
  context: ResolvedNavigationContext,
): HexCoordinate[] {
  const index = battlefieldMapIndexFor(map);
  const start = nearestWalkable(map, requestedStart, context);
  const goal = nearestWalkable(map, requestedGoal, context);
  if (!start || !goal) return [];
  const startKey = coordinateKey(start);
  const goalKey = coordinateKey(goal);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const bestPriority = new Map<string, number>([[startKey, hexDistance(start, goal)]]);
  const open = new BinaryMinHeap<OpenNode>((first, second) => (
    first.priority - second.priority || first.key.localeCompare(second.key)
  ));
  open.push({ key: startKey, priority: bestPriority.get(startKey)! });

  while (open.size > 0) {
    const currentNode = open.pop()!;
    if (currentNode.priority !== bestPriority.get(currentNode.key)) continue;
    if (currentNode.key === goalKey) {
      return reconstructPath(cameFrom, index, currentNode.key);
    }
    const currentCell = index.cellByKey.get(currentNode.key)!;

    for (const neighborKey of index.neighborKeysByKey.get(currentNode.key) ?? []) {
      if (context.blockedKeys?.has(neighborKey)) continue;
      const neighborCell = index.cellByKey.get(neighborKey)!;
      if (!neighborCell.walkable) continue;
      const heightCost = Math.abs(neighborCell.height - currentCell.height) * 1.5;
      const tentative = (gScore.get(currentNode.key) ?? Number.POSITIVE_INFINITY)
        + 1
        + heightCost;
      if (tentative >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentNode.key);
      gScore.set(neighborKey, tentative);
      const priority = tentative + hexDistance(neighborCell, goal);
      bestPriority.set(neighborKey, priority);
      open.push({ key: neighborKey, priority });
    }
  }

  return [];
}

function nearestWalkable(
  map: BattlefieldMap,
  requested: HexCoordinate,
  context: ResolvedNavigationContext,
): HexCoordinate | null {
  const index = battlefieldMapIndexFor(map);
  const exactKey = coordinateKey(requested);
  const exact = index.cellByKey.get(exactKey);
  if (exact?.walkable && !context.blockedKeys?.has(exactKey)) {
    return { q: exact.q, r: exact.r };
  }

  const maximumRadius = hexDistance(requested, map.center)
    + index.maximumDistanceFromCenter;
  // Extremely remote input would make a geometric ring expansion needlessly
  // large. Preserve legacy behavior with a linear, non-sorting fallback there.
  if (maximumRadius > Math.max(256, index.cellByKey.size * 2)) {
    return nearestWalkableByScan(index, requested, context.blockedKeys);
  }

  for (let radius = 1; radius <= maximumRadius; radius += 1) {
    let best: HexCoordinate | null = null;
    let bestKey = "";
    forEachCoordinateInRing(requested, radius, (coordinate) => {
      const key = coordinateKey(coordinate);
      const cell = index.cellByKey.get(key);
      if (!cell?.walkable || context.blockedKeys?.has(key)) return;
      if (best === null || key.localeCompare(bestKey) < 0) {
        best = { q: cell.q, r: cell.r };
        bestKey = key;
      }
    });
    if (best) return best;
  }
  return null;
}

function nearestWalkableByScan(
  index: BattlefieldMapIndex,
  requested: HexCoordinate,
  blockedKeys: ReadonlySet<string> | null,
): HexCoordinate | null {
  let best: HexCoordinate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const [key, cell] of index.cellByKey) {
    if (!cell.walkable || blockedKeys?.has(key)) continue;
    const distance = hexDistance(cell, requested);
    if (
      distance < bestDistance
      || (distance === bestDistance && (best === null || key.localeCompare(bestKey) < 0))
    ) {
      best = { q: cell.q, r: cell.r };
      bestDistance = distance;
      bestKey = key;
    }
  }
  return best;
}

function forEachCoordinateInRing(
  center: HexCoordinate,
  radius: number,
  visit: (coordinate: HexCoordinate) => void,
): void {
  for (let qOffset = -radius; qOffset <= radius; qOffset += 1) {
    const minimumR = Math.max(-radius, -qOffset - radius);
    const maximumR = Math.min(radius, -qOffset + radius);
    for (let rOffset = minimumR; rOffset <= maximumR; rOffset += 1) {
      if (hexDistance({ q: 0, r: 0 }, { q: qOffset, r: rOffset }) !== radius) continue;
      visit({ q: center.q + qOffset, r: center.r + rOffset });
    }
  }
}

function reconstructPath(
  cameFrom: ReadonlyMap<string, string>,
  index: BattlefieldMapIndex,
  goalKey: string,
): HexCoordinate[] {
  const goal = index.cellByKey.get(goalKey)!;
  const path: HexCoordinate[] = [{ q: goal.q, r: goal.r }];
  let currentKey = goalKey;
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    const cell = index.cellByKey.get(currentKey)!;
    path.push({ q: cell.q, r: cell.r });
  }
  return path.reverse();
}

function clonePath(path: readonly HexCoordinate[]): HexCoordinate[] {
  return path.map(({ q, r }) => ({ q, r }));
}

function cachePath(
  cache: Map<string, readonly HexCoordinate[]>,
  key: string,
  path: readonly HexCoordinate[],
): void {
  if (cache.size >= MAX_CACHED_PATHS_PER_SCOPE) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, Object.freeze(path.map(({ q, r }) => Object.freeze({ q, r }))));
}

function pathCacheForScope(
  cache: NavigationMapCache,
  scopeKey: string,
): Map<string, readonly HexCoordinate[]> {
  const cached = cache.pathsByScope.get(scopeKey);
  if (cached) return cached;
  pruneOldestScope(cache.pathsByScope);
  const paths = new Map<string, readonly HexCoordinate[]>();
  cache.pathsByScope.set(scopeKey, paths);
  return paths;
}

function walkableComponentIndex(
  map: BattlefieldMap,
  context: ResolvedNavigationContext,
): ReadonlyMap<string, number> {
  const cache = navigationMapCacheFor(map);
  const cached = cache.componentsByScope.get(context.scopeKey);
  if (cached) return cached;
  const index = battlefieldMapIndexFor(map);
  const components = new Map<string, number>();
  let component = 0;
  for (const cell of map.cells) {
    const startKey = coordinateKey(cell);
    if (
      !cell.walkable
      || context.blockedKeys?.has(startKey)
      || components.has(startKey)
    ) continue;
    const pending = [startKey];
    components.set(startKey, component);
    while (pending.length > 0) {
      const currentKey = pending.pop()!;
      for (const neighborKey of index.neighborKeysByKey.get(currentKey) ?? []) {
        if (components.has(neighborKey) || context.blockedKeys?.has(neighborKey)) continue;
        if (!index.cellByKey.get(neighborKey)?.walkable) continue;
        components.set(neighborKey, component);
        pending.push(neighborKey);
      }
    }
    component += 1;
  }
  pruneOldestScope(cache.componentsByScope);
  cache.componentsByScope.set(context.scopeKey, components);
  return components;
}

function resolveNavigationContext(
  map: BattlefieldMap,
  context: NavigationContext | undefined,
): ResolvedNavigationContext {
  const revision = context?.revision ?? map.navigationRevision;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("navigation revision must be a non-negative safe integer");
  }
  const blockedKeys = context?.blockedKeys && context.blockedKeys.size > 0
    ? context.blockedKeys
    : null;
  const movementMode = context?.movementMode ?? "ground";
  if (movementMode.trim().length === 0) {
    throw new RangeError("navigation movement mode must be non-empty");
  }
  const blockerScope = blockedKeys ? blockerSetId(blockedKeys) : 0;
  return {
    revision,
    blockedKeys,
    movementMode,
    scopeKey: JSON.stringify([revision, blockerScope, movementMode]),
  };
}

function blockerSetId(blockedKeys: ReadonlySet<string>): number {
  const key = blockedKeys as object;
  const cached = blockerSetIds.get(key);
  if (cached !== undefined) return cached;
  const id = nextBlockerSetId;
  nextBlockerSetId += 1;
  blockerSetIds.set(key, id);
  return id;
}

function navigationMapCacheFor(map: BattlefieldMap): NavigationMapCache {
  const cached = navigationCaches.get(map);
  if (cached) return cached;
  const created: NavigationMapCache = {
    pathsByScope: new Map(),
    componentsByScope: new Map(),
    pathHits: 0,
    pathMisses: 0,
  };
  navigationCaches.set(map, created);
  return created;
}

function pruneOldestScope<T>(scopes: Map<string, T>): void {
  if (scopes.size < MAX_CACHED_SCOPES_PER_MAP) return;
  const oldestKey = scopes.keys().next().value as string | undefined;
  if (oldestKey !== undefined) scopes.delete(oldestKey);
}

function deduplicatePoints(points: readonly WorldPoint[]): WorldPoint[] {
  return points.filter((point, index) => (
    index === 0
    || Math.hypot(point.x - points[index - 1]!.x, point.z - points[index - 1]!.z) > 0.01
  ));
}

class BinaryMinHeap<T> {
  private readonly values: T[] = [];

  public constructor(private readonly compare: (first: T, second: T) => number) {}

  public get size(): number {
    return this.values.length;
  }

  public push(value: T): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[index]!, this.values[parent]!) >= 0) break;
      [this.values[index], this.values[parent]] = [this.values[parent]!, this.values[index]!];
      index = parent;
    }
  }

  public pop(): T | undefined {
    if (this.values.length === 0) return undefined;
    const root = this.values[0]!;
    const tail = this.values.pop()!;
    if (this.values.length === 0) return root;
    this.values[0] = tail;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.values.length
        && this.compare(this.values[left]!, this.values[smallest]!) < 0
      ) smallest = left;
      if (
        right < this.values.length
        && this.compare(this.values[right]!, this.values[smallest]!) < 0
      ) smallest = right;
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [
        this.values[smallest]!,
        this.values[index]!,
      ];
      index = smallest;
    }
    return root;
  }
}
