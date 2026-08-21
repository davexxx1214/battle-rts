import type { Faction } from "../game/types";
import {
  axialToWorld,
  battlefieldWorldBounds,
  coordinateKey,
  hexDistance,
  type BattlefieldCell,
  type BattlefieldCellBuildPolicy,
  type BattlefieldMap,
  type BattlefieldStructure,
  type BattlefieldWorldBounds,
  type HexCoordinate,
} from "./battlefield";

export const SANDBOX_LARGE_BATTLEFIELD_ID = "sandbox-large-v1" as const;
export const SANDBOX_LARGE_NAVIGATION_REVISION = 3;
export const SANDBOX_LARGE_MINE_CAPACITY = 3_000;

export type BattlefieldRouteId = "center" | "west" | "east";
export type BattlefieldMineRegion =
  | "verdant-safe"
  | "near-neutral"
  | "far-neutral"
  | "crimson-safe";
export type BattlefieldBuildWing = "west" | "east";

export interface BattlefieldRouteDefinition {
  readonly id: BattlefieldRouteId;
  readonly referencePath: readonly HexCoordinate[];
  readonly cells: readonly HexCoordinate[];
}

export interface BattlefieldMinePitDefinition {
  readonly id: string;
  readonly region: BattlefieldMineRegion;
  readonly coordinate: HexCoordinate;
  readonly entrances: readonly [HexCoordinate, HexCoordinate];
  readonly capacity: number;
  readonly initialController: Faction | null;
  readonly protectionRadius: number;
}

export interface BattlefieldMineDistrictDefinition {
  readonly pitId: string;
  readonly wing: BattlefieldBuildWing;
  readonly cells: readonly HexCoordinate[];
}

export interface BattlefieldBuildAnchor {
  readonly coordinate: HexCoordinate;
  readonly wing: BattlefieldBuildWing;
}

export interface BattlefieldGateDefinition {
  readonly cells: readonly [HexCoordinate, HexCoordinate];
  readonly approach: HexCoordinate;
}

export interface BattlefieldZoneDefinition {
  readonly id: string;
  readonly territory: Faction | null;
  readonly defaultBuildPolicy: BattlefieldCellBuildPolicy;
  readonly cells: readonly HexCoordinate[];
}

export interface SandboxLargeFingerprintSource {
  readonly id: string;
  readonly navigationRevision: number;
  readonly map: BattlefieldMap;
  readonly worldBounds: BattlefieldWorldBounds;
  readonly castles: Readonly<Record<Faction, HexCoordinate>>;
  readonly gates: Readonly<Record<Faction, BattlefieldGateDefinition>>;
  readonly rallyPoints: Readonly<Record<Faction, HexCoordinate>>;
  readonly spawns: Readonly<Record<Faction, HexCoordinate>>;
  readonly roadNetworkCells: readonly HexCoordinate[];
  readonly roadReserve: readonly HexCoordinate[];
  readonly routes: readonly BattlefieldRouteDefinition[];
  readonly minePits: readonly BattlefieldMinePitDefinition[];
  readonly buildAnchors: Readonly<Record<Faction, readonly BattlefieldBuildAnchor[]>>;
  readonly zones: readonly BattlefieldZoneDefinition[];
  readonly battleStructures: readonly BattlefieldStructure[];
}

export const SANDBOX_LARGE_CASTLES: Readonly<Record<Faction, HexCoordinate>> =
  freezeFactionCoordinates({
    verdant: { q: -8, r: 16 },
    crimson: { q: 8, r: -16 },
  });

export const SANDBOX_LARGE_GATES: Readonly<Record<Faction, BattlefieldGateDefinition>> =
  Object.freeze({
    verdant: Object.freeze({
      cells: freezeCoordinatePair({ q: -8, r: 15 }, { q: -7, r: 15 }),
      approach: freezeCoordinate({ q: -7, r: 14 }),
    }),
    crimson: Object.freeze({
      cells: freezeCoordinatePair({ q: 8, r: -15 }, { q: 7, r: -15 }),
      approach: freezeCoordinate({ q: 7, r: -14 }),
    }),
  });

export const SANDBOX_LARGE_RALLY_POINTS: Readonly<Record<Faction, HexCoordinate>> =
  freezeFactionCoordinates({
    verdant: SANDBOX_LARGE_GATES.verdant.approach,
    crimson: SANDBOX_LARGE_GATES.crimson.approach,
  });

export const SANDBOX_LARGE_SPAWNS: Readonly<Record<Faction, HexCoordinate>> =
  freezeFactionCoordinates({
    verdant: SANDBOX_LARGE_RALLY_POINTS.verdant,
    crimson: SANDBOX_LARGE_RALLY_POINTS.crimson,
  });

export const SANDBOX_LARGE_MINE_PITS: readonly BattlefieldMinePitDefinition[] =
  Object.freeze([
    minePit(
      "P-W",
      "verdant-safe",
      { q: -13, r: 10 },
      [{ q: -12, r: 10 }, { q: -12, r: 9 }],
      "verdant",
    ),
    minePit(
      "P-E",
      "verdant-safe",
      { q: 3, r: 10 },
      [{ q: 2, r: 10 }, { q: 3, r: 9 }],
      "verdant",
    ),
    minePit(
      "N-NW",
      "near-neutral",
      { q: -11, r: 4 },
      [{ q: -10, r: 4 }, { q: -11, r: 5 }],
      null,
    ),
    minePit(
      "N-NE",
      "near-neutral",
      { q: 7, r: 4 },
      [{ q: 6, r: 4 }, { q: 6, r: 5 }],
      null,
    ),
    minePit(
      "N-SW",
      "far-neutral",
      { q: -7, r: -4 },
      [{ q: -6, r: -4 }, { q: -6, r: -5 }],
      null,
    ),
    minePit(
      "N-SE",
      "far-neutral",
      { q: 11, r: -4 },
      [{ q: 10, r: -4 }, { q: 11, r: -5 }],
      null,
    ),
    minePit(
      "E-W",
      "crimson-safe",
      { q: -3, r: -10 },
      [{ q: -2, r: -10 }, { q: -3, r: -9 }],
      "crimson",
    ),
    minePit(
      "E-E",
      "crimson-safe",
      { q: 13, r: -10 },
      [{ q: 12, r: -10 }, { q: 12, r: -9 }],
      "crimson",
    ),
  ]);

const SANDBOX_LARGE_COORDINATES = generateSandboxLargeCoordinates();
const SANDBOX_LARGE_ROAD_RESERVE_KEYS = new Set(
  SANDBOX_LARGE_COORDINATES.filter(isRoadReserveCell).map(coordinateKey),
);

export const SANDBOX_LARGE_ROAD_NETWORK_CELLS: readonly HexCoordinate[] =
  freezeCoordinates(SANDBOX_LARGE_COORDINATES.filter(isRoadNetworkCell));

export const SANDBOX_LARGE_ROAD_RESERVE: readonly HexCoordinate[] =
  freezeCoordinates(SANDBOX_LARGE_COORDINATES.filter(isRoadReserveCell));

export const SANDBOX_LARGE_MINE_DISTRICTS: readonly BattlefieldMineDistrictDefinition[] =
  createSandboxLargeMineDistricts();
const SANDBOX_LARGE_MINE_DISTRICT_KEYS = new Set(
  SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => district.cells.map(coordinateKey)),
);

const VERDANT_BUILD_ANCHORS = createVerdantBuildAnchors();
const CRIMSON_BUILD_ANCHORS = VERDANT_BUILD_ANCHORS.map((anchor) => Object.freeze({
  coordinate: freezeCoordinate(mirrorCoordinate(anchor.coordinate)),
  wing: mirrorBuildWing(anchor.wing),
}));

export const SANDBOX_LARGE_BUILD_ANCHORS: Readonly<
  Record<Faction, readonly BattlefieldBuildAnchor[]>
> = Object.freeze({
  verdant: Object.freeze(VERDANT_BUILD_ANCHORS),
  crimson: Object.freeze(CRIMSON_BUILD_ANCHORS),
});

const ROUTE_WAYPOINTS: Readonly<Record<BattlefieldRouteId, readonly HexCoordinate[]>> =
  Object.freeze({
    center: freezeCoordinates([
      { q: -8, r: 15 },
      { q: -7, r: 14 },
      { q: -5, r: 10 },
      { q: 5, r: -10 },
      { q: 7, r: -14 },
      { q: 7, r: -15 },
    ]),
    west: freezeCoordinates([
      { q: -8, r: 15 },
      { q: -7, r: 14 },
      { q: -11, r: 10 },
      { q: -1, r: -10 },
      { q: 7, r: -14 },
      { q: 7, r: -15 },
    ]),
    east: freezeCoordinates([
      { q: -7, r: 15 },
      { q: -7, r: 14 },
      { q: 1, r: 10 },
      { q: 11, r: -10 },
      { q: 7, r: -14 },
      { q: 8, r: -15 },
    ]),
  });

export const SANDBOX_LARGE_ROUTES: readonly BattlefieldRouteDefinition[] =
  Object.freeze(([
    "center",
    "west",
    "east",
  ] as const).map((id) => Object.freeze({
    id,
    referencePath: freezeCoordinates(pathThroughWaypoints(ROUTE_WAYPOINTS[id])),
    cells: freezeCoordinates(SANDBOX_LARGE_ROAD_NETWORK_CELLS.filter((coordinate) => (
      routeAssignmentFor(coordinate) === id
    ))),
  })));

export const SANDBOX_LARGE_VISUAL_ROAD_CELLS: readonly HexCoordinate[] =
  createSandboxLargeVisualRoadCells();
const SANDBOX_LARGE_VISUAL_ROAD_KEYS = new Set(
  SANDBOX_LARGE_VISUAL_ROAD_CELLS.map(coordinateKey),
);

export const SANDBOX_LARGE_ZONES: readonly BattlefieldZoneDefinition[] = Object.freeze([
  zone("verdant-base", "verdant", (coordinate) => coordinate.r >= 10),
  zone(
    "neutral",
    null,
    (coordinate) => coordinate.r > -10 && coordinate.r < 10,
  ),
  zone("crimson-base", "crimson", (coordinate) => coordinate.r <= -10),
]);

const SANDBOX_LARGE_ZONE_BY_CELL = new Map(
  SANDBOX_LARGE_ZONES.flatMap((definition) => (
    definition.cells.map((coordinate) => [coordinateKey(coordinate), definition] as const)
  )),
);
const SANDBOX_LARGE_MINE_PIT_KEYS = new Set(
  SANDBOX_LARGE_MINE_PITS.map((pit) => coordinateKey(pit.coordinate)),
);
const SANDBOX_LARGE_ROUTE_KEYS = new Map(
  SANDBOX_LARGE_ROUTES.map((route) => [
    route.id,
    new Set(route.cells.map(coordinateKey)),
  ] as const),
);

export const SANDBOX_LARGE_BATTLE_STRUCTURES: readonly BattlefieldStructure[] =
  Object.freeze(([
    "verdant",
    "crimson",
  ] as const).map((faction) => Object.freeze({
    id: `${faction}-castle`,
    kind: "castle" as const,
    faction,
    coordinate: SANDBOX_LARGE_CASTLES[faction],
    footprint: Object.freeze([SANDBOX_LARGE_CASTLES[faction]]),
    rotationY: faction === "verdant" ? 0 : Math.PI,
  })));

export const SANDBOX_LARGE_BATTLEFIELD_MAP: BattlefieldMap = Object.freeze({
  id: SANDBOX_LARGE_BATTLEFIELD_ID,
  navigationRevision: SANDBOX_LARGE_NAVIGATION_REVISION,
  cells: Object.freeze(SANDBOX_LARGE_COORDINATES.map(createSandboxLargeCell)),
  verdantCamp: SANDBOX_LARGE_RALLY_POINTS.verdant,
  crimsonCamp: SANDBOX_LARGE_RALLY_POINTS.crimson,
  center: freezeCoordinate({ q: 0, r: 0 }),
  bridges: Object.freeze([]),
  castles: SANDBOX_LARGE_CASTLES,
  castleApproaches: SANDBOX_LARGE_RALLY_POINTS,
  radius: 18,
});

export const SANDBOX_LARGE_WORLD_BOUNDS = Object.freeze(
  battlefieldWorldBounds(SANDBOX_LARGE_BATTLEFIELD_MAP),
);

export const SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT =
  createSandboxLargeBattlefieldFingerprint(sandboxLargeFingerprintSource());

export function generateSandboxLargeCoordinates(): HexCoordinate[] {
  const coordinates: HexCoordinate[] = [];
  for (let r = -18; r <= 18; r += 1) {
    for (let q = -18; q <= 18; q += 1) {
      const coordinate = { q, r };
      if (hexDistance(coordinate, { q: 0, r: 0 }) > 18) continue;
      if (Math.abs(axialToWorld(coordinate).x) > 24) continue;
      coordinates.push(coordinate);
    }
  }
  return coordinates;
}

function createSandboxLargeCell(coordinate: HexCoordinate): BattlefieldCell {
  // This is the materialization boundary: runtime systems read these fields
  // directly and must not reconstruct zones or build permissions from q/r.
  const key = coordinateKey(coordinate);
  const zoneDefinition = SANDBOX_LARGE_ZONE_BY_CELL.get(key);
  if (!zoneDefinition) throw new Error(`Sandbox cell ${key} has no explicit zone.`);
  const buildPolicy = buildPolicyAt(coordinate);
  const isMineDistrict = SANDBOX_LARGE_MINE_DISTRICT_KEYS.has(key);
  return Object.freeze({
    ...coordinate,
    height: 0,
    surface: isMineDistrict
      ? "rock"
      : zoneDefinition.territory === null ? "grass" : "camp",
    walkable: !isMineDistrict,
    territory: zoneDefinition.territory,
    buildable: buildPolicy === "ordinary",
    reservedForPath: SANDBOX_LARGE_ROAD_RESERVE_KEYS.has(key),
    zoneId: zoneDefinition.id,
    buildPolicy,
    routeTags: Object.freeze(SANDBOX_LARGE_ROUTES.flatMap((route) => (
      SANDBOX_LARGE_ROUTE_KEYS.get(route.id)?.has(key) ? [route.id] : []
    ))),
    visualRoad: SANDBOX_LARGE_VISUAL_ROAD_KEYS.has(key),
    blocker: isMineDistrict ? "terrain" : "none",
  });
}

function roadOffsetAt(r: number): number {
  const absoluteR = Math.abs(r);
  if (absoluteR <= 10) return 12;
  return 42 - 3 * absoluteR;
}

function isMainRouteCell(coordinate: HexCoordinate): boolean {
  if (Math.abs(coordinate.r) > 14) return false;
  const u = axialToWorld(coordinate).x;
  const offset = roadOffsetAt(coordinate.r);
  return Math.min(
    Math.abs(u),
    Math.abs(u - offset),
    Math.abs(u + offset),
  ) <= 3;
}

function isGateFrontRoadCell(coordinate: HexCoordinate): boolean {
  return Math.abs(coordinate.r) === 15
    && Math.abs(axialToWorld(coordinate).x) <= 4;
}

function isCrossRouteCell(coordinate: HexCoordinate): boolean {
  return (
    Math.abs(coordinate.r - 5) <= 1
    || Math.abs(coordinate.r + 5) <= 1
  ) && Math.abs(axialToWorld(coordinate).x) <= 17;
}

function isRoadNetworkCell(coordinate: HexCoordinate): boolean {
  return isMainRouteCell(coordinate)
    || isGateFrontRoadCell(coordinate)
    || isCrossRouteCell(coordinate);
}

function isRoadReserveCell(coordinate: HexCoordinate): boolean {
  if (isRoadNetworkCell(coordinate)) return true;
  return (
    Math.abs(coordinate.r) === 14
    || Math.abs(coordinate.r) === 15
  ) && Math.abs(axialToWorld(coordinate).x) <= 4;
}

function createVerdantBuildAnchors(): BattlefieldBuildAnchor[] {
  return SANDBOX_LARGE_COORDINATES
    .filter((coordinate) => (
      coordinate.r >= 13
      && coordinate.r <= 17
      && hexDistance(coordinate, SANDBOX_LARGE_CASTLES.verdant) <= 6
      && !SANDBOX_LARGE_ROAD_RESERVE_KEYS.has(coordinateKey(coordinate))
      && !SANDBOX_LARGE_MINE_DISTRICT_KEYS.has(coordinateKey(coordinate))
      && hexDistance(coordinate, SANDBOX_LARGE_CASTLES.verdant) > 2
      && SANDBOX_LARGE_MINE_PITS.every((pit) => (
        hexDistance(coordinate, pit.coordinate) > pit.protectionRadius
      ))
    ))
    .map((coordinate) => Object.freeze({
      coordinate: freezeCoordinate(coordinate),
      wing: axialToWorld(coordinate).x < 0 ? "west" as const : "east" as const,
    }));
}

function createSandboxLargeMineDistricts(): readonly BattlefieldMineDistrictDefinition[] {
  const safeMineOffsets = [
    { q: -2, r: 0 },
    { q: -1, r: 0 },
    { q: -2, r: 1 },
    { q: -1, r: 1 },
    { q: -2, r: 2 },
    { q: -1, r: 2 },
    { q: 0, r: 2 },
    { q: 0, r: 1 },
  ] as const;
  const neutralNorthwestOffsets = [
    { q: -2, r: 0 },
    { q: -1, r: 0 },
    { q: -2, r: -1 },
    { q: -1, r: -1 },
    { q: -2, r: -2 },
    { q: -1, r: -2 },
    { q: 0, r: -2 },
    { q: 0, r: -1 },
  ] as const;
  const definitions = [
    ["P-W", "west", safeMineOffsets, (offset: HexCoordinate) => offset],
    ["P-E", "east", safeMineOffsets, horizontalMirrorOffset],
    ["N-NW", "west", neutralNorthwestOffsets, (offset: HexCoordinate) => offset],
    ["N-NE", "east", neutralNorthwestOffsets, horizontalMirrorOffset],
    [
      "N-SW",
      "west",
      neutralNorthwestOffsets,
      (offset: HexCoordinate) => invertOffset(horizontalMirrorOffset(offset)),
    ],
    ["N-SE", "east", neutralNorthwestOffsets, invertOffset],
    [
      "E-W",
      "west",
      safeMineOffsets,
      (offset: HexCoordinate) => invertOffset(horizontalMirrorOffset(offset)),
    ],
    ["E-E", "east", safeMineOffsets, invertOffset],
  ] as const;
  const coordinateKeys = new Set(SANDBOX_LARGE_COORDINATES.map(coordinateKey));

  return Object.freeze(definitions.map(([pitId, wing, offsets, transform]) => {
    const pit = SANDBOX_LARGE_MINE_PITS.find((candidate) => candidate.id === pitId);
    if (!pit) throw new Error(`Missing sandbox mine pit ${pitId}.`);
    const cells = offsets.map((offset) => {
      const transformed = transform(offset);
      return { q: pit.coordinate.q + transformed.q, r: pit.coordinate.r + transformed.r };
    });
    for (const cell of cells) {
      const key = coordinateKey(cell);
      if (!coordinateKeys.has(key)) {
        throw new Error(`Sandbox mine district ${pitId} leaves the battlefield at ${key}.`);
      }
      if (SANDBOX_LARGE_ROAD_RESERVE_KEYS.has(key)) {
        throw new Error(`Sandbox mine district ${pitId} blocks reserved road ${key}.`);
      }
    }
    return Object.freeze({
      pitId,
      wing,
      cells: freezeCoordinates(cells),
    });
  }));
}

function horizontalMirrorOffset(offset: HexCoordinate): HexCoordinate {
  return { q: -offset.q - offset.r, r: offset.r };
}

function invertOffset(offset: HexCoordinate): HexCoordinate {
  return { q: -offset.q, r: -offset.r };
}

function buildAnchorAt(coordinate: HexCoordinate): boolean {
  const faction = SANDBOX_LARGE_ZONE_BY_CELL.get(coordinateKey(coordinate))?.territory;
  if (faction === null) return false;
  if (faction === undefined) return false;
  return SANDBOX_LARGE_BUILD_ANCHORS[faction].some((anchor) => (
    anchor.coordinate.q === coordinate.q && anchor.coordinate.r === coordinate.r
  ));
}

function buildPolicyAt(coordinate: HexCoordinate): BattlefieldCellBuildPolicy {
  if (SANDBOX_LARGE_MINE_PIT_KEYS.has(coordinateKey(coordinate))) return "mine-only";
  if (buildAnchorAt(coordinate)) return "ordinary";
  return "forbidden";
}

function routeAssignmentFor(coordinate: HexCoordinate): BattlefieldRouteId {
  if (!isRoadNetworkCell(coordinate)) {
    throw new Error(`Cannot assign non-road cell ${coordinateKey(coordinate)} to a route.`);
  }
  const u = axialToWorld(coordinate).x;
  if (Math.abs(coordinate.r) === 15) {
    if (u < -1) return "west";
    if (u > 1) return "east";
    return "center";
  }
  const offset = roadOffsetAt(coordinate.r);
  const centers: Readonly<Record<BattlefieldRouteId, number>> = {
    west: -offset,
    center: 0,
    east: offset,
  };
  const tieOrder: readonly BattlefieldRouteId[] = u < 0
    ? ["west", "center", "east"]
    : u > 0
      ? ["east", "center", "west"]
      : ["center", "west", "east"];
  return [...tieOrder].sort((first, second) => (
    Math.abs(u - centers[first]) - Math.abs(u - centers[second])
    || tieOrder.indexOf(first) - tieOrder.indexOf(second)
  ))[0]!;
}

function pathThroughWaypoints(waypoints: readonly HexCoordinate[]): HexCoordinate[] {
  return waypoints.flatMap((waypoint, index) => (
    index === 0
      ? [waypoint]
      : shortestHexSegment(waypoints[index - 1]!, waypoint).slice(1)
  ));
}

function createSandboxLargeVisualRoadCells(): readonly HexCoordinate[] {
  const candidates = [
    ...SANDBOX_LARGE_ROUTES.flatMap((route) => route.referencePath),
    ...shortestHexSegment({ q: -8, r: 4 }, { q: 4, r: 4 }),
    ...shortestHexSegment({ q: -4, r: -4 }, { q: 8, r: -4 }),
  ];
  const seen = new Set<string>();
  const cells = candidates.filter((coordinate) => {
    const key = coordinateKey(coordinate);
    if (seen.has(key)) return false;
    seen.add(key);
    if (!isRoadNetworkCell(coordinate)) {
      throw new Error(`Sandbox visual road leaves the road network at ${key}.`);
    }
    return true;
  });
  return freezeCoordinates(cells);
}

function shortestHexSegment(
  start: HexCoordinate,
  end: HexCoordinate,
): HexCoordinate[] {
  const steps = hexDistance(start, end);
  if (steps === 0) return [{ ...start }];
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return roundAxial(
      start.q + (end.q - start.q) * progress,
      start.r + (end.r - start.r) * progress,
    );
  });
}

function roundAxial(q: number, r: number): HexCoordinate {
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  let roundedS = Math.round(s);
  const qDifference = Math.abs(roundedQ - q);
  const rDifference = Math.abs(roundedR - r);
  const sDifference = Math.abs(roundedS - s);

  if (qDifference > rDifference && qDifference > sDifference) {
    roundedQ = -roundedR - roundedS;
  } else if (rDifference > sDifference) {
    roundedR = -roundedQ - roundedS;
  } else {
    roundedS = -roundedQ - roundedR;
  }
  void roundedS;
  return { q: roundedQ, r: roundedR };
}

function minePit(
  id: string,
  region: BattlefieldMineRegion,
  coordinate: HexCoordinate,
  entrances: readonly [HexCoordinate, HexCoordinate],
  initialController: Faction | null,
): BattlefieldMinePitDefinition {
  return Object.freeze({
    id,
    region,
    coordinate: freezeCoordinate(coordinate),
    entrances: freezeCoordinatePair(entrances[0], entrances[1]),
    capacity: SANDBOX_LARGE_MINE_CAPACITY,
    initialController,
    protectionRadius: 1,
  });
}

function zone(
  id: string,
  territory: Faction | null,
  includes: (coordinate: HexCoordinate) => boolean,
): BattlefieldZoneDefinition {
  return Object.freeze({
    id,
    territory,
    defaultBuildPolicy: "forbidden",
    cells: freezeCoordinates(SANDBOX_LARGE_COORDINATES.filter(includes)),
  });
}

function mirrorCoordinate(coordinate: HexCoordinate): HexCoordinate {
  return { q: -coordinate.q, r: -coordinate.r };
}

function mirrorBuildWing(wing: BattlefieldBuildWing): BattlefieldBuildWing {
  return wing === "west" ? "east" : "west";
}

function freezeCoordinate(coordinate: HexCoordinate): HexCoordinate {
  return Object.freeze({ q: coordinate.q, r: coordinate.r });
}

function freezeCoordinates(coordinates: readonly HexCoordinate[]): readonly HexCoordinate[] {
  return Object.freeze(coordinates.map(freezeCoordinate));
}

function freezeCoordinatePair(
  first: HexCoordinate,
  second: HexCoordinate,
): readonly [HexCoordinate, HexCoordinate] {
  return Object.freeze([
    freezeCoordinate(first),
    freezeCoordinate(second),
  ]) as readonly [HexCoordinate, HexCoordinate];
}

function freezeFactionCoordinates(
  coordinates: Readonly<Record<Faction, HexCoordinate>>,
): Readonly<Record<Faction, HexCoordinate>> {
  return Object.freeze({
    verdant: freezeCoordinate(coordinates.verdant),
    crimson: freezeCoordinate(coordinates.crimson),
  });
}

export function sandboxLargeFingerprintSource(): SandboxLargeFingerprintSource {
  return {
    id: SANDBOX_LARGE_BATTLEFIELD_ID,
    navigationRevision: SANDBOX_LARGE_NAVIGATION_REVISION,
    map: SANDBOX_LARGE_BATTLEFIELD_MAP,
    worldBounds: SANDBOX_LARGE_WORLD_BOUNDS,
    castles: SANDBOX_LARGE_CASTLES,
    gates: SANDBOX_LARGE_GATES,
    rallyPoints: SANDBOX_LARGE_RALLY_POINTS,
    spawns: SANDBOX_LARGE_SPAWNS,
    roadNetworkCells: SANDBOX_LARGE_ROAD_NETWORK_CELLS,
    roadReserve: SANDBOX_LARGE_ROAD_RESERVE,
    routes: SANDBOX_LARGE_ROUTES,
    minePits: SANDBOX_LARGE_MINE_PITS,
    buildAnchors: SANDBOX_LARGE_BUILD_ANCHORS,
    zones: SANDBOX_LARGE_ZONES,
    battleStructures: SANDBOX_LARGE_BATTLE_STRUCTURES,
  };
}

export function createSandboxLargeBattlefieldFingerprint(
  source: SandboxLargeFingerprintSource,
): string {
  const factionCoordinates = (
    label: string,
    coordinates: Readonly<Record<Faction, HexCoordinate>>,
  ) => (["verdant", "crimson"] as const).map((faction) => (
    `${label}:${faction}:${coordinateKey(coordinates[faction])}`
  ));
  const parts = [
    source.id,
    `nav:${source.navigationRevision}`,
    `map:${source.map.id}:${source.map.navigationRevision}:${source.map.radius}`,
    `center:${coordinateKey(source.map.center)}`,
    `camp:verdant:${coordinateKey(source.map.verdantCamp)}`,
    `camp:crimson:${coordinateKey(source.map.crimsonCamp)}`,
    ...factionCoordinates("map-castle", source.map.castles),
    ...factionCoordinates("map-approach", source.map.castleApproaches),
    ...source.map.bridges.map((bridge) => [
      "bridge",
      bridge.id,
      coordinateKey(bridge.center),
      bridge.cells.map(coordinateKey).join("/"),
      bridge.landings.verdant.map(coordinateKey).join("/"),
      bridge.landings.crimson.map(coordinateKey).join("/"),
    ].join(":")),
    `bounds:${source.worldBounds.minX}:${source.worldBounds.maxX}:${source.worldBounds.minZ}:${source.worldBounds.maxZ}`,
    ...source.map.cells.map((cell) => [
      cell.q,
      cell.r,
      cell.height,
      cell.surface,
      cell.walkable ? 1 : 0,
      cell.territory ?? "neutral",
      cell.buildable ? 1 : 0,
      cell.reservedForPath ? 1 : 0,
      cell.zoneId,
      cell.buildPolicy,
      cell.routeTags?.join(",") ?? "",
      cell.visualRoad ? 1 : 0,
      cell.blocker,
    ].join(":")),
    ...factionCoordinates("castle", source.castles),
    ...(["verdant", "crimson"] as const).flatMap((faction) => [
      `gate:${faction}:${source.gates[faction].cells.map(coordinateKey).join("/")}:${coordinateKey(source.gates[faction].approach)}`,
      `rally:${faction}:${coordinateKey(source.rallyPoints[faction])}`,
      `spawn:${faction}:${coordinateKey(source.spawns[faction])}`,
    ]),
    `road-network:${source.roadNetworkCells.map(coordinateKey).join("/")}`,
    `road-reserve:${source.roadReserve.map(coordinateKey).join("/")}`,
    ...source.routes.map((route) => [
      "route",
      route.id,
      route.referencePath.map(coordinateKey).join("/"),
      route.cells.map(coordinateKey).join("/"),
    ].join(":")),
    ...source.minePits.map((pit) => [
      "pit",
      pit.id,
      pit.region,
      coordinateKey(pit.coordinate),
      pit.entrances.map(coordinateKey).join("/"),
      pit.capacity,
      pit.initialController ?? "neutral",
      pit.protectionRadius,
    ].join(":")),
    ...(["verdant", "crimson"] as const).flatMap((faction) => (
      source.buildAnchors[faction].map((anchor) => [
        "anchor",
        faction,
        coordinateKey(anchor.coordinate),
        anchor.wing,
      ].join(":"))
    )),
    ...source.zones.map((definition) => [
      "zone",
      definition.id,
      definition.territory ?? "neutral",
      definition.defaultBuildPolicy,
      definition.cells.map(coordinateKey).join("/"),
    ].join(":")),
    ...source.battleStructures.map((structure) => [
      "structure",
      structure.id,
      structure.kind,
      structure.faction,
      coordinateKey(structure.coordinate),
      structure.footprint.map(coordinateKey).join("/"),
      structure.rotationY,
    ].join(":")),
  ];
  let hash = 0x811c9dc5;
  for (const codeUnit of parts.join("|").split("")) {
    hash ^= codeUnit.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}
