import { describe, expect, it } from "vitest";

import {
  axialToWorld,
  coordinateKey,
  getMapCell,
  hexDistance,
  type HexCoordinate,
} from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT,
  SANDBOX_LARGE_BATTLEFIELD_ID,
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BATTLE_STRUCTURES,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_CASTLES,
  SANDBOX_LARGE_GATES,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_RALLY_POINTS,
  SANDBOX_LARGE_ROAD_NETWORK_CELLS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_ROUTES,
  SANDBOX_LARGE_SPAWNS,
  SANDBOX_LARGE_WORLD_BOUNDS,
  SANDBOX_LARGE_VISUAL_ROAD_CELLS,
  SANDBOX_LARGE_ZONES,
  createSandboxLargeBattlefieldFingerprint,
  generateSandboxLargeCoordinates,
  sandboxLargeFingerprintSource,
} from "../../src/map/sandboxLargeBattlefield";

const NEIGHBORS: readonly HexCoordinate[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

describe("sandbox large battlefield", () => {
  it("generates fresh deterministic coordinate data through its public pure generator", () => {
    const first = generateSandboxLargeCoordinates();
    const second = generateSandboxLargeCoordinates();

    expect(first).toHaveLength(871);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
  });

  it("generates the locked 871-cell clipped hex boundary", () => {
    const cells = SANDBOX_LARGE_BATTLEFIELD_MAP.cells;
    const keys = cells.map(coordinateKey);
    const worlds = cells.map(axialToWorld);

    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.id).toBe(SANDBOX_LARGE_BATTLEFIELD_ID);
    expect(cells).toHaveLength(871);
    expect(new Set(keys).size).toBe(871);
    expect(cells.every((cell) => hexDistance(cell, { q: 0, r: 0 }) <= 18)).toBe(true);
    expect(worlds.every((point) => Math.abs(point.x) <= 24)).toBe(true);
    expect(SANDBOX_LARGE_WORLD_BOUNDS).toEqual({
      minX: -24,
      maxX: 24,
      minZ: -18 * Math.sqrt(3),
      maxZ: 18 * Math.sqrt(3),
    });
  });

  it("keeps explicit flat terrain while eight mirrored mine ridges block navigation", () => {
    const cells = SANDBOX_LARGE_BATTLEFIELD_MAP.cells;
    const mineDistrictKeys = new Set(SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => (
      district.cells.map(coordinateKey)
    )));
    const zoneByCell = new Map(SANDBOX_LARGE_ZONES.flatMap((zone) => (
      zone.cells.map((coordinate) => [coordinateKey(coordinate), zone] as const)
    )));

    expect(cells.every((cell) => cell.height === 0)).toBe(true);
    expect(new Set(cells.map((cell) => cell.surface)))
      .toEqual(new Set(["grass", "camp", "rock"]));
    expect(SANDBOX_LARGE_MINE_DISTRICTS.map(({ pitId, wing, cells: districtCells }) => (
      [pitId, wing, districtCells.length]
    ))).toEqual([
      ["P-W", "west", 8],
      ["P-E", "east", 8],
      ["N-NW", "west", 8],
      ["N-NE", "east", 8],
      ["N-SW", "west", 8],
      ["N-SE", "east", 8],
      ["E-W", "west", 8],
      ["E-E", "east", 8],
    ]);
    expect(cells.filter((cell) => !cell.walkable).map(coordinateKey))
      .toEqual(expect.arrayContaining([...mineDistrictKeys]));
    expect(cells.filter((cell) => !cell.walkable)).toHaveLength(64);
    expect(cells.every((cell) => (
      cell.zoneId === zoneByCell.get(coordinateKey(cell))?.id
      && cell.territory === zoneByCell.get(coordinateKey(cell))?.territory
      && cell.blocker === (mineDistrictKeys.has(coordinateKey(cell)) ? "terrain" : "none")
      && Array.isArray(cell.routeTags)
    ))).toBe(true);
    expect(cells.filter((cell) => mineDistrictKeys.has(coordinateKey(cell))).every((cell) => (
      cell.surface === "rock"
      && !cell.walkable
      && !cell.buildable
      && !cell.reservedForPath
    ))).toBe(true);
    const reservedMineKeys = new Set(SANDBOX_LARGE_MINE_PITS.flatMap((pit) => [
      coordinateKey(pit.coordinate),
      ...pit.entrances.map(coordinateKey),
    ]));
    expect([...mineDistrictKeys].every((key) => !reservedMineKeys.has(key))).toBe(true);
    const districtByPit = new Map(SANDBOX_LARGE_MINE_DISTRICTS.map((district) => (
      [district.pitId, new Set(district.cells.map(coordinateKey))] as const
    )));
    for (const [first, second] of [
      ["P-W", "E-E"],
      ["P-E", "E-W"],
      ["N-NW", "N-SE"],
      ["N-NE", "N-SW"],
    ] as const) {
      expect(mirroredKeys(districtByPit.get(first)!)).toEqual(districtByPit.get(second));
    }
    expect(zoneByCell.size).toBe(871);
    expect(SANDBOX_LARGE_ZONES.map((zone) => zone.id)).toEqual([
      "verdant-base",
      "neutral",
      "crimson-base",
    ]);
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.bridges).toEqual([]);
  });

  it("materializes build policy per cell so runtime never infers it from coordinates", () => {
    const mineKeys = new Set(SANDBOX_LARGE_MINE_PITS.map((pit) => (
      coordinateKey(pit.coordinate)
    )));
    const cells = SANDBOX_LARGE_BATTLEFIELD_MAP.cells;

    expect(cells.every((cell) => cell.buildPolicy !== undefined)).toBe(true);
    expect(cells.every((cell) => (
      cell.buildable === (cell.buildPolicy === "ordinary")
    ))).toBe(true);
    expect(new Set(cells.filter((cell) => (
      cell.buildPolicy === "mine-only"
    )).map(coordinateKey))).toEqual(mineKeys);
    expect(cells.filter((cell) => cell.buildPolicy === "ordinary")).toHaveLength(68);
    expect(cells.filter((cell) => (
      cell.reservedForPath && cell.buildPolicy !== "forbidden"
    ))).toEqual([]);
  });

  it("locks the three route network at 327 cells and its apron reserve at 331", () => {
    const networkKeys = new Set(SANDBOX_LARGE_ROAD_NETWORK_CELLS.map(coordinateKey));
    const reserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));

    expect(networkKeys.size).toBe(327);
    expect(reserveKeys.size).toBe(331);
    expect([...networkKeys].every((key) => reserveKeys.has(key))).toBe(true);
    expect(SANDBOX_LARGE_ROUTES.map((route) => route.id)).toEqual([
      "center",
      "west",
      "east",
    ]);
    const routeCellKeys = SANDBOX_LARGE_ROUTES.flatMap((route) => (
      route.cells.map(coordinateKey)
    ));
    expect(routeCellKeys).toHaveLength(327);
    expect(new Set(routeCellKeys)).toEqual(networkKeys);
    for (const coordinate of SANDBOX_LARGE_ROAD_RESERVE) {
      expect(getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, coordinate)).toMatchObject({
        walkable: true,
        buildable: false,
        reservedForPath: true,
      });
    }
    expect(mirroredKeys(reserveKeys)).toEqual(reserveKeys);
  });

  it("assigns every road-network cell exactly one visible route tag", () => {
    const routeByCell = new Map(SANDBOX_LARGE_ROUTES.flatMap((route) => (
      route.cells.map((coordinate) => [coordinateKey(coordinate), route.id] as const)
    )));
    const networkKeys = new Set(SANDBOX_LARGE_ROAD_NETWORK_CELLS.map(coordinateKey));
    const reserveOnlyKeys = SANDBOX_LARGE_ROAD_RESERVE
      .map(coordinateKey)
      .filter((key) => !networkKeys.has(key));

    expect(routeByCell.size).toBe(327);
    for (const coordinate of SANDBOX_LARGE_ROAD_NETWORK_CELLS) {
      const cell = getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, coordinate)!;
      expect(cell.routeTags).toEqual([routeByCell.get(coordinateKey(coordinate))]);
    }
    expect(reserveOnlyKeys).toHaveLength(4);
    expect(reserveOnlyKeys.every((key) => (
      getMapCell(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        coordinateFromKey(key),
      )?.routeTags?.length === 0
    ))).toBe(true);
  });

  it("separates the 123-cell detailed road centerlines from the wide movement corridors", () => {
    const networkKeys = new Set(SANDBOX_LARGE_ROAD_NETWORK_CELLS.map(coordinateKey));

    expect(SANDBOX_LARGE_VISUAL_ROAD_CELLS).toHaveLength(123);
    expect(SANDBOX_LARGE_VISUAL_ROAD_CELLS.every((cell) => (
      networkKeys.has(coordinateKey(cell))
      && getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, cell)?.visualRoad === true
    ))).toBe(true);
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.cells.filter((cell) => cell.visualRoad))
      .toHaveLength(123);
  });

  it("locks the 30/38/38 route paths and 6/12-step lane changes", () => {
    expect(Object.fromEntries(SANDBOX_LARGE_ROUTES.map((route) => [
      route.id,
      route.referencePath.length - 1,
    ]))).toEqual({ center: 30, west: 38, east: 38 });

    const reserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
    for (const route of SANDBOX_LARGE_ROUTES) {
      expect(route.referencePath.every((coordinate) => reserveKeys.has(coordinateKey(coordinate))))
        .toBe(true);
      expect(route.referencePath.slice(1).every((coordinate, index) => (
        hexDistance(route.referencePath[index]!, coordinate) === 1
      ))).toBe(true);
    }

    const west = { q: -8, r: 4 };
    const center = { q: -2, r: 4 };
    const east = { q: 4, r: 4 };
    expect(hexDistance(west, center)).toBe(6);
    expect(hexDistance(center, east)).toBe(6);
    expect(hexDistance(west, east)).toBe(12);
    expect(shortestRoadDistance([west], [center])).toBe(6);
    expect(shortestRoadDistance([center], [east])).toBe(6);
    expect(shortestRoadDistance([west], [east])).toBe(12);
  });

  it("locks mirrored castles, double gates, approaches, rallies, and spawns", () => {
    expect(SANDBOX_LARGE_CASTLES).toEqual({
      verdant: { q: -8, r: 16 },
      crimson: { q: 8, r: -16 },
    });
    expect(SANDBOX_LARGE_GATES).toEqual({
      verdant: {
        cells: [{ q: -8, r: 15 }, { q: -7, r: 15 }],
        approach: { q: -7, r: 14 },
      },
      crimson: {
        cells: [{ q: 8, r: -15 }, { q: 7, r: -15 }],
        approach: { q: 7, r: -14 },
      },
    });
    expect(SANDBOX_LARGE_RALLY_POINTS).toEqual({
      verdant: { q: -7, r: 14 },
      crimson: { q: 7, r: -14 },
    });
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.verdantCamp)
      .toEqual(SANDBOX_LARGE_RALLY_POINTS.verdant);
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.crimsonCamp)
      .toEqual(SANDBOX_LARGE_RALLY_POINTS.crimson);
  });

  it("defines eight mirrored 3000-ore pits with two reserved road entrances", () => {
    const expected = [
      ["P-W", [-13, 10], [[-12, 10], [-12, 9]], "verdant-safe", "verdant"],
      ["P-E", [3, 10], [[2, 10], [3, 9]], "verdant-safe", "verdant"],
      ["N-NW", [-11, 4], [[-10, 4], [-11, 5]], "near-neutral", null],
      ["N-NE", [7, 4], [[6, 4], [6, 5]], "near-neutral", null],
      ["N-SW", [-7, -4], [[-6, -4], [-6, -5]], "far-neutral", null],
      ["N-SE", [11, -4], [[10, -4], [11, -5]], "far-neutral", null],
      ["E-W", [-3, -10], [[-2, -10], [-3, -9]], "crimson-safe", "crimson"],
      ["E-E", [13, -10], [[12, -10], [12, -9]], "crimson-safe", "crimson"],
    ];
    expect(SANDBOX_LARGE_MINE_PITS.map((pit) => [
      pit.id,
      [pit.coordinate.q, pit.coordinate.r],
      pit.entrances.map((entrance) => [entrance.q, entrance.r]),
      pit.region,
      pit.initialController,
    ])).toEqual(expected);

    const reserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
    expect(SANDBOX_LARGE_MINE_PITS.every((pit) => (
      pit.capacity === 3_000
      && pit.protectionRadius === 1
      && pit.entrances.every((entrance) => (
        hexDistance(pit.coordinate, entrance) === 1
        && reserveKeys.has(coordinateKey(entrance))
      ))
    ))).toBe(true);
    expect(new Set(SANDBOX_LARGE_MINE_PITS.flatMap((pit) => (
      pit.entrances.map(coordinateKey)
    ))).size).toBe(16);
  });

  it("locks road distances 9/13/20/25 from the player gates to mine entrances", () => {
    const playerGates = SANDBOX_LARGE_GATES.verdant.cells;
    expect(SANDBOX_LARGE_MINE_PITS.map((pit) => (
      shortestRoadDistance(playerGates, pit.entrances)
    ))).toEqual([9, 9, 13, 13, 20, 20, 25, 25]);
  });

  it("clusters 34 mirrored build anchors per faction around each castle", () => {
    const verdant = SANDBOX_LARGE_BUILD_ANCHORS.verdant;
    const crimson = SANDBOX_LARGE_BUILD_ANCHORS.crimson;
    const rowCounts = Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
      const r = 13 + index;
      return [r, verdant.filter((anchor) => anchor.coordinate.r === r).length];
    }));

    expect(verdant).toHaveLength(34);
    expect(crimson).toHaveLength(34);
    expect(rowCounts).toEqual({ 13: 4, 14: 6, 15: 8, 16: 8, 17: 8 });
    expect(verdant.filter((anchor) => anchor.wing === "west")).toHaveLength(17);
    expect(verdant.filter((anchor) => anchor.wing === "east")).toHaveLength(17);
    expect(verdant.every((anchor) => {
      const distance = hexDistance(anchor.coordinate, SANDBOX_LARGE_CASTLES.verdant);
      return distance >= 3 && distance <= 6;
    })).toBe(true);
    expect(new Set(crimson.map((anchor) => coordinateKey(anchor.coordinate))))
      .toEqual(mirroredKeys(new Set(verdant.map((anchor) => coordinateKey(anchor.coordinate)))));
    expect(SANDBOX_LARGE_BATTLEFIELD_MAP.cells.filter((cell) => cell.buildable))
      .toHaveLength(68);
    for (const anchor of [...verdant, ...crimson]) {
      expect(getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, anchor.coordinate)).toMatchObject({
        buildable: true,
        reservedForPath: false,
        walkable: true,
      });
    }
  });

  it("stays connected after removal of any one or two non-terminal road cells", () => {
    const graph = createRoadGraph();
    for (let first = 0; first < graph.removable.length; first += 1) {
      const firstCell = graph.removable[first]!;
      expect(roadTerminalsConnected(graph, firstCell)).toBe(true);
      for (let second = first + 1; second < graph.removable.length; second += 1) {
        expect(roadTerminalsConnected(
          graph,
          firstCell,
          graph.removable[second]!,
        )).toBe(true);
      }
    }
  });

  it("publishes a stable geometry fingerprint", () => {
    const source = sandboxLargeFingerprintSource();
    const changedGateSource = {
      ...source,
      gates: {
        ...source.gates,
        verdant: {
          ...source.gates.verdant,
          approach: { q: -6, r: 14 },
        },
      },
    };
    const changedRouteSource = {
      ...source,
      routes: source.routes.map((route) => (
        route.id === "center" ? { ...route, cells: route.cells.slice(1) } : route
      )),
    };

    expect(createSandboxLargeBattlefieldFingerprint(source))
      .toBe(SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT);
    expect(createSandboxLargeBattlefieldFingerprint(changedGateSource))
      .not.toBe(SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT);
    expect(createSandboxLargeBattlefieldFingerprint(changedRouteSource))
      .not.toBe(SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT);
    expect(SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT).toBe("fnv1a32:9c5df2be");
  });

  it("freezes all exported geometry metadata used by the fingerprint", () => {
    expect([
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      SANDBOX_LARGE_BATTLEFIELD_MAP.cells,
      SANDBOX_LARGE_CASTLES,
      SANDBOX_LARGE_GATES,
      SANDBOX_LARGE_RALLY_POINTS,
      SANDBOX_LARGE_SPAWNS,
      SANDBOX_LARGE_ROAD_NETWORK_CELLS,
      SANDBOX_LARGE_ROAD_RESERVE,
      SANDBOX_LARGE_ROUTES,
      SANDBOX_LARGE_MINE_PITS,
      SANDBOX_LARGE_MINE_DISTRICTS,
      SANDBOX_LARGE_BUILD_ANCHORS,
      SANDBOX_LARGE_ZONES,
      SANDBOX_LARGE_BATTLE_STRUCTURES,
      SANDBOX_LARGE_WORLD_BOUNDS,
      SANDBOX_LARGE_VISUAL_ROAD_CELLS,
    ].every(Object.isFrozen)).toBe(true);
    expect(SANDBOX_LARGE_ROUTES.every((route) => (
      Object.isFrozen(route)
      && Object.isFrozen(route.cells)
      && Object.isFrozen(route.referencePath)
    ))).toBe(true);
    expect(SANDBOX_LARGE_MINE_PITS.every((pit) => (
      Object.isFrozen(pit)
      && Object.isFrozen(pit.coordinate)
      && Object.isFrozen(pit.entrances)
    ))).toBe(true);
    expect(SANDBOX_LARGE_MINE_DISTRICTS.every((district) => (
      Object.isFrozen(district)
      && Object.isFrozen(district.cells)
      && district.cells.every(Object.isFrozen)
    ))).toBe(true);
    expect((["verdant", "crimson"] as const).every((faction) => (
      Object.isFrozen(SANDBOX_LARGE_CASTLES[faction])
      && Object.isFrozen(SANDBOX_LARGE_GATES[faction])
      && Object.isFrozen(SANDBOX_LARGE_GATES[faction].cells)
      && Object.isFrozen(SANDBOX_LARGE_GATES[faction].approach)
      && Object.isFrozen(SANDBOX_LARGE_RALLY_POINTS[faction])
      && Object.isFrozen(SANDBOX_LARGE_SPAWNS[faction])
      && Object.isFrozen(SANDBOX_LARGE_BUILD_ANCHORS[faction])
      && SANDBOX_LARGE_BUILD_ANCHORS[faction].every((anchor) => (
        Object.isFrozen(anchor) && Object.isFrozen(anchor.coordinate)
      ))
    ))).toBe(true);
    expect(SANDBOX_LARGE_ZONES.every((zone) => (
      Object.isFrozen(zone) && Object.isFrozen(zone.cells)
    ))).toBe(true);
    expect(SANDBOX_LARGE_BATTLE_STRUCTURES.every((structure) => (
      Object.isFrozen(structure) && Object.isFrozen(structure.footprint)
    ))).toBe(true);
  });
});

function shortestRoadDistance(
  starts: readonly HexCoordinate[],
  goals: readonly HexCoordinate[],
): number | null {
  const reserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
  const goalKeys = new Set(goals.map(coordinateKey));
  const pending = starts.map((coordinate) => ({ coordinate, distance: 0 }));
  const visited = new Set(starts.map(coordinateKey));
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]!;
    if (goalKeys.has(coordinateKey(current.coordinate))) return current.distance;
    for (const offset of NEIGHBORS) {
      const neighbor = {
        q: current.coordinate.q + offset.q,
        r: current.coordinate.r + offset.r,
      };
      const key = coordinateKey(neighbor);
      if (!reserveKeys.has(key) || visited.has(key)) continue;
      visited.add(key);
      pending.push({ coordinate: neighbor, distance: current.distance + 1 });
    }
  }
  return null;
}

interface RoadGraph {
  readonly neighbors: readonly (readonly number[])[];
  readonly north: readonly number[];
  readonly south: ReadonlySet<number>;
  readonly removable: readonly number[];
}

function createRoadGraph(): RoadGraph {
  const cells = SANDBOX_LARGE_ROAD_RESERVE;
  const indexByKey = new Map(cells.map((cell, index) => [coordinateKey(cell), index]));
  const neighbors = cells.map((cell) => NEIGHBORS.flatMap((offset) => {
    const index = indexByKey.get(coordinateKey({ q: cell.q + offset.q, r: cell.r + offset.r }));
    return index === undefined ? [] : [index];
  }));
  const north = cells.flatMap((cell, index) => cell.r >= 14 ? [index] : []);
  const south = new Set(cells.flatMap((cell, index) => cell.r <= -14 ? [index] : []));
  const terminals = new Set([...north, ...south]);
  const removable = cells.flatMap((_, index) => terminals.has(index) ? [] : [index]);
  return { neighbors, north, south, removable };
}

function roadTerminalsConnected(
  graph: RoadGraph,
  firstBlocked: number,
  secondBlocked = -1,
): boolean {
  const pending = [...graph.north];
  const visited = new Uint8Array(graph.neighbors.length);
  for (const index of pending) visited[index] = 1;
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor]!;
    if (graph.south.has(current)) return true;
    for (const neighbor of graph.neighbors[current]!) {
      if (
        visited[neighbor] === 1
        || neighbor === firstBlocked
        || neighbor === secondBlocked
      ) continue;
      visited[neighbor] = 1;
      pending.push(neighbor);
    }
  }
  return false;
}

function mirroredKeys(keys: ReadonlySet<string>): Set<string> {
  return new Set([...keys].map((key) => {
    const [q, r] = key.split(",").map(Number);
    return `${-q!},${-r!}`;
  }));
}

function coordinateFromKey(key: string): HexCoordinate {
  const [q, r] = key.split(",").map(Number);
  return { q: q!, r: r! };
}
