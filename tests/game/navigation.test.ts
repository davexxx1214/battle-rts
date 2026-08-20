import { describe, expect, it } from "vitest";

import {
  areWorldPointsConnected,
  clearNavigationCaches,
  findHexPath,
  getNavigationCacheStats,
  resolveWalkableWorldPoint,
} from "../../src/game/navigation";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  battlefieldMapIndexFor,
  coordinateKey,
  getMapCell,
  hexDistance,
  type BattlefieldCell,
  type BattlefieldMap,
  type HexCoordinate,
} from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_MAP } from "../../src/map/sandboxLargeBattlefield";

describe("navigation indexes", () => {
  it("indexes every cell once with reciprocal adjacency outside map data", () => {
    const index = battlefieldMapIndexFor(BATTLEFIELD_MAP);

    expect(index.cellByKey.size).toBe(BATTLEFIELD_MAP.cells.length);
    expect(index.neighborKeysByKey.size).toBe(BATTLEFIELD_MAP.cells.length);
    expect(BATTLEFIELD_MAP).not.toHaveProperty("cellByKey");
    expect(BATTLEFIELD_MAP).not.toHaveProperty("neighborKeysByKey");
    for (const cell of BATTLEFIELD_MAP.cells) {
      const key = coordinateKey(cell);
      expect(index.cellByKey.get(key)).toBe(cell);
      expect(getMapCell(BATTLEFIELD_MAP, cell)).toBe(cell);
      const neighbors = index.neighborKeysByKey.get(key)!;
      expect(new Set(neighbors).size).toBe(neighbors.length);
      for (const neighborKey of neighbors) {
        expect(index.cellByKey.has(neighborKey)).toBe(true);
        expect(index.neighborKeysByKey.get(neighborKey)).toContain(key);
      }
    }
  });

  it("keeps indexes isolated for different map identities with matching ids", () => {
    const openMap = lineMap("shared-id", true);
    const blockedMap = lineMap("shared-id", false);
    clearNavigationCaches(openMap);
    clearNavigationCaches(blockedMap);

    expect(findHexPath(openMap, { q: 0, r: 0 }, { q: 2, r: 0 }))
      .toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    expect(findHexPath(blockedMap, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
    expect(getNavigationCacheStats(openMap)).toMatchObject({
      pathHits: 0,
      pathMisses: 1,
      cachedPaths: 1,
    });
    expect(getNavigationCacheStats(blockedMap)).toMatchObject({
      pathHits: 0,
      pathMisses: 1,
      cachedPaths: 1,
    });

    findHexPath(openMap, { q: 0, r: 0 }, { q: 2, r: 0 });
    findHexPath(blockedMap, { q: 0, r: 0 }, { q: 2, r: 0 });
    expect(getNavigationCacheStats(openMap).pathHits).toBe(1);
    expect(getNavigationCacheStats(blockedMap).pathHits).toBe(1);
  });
});

describe("revisioned navigation", () => {
  it("reuses long routes, returns defensive copies, and misses after revision changes", () => {
    const map = lineMap("revision-map", true);
    const blockedKeys = new Set<string>(["99,99"]);
    const start = { q: 0, r: 0 };
    const goal = { q: 2, r: 0 };
    clearNavigationCaches(map);

    const first = findHexPath(map, start, goal, { revision: 1, blockedKeys });
    (first[0] as { q: number }).q = 99;
    const cached = findHexPath(map, start, goal, { revision: 1, blockedKeys });
    expect(cached).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    expect(getNavigationCacheStats(map)).toMatchObject({ pathHits: 1, pathMisses: 1 });

    blockedKeys.add("1,0");
    expect(findHexPath(map, start, goal, { revision: 2, blockedKeys })).toEqual([]);
    expect(getNavigationCacheStats(map)).toMatchObject({ pathHits: 1, pathMisses: 2 });
    expect(getMapCell(map, { q: 1, r: 0 })?.walkable).toBe(true);

    expect(areWorldPointsConnected(
      map,
      axialToWorld(start),
      axialToWorld(goal),
      { revision: 2, blockedKeys },
    )).toBe(false);
    expect(getNavigationCacheStats(map).cachedComponentIndexes).toBe(1);
  });

  it("expands by neighboring distance and keeps legacy lexical tie-breaking", () => {
    const map = testMap("nearest-map", [
      cell({ q: 0, r: 0 }, false),
      cell({ q: -1, r: 0 }),
      cell({ q: 0, r: -1 }),
    ]);

    expect(resolveWalkableWorldPoint(map, axialToWorld({ q: 0, r: 0 })))
      .toEqual(axialToWorld({ q: -1, r: 0 }));
  });

  it("isolates default ground routes from custom movement modes", () => {
    const map = lineMap("movement-mode-map", true);
    const start = { q: 0, r: 0 };
    const goal = { q: 2, r: 0 };
    clearNavigationCaches(map);

    findHexPath(map, start, goal, { revision: 1 });
    findHexPath(map, start, goal, { revision: 1, movementMode: "flying" });
    expect(getNavigationCacheStats(map)).toMatchObject({
      pathHits: 0,
      pathMisses: 2,
      cachedPaths: 2,
    });

    findHexPath(map, start, goal, { revision: 1, movementMode: "ground" });
    expect(getNavigationCacheStats(map).pathHits).toBe(1);
  });
});

describe("navigation performance", () => {
  it.each([
    ["legacy-map", BATTLEFIELD_MAP],
    ["sandbox-large-map", SANDBOX_LARGE_BATTLEFIELD_MAP],
  ] as const)("finds 1000 deterministic reachable routes on %s and records p95", (
    name,
    map,
  ) => {
    const cells = map.cells.filter((cell) => cell.walkable);
    const random = seededRandom(0x5eed);
    const pairs = Array.from({ length: 1_000 }, () => [
      cells[Math.floor(random() * cells.length)]!,
      cells[Math.floor(random() * cells.length)]!,
    ] as const);

    let warmupSuccesses = 0;
    for (const [start, goal] of pairs) {
      if (findHexPath(map, start, goal).length > 0) warmupSuccesses += 1;
    }
    expect(warmupSuccesses).toBe(pairs.length);

    let successfulRoutes = 0;
    const durations = pairs.map(([start, goal]) => {
      const measureColdRoute = () => {
        clearNavigationCaches(map);
        const startedAt = performance.now();
        const path = findHexPath(map, start, goal);
        return {
          found: path.length > 0,
          duration: performance.now() - startedAt,
        };
      };
      const first = measureColdRoute();
      const second = measureColdRoute();
      if (first.found && second.found) successfulRoutes += 1;
      return Math.min(first.duration, second.duration);
    }).sort((first, second) => first - second);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    const maximum = durations[durations.length - 1]!;

    console.info(
      `navigation ${name} best-of-two cold: ${successfulRoutes}/${pairs.length} routes, `
      + `p95 ${p95.toFixed(3)}ms, max ${maximum.toFixed(3)}ms`,
    );
    expect(successfulRoutes).toBe(pairs.length);
    expect(p95).toBeLessThanOrEqual(3);
    expect(maximum).toBeLessThanOrEqual(10);
  });
});

function lineMap(id: string, middleWalkable: boolean): BattlefieldMap {
  return testMap(id, [
    cell({ q: 0, r: 0 }),
    cell({ q: 1, r: 0 }, middleWalkable),
    cell({ q: 2, r: 0 }),
  ]);
}

function testMap(id: string, cells: readonly BattlefieldCell[]): BattlefieldMap {
  const center = { q: 0, r: 0 };
  const end = cells[cells.length - 1] ?? center;
  return {
    id,
    navigationRevision: 1,
    cells,
    verdantCamp: center,
    crimsonCamp: { q: end.q, r: end.r },
    center,
    bridges: [],
    castles: { verdant: center, crimson: { q: end.q, r: end.r } },
    castleApproaches: { verdant: center, crimson: { q: end.q, r: end.r } },
    radius: cells.reduce((maximum, entry) => Math.max(maximum, hexDistance(center, entry)), 0),
  };
}

function cell(
  coordinate: HexCoordinate,
  walkable = true,
): BattlefieldCell {
  return {
    ...coordinate,
    height: 0,
    surface: "grass",
    walkable,
    territory: null,
    buildable: false,
    reservedForPath: false,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
