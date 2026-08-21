import type { Faction, WorldPoint } from "../game/types";
import {
  BATTLEFIELD_RADIUS,
  BATTLEFIELD_BRIDGE_LAYOUTS,
  BATTLEFIELD_VERDANT_FLANK_BLACKSMITH_COORDINATE,
  BATTLEFIELD_VERDANT_MINE_COORDINATES,
  battlefieldCastleRockAt,
  battlefieldCoordinates,
  battlefieldReservedPathAt,
  battlefieldStaticObstacleAt,
  battlefieldSurfaceAt,
  type BattlefieldBridgeLayout,
  type TerrainSurface,
} from "./battlefieldLayout";

export type { TerrainSurface } from "./battlefieldLayout";

export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface BattlefieldCell extends HexCoordinate {
  readonly height: number;
  readonly surface: TerrainSurface;
  readonly walkable: boolean;
  readonly territory: Faction | null;
  readonly buildable: boolean;
  readonly reservedForPath: boolean;
  /** Explicit static metadata for definition-driven maps; legacy maps may omit it. */
  readonly zoneId?: string;
  readonly buildPolicy?: BattlefieldCellBuildPolicy;
  readonly routeTags?: readonly string[];
  /** Optional centerline hint for detailed road tile rendering. */
  readonly visualRoad?: boolean;
  readonly blocker?: BattlefieldStaticBlocker;
}

export type BattlefieldCellBuildPolicy = "ordinary" | "mine-only" | "forbidden";
export type BattlefieldStaticBlocker = "none" | "terrain" | "fixed-structure";

export interface BattlefieldMap {
  readonly id: string;
  readonly navigationRevision: number;
  readonly cells: readonly BattlefieldCell[];
  readonly verdantCamp: HexCoordinate;
  readonly crimsonCamp: HexCoordinate;
  readonly center: HexCoordinate;
  readonly bridges: readonly BattlefieldBridge[];
  readonly castles: Readonly<Record<Faction, HexCoordinate>>;
  readonly castleApproaches: Readonly<Record<Faction, HexCoordinate>>;
  readonly radius: number;
}

export type BattlefieldBridge = BattlefieldBridgeLayout;

export interface BattlefieldMapIndex {
  readonly cellByKey: ReadonlyMap<string, BattlefieldCell>;
  readonly neighborKeysByKey: ReadonlyMap<string, readonly string[]>;
  readonly maximumDistanceFromCenter: number;
}

export interface BattlefieldWorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type BattlefieldStructureKind =
  | "castle"
  | "blacksmith"
  | "barracks"
  | "arrow-tower"
  | "mine"
  | "wall-straight"
  | "wall-corner"
  | "wall-gate";

export interface BattlefieldStructure {
  readonly id: string;
  readonly kind: BattlefieldStructureKind;
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly footprint: readonly HexCoordinate[];
  readonly rotationY: number;
}

export type BattlefieldDecoration =
  | {
      readonly id: string;
      readonly kind: "mining-cart";
      readonly faction: Faction;
      readonly coordinate: HexCoordinate;
      readonly rotationY: number;
      readonly targetStructureId: string;
      readonly phase: number;
    }
  | {
      readonly id: string;
      readonly kind: "ore-pile";
      readonly faction: Faction;
      readonly coordinate: HexCoordinate;
      readonly rotationY: number;
    };

const HEIGHT_LOW = 0;
const HEIGHT_MIDDLE = 0.36;
const HEIGHT_HIGH = 0.72;
export const HEX_NEIGHBOR_OFFSETS: readonly HexCoordinate[] = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

/** Geometry shared by the axial grid and its pointy-top rendered hexagons. */
export const BATTLEFIELD_HEX_CENTER_SPACING = 2;
export const BATTLEFIELD_HEX_CIRCUMRADIUS = BATTLEFIELD_HEX_CENTER_SPACING / Math.sqrt(3);

const battlefieldMapIndexes = new WeakMap<BattlefieldMap, {
  readonly cells: readonly BattlefieldCell[];
  readonly index: BattlefieldMapIndex;
}>();

interface BattlefieldCampLayout {
  readonly camp: HexCoordinate;
  readonly castle: HexCoordinate;
  readonly castleApproach: HexCoordinate;
}

const VERDANT_CAMP_LAYOUT: BattlefieldCampLayout = {
  camp: { q: -3, r: 6 },
  castle: { q: -4, r: 9 },
  castleApproach: { q: -4, r: 8 },
};
const BATTLEFIELD_CAMP_LAYOUTS: Readonly<Record<Faction, BattlefieldCampLayout>> = {
  verdant: VERDANT_CAMP_LAYOUT,
  crimson: {
    camp: mirrorCoordinate(VERDANT_CAMP_LAYOUT.camp),
    castle: mirrorCoordinate(VERDANT_CAMP_LAYOUT.castle),
    castleApproach: mirrorCoordinate(VERDANT_CAMP_LAYOUT.castleApproach),
  },
};

export const BATTLEFIELD_STRUCTURES: readonly BattlefieldStructure[] = [
  ...createCampStructures("verdant"),
  ...createCampStructures("crimson"),
];

export const BATTLEFIELD_BATTLE_STRUCTURES: readonly BattlefieldStructure[] = (
  BATTLEFIELD_STRUCTURES.filter((structure) => (
    structure.kind === "castle" || structure.kind === "arrow-tower"
  ))
);

export const BATTLEFIELD_STATIC_STRUCTURES: readonly BattlefieldStructure[] = (
  BATTLEFIELD_STRUCTURES.filter((structure) => (
    structure.kind !== "castle" && structure.kind !== "arrow-tower"
  ))
);

export const BATTLEFIELD_DECORATIONS: readonly BattlefieldDecoration[] = [];

const STRUCTURE_FOOTPRINT_KEYS = new Set(
  BATTLEFIELD_STRUCTURES.flatMap((structure) => (
    structure.footprint.map(({ q, r }) => `${q},${r}`)
  )),
);
const PERMANENT_STRUCTURE_FOOTPRINT_KEYS = new Set(
  BATTLEFIELD_STATIC_STRUCTURES
    .concat(BATTLEFIELD_BATTLE_STRUCTURES.filter((structure) => structure.kind === "castle"))
    .flatMap((structure) => structure.footprint.map(({ q, r }) => `${q},${r}`)),
);
const CASTLE_GATE_KEYS = new Set(
  BATTLEFIELD_STRUCTURES
    .filter((structure) => structure.kind === "wall-gate")
    .map((structure) => coordinateKey(structure.coordinate)),
);

export const BATTLEFIELD_MAP: BattlefieldMap = createBattlefieldMap();
export const BATTLEFIELD_WORLD_BOUNDS: BattlefieldWorldBounds = battlefieldWorldBounds(
  BATTLEFIELD_MAP,
);

export function axialToWorld(coordinate: HexCoordinate): WorldPoint {
  return {
    x: 2 * coordinate.q + coordinate.r,
    z: Math.sqrt(3) * coordinate.r,
  };
}

export function battlefieldWorldBounds(map: BattlefieldMap): BattlefieldWorldBounds {
  if (map.cells.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return map.cells.reduce<BattlefieldWorldBounds>((bounds, cell) => {
    const point = axialToWorld(cell);
    return {
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z),
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  });
}

export function worldToAxial(point: WorldPoint): HexCoordinate {
  const fractionalR = point.z / Math.sqrt(3);
  const fractionalQ = (point.x - fractionalR) / 2;
  return roundAxial(fractionalQ, fractionalR);
}

export function coordinateKey(coordinate: HexCoordinate): string {
  return `${coordinate.q},${coordinate.r}`;
}

export function getBattlefieldCell(
  coordinate: HexCoordinate,
): BattlefieldCell | undefined {
  return getMapCell(BATTLEFIELD_MAP, coordinate);
}

export function getMapCell(
  map: BattlefieldMap,
  coordinate: HexCoordinate,
): BattlefieldCell | undefined {
  return battlefieldMapIndexFor(map).cellByKey.get(coordinateKey(coordinate));
}

/**
 * Builds immutable lookup data outside the serializable map definition. Legacy
 * maps and future grayboxes therefore gain O(1) cell access without receiving
 * mutable Map instances of their own.
 */
export function battlefieldMapIndexFor(map: BattlefieldMap): BattlefieldMapIndex {
  const cached = battlefieldMapIndexes.get(map);
  if (cached?.cells === map.cells) return cached.index;

  const cellByKey = new Map<string, BattlefieldCell>();
  for (const cell of map.cells) cellByKey.set(coordinateKey(cell), cell);

  const neighborKeysByKey = new Map<string, readonly string[]>();
  for (const cell of map.cells) {
    const neighborKeys = HEX_NEIGHBOR_OFFSETS
      .map((offset) => coordinateKey({ q: cell.q + offset.q, r: cell.r + offset.r }))
      .filter((key) => cellByKey.has(key));
    neighborKeysByKey.set(coordinateKey(cell), Object.freeze(neighborKeys));
  }

  const index: BattlefieldMapIndex = Object.freeze({
    cellByKey,
    neighborKeysByKey,
    maximumDistanceFromCenter: map.cells.reduce(
      (maximum, cell) => Math.max(maximum, hexDistance(cell, map.center)),
      0,
    ),
  });
  battlefieldMapIndexes.set(map, { cells: map.cells, index });
  return index;
}

export function terrainHeightAt(point: WorldPoint): number {
  return terrainHeightAtMap(BATTLEFIELD_MAP, point);
}

export function terrainHeightAtMap(
  map: BattlefieldMap,
  point: WorldPoint,
): number {
  return getMapCell(map, worldToAxial(point))?.height ?? HEIGHT_LOW;
}

export function hexDistance(first: HexCoordinate, second: HexCoordinate): number {
  const firstS = -first.q - first.r;
  const secondS = -second.q - second.r;
  return (
    Math.abs(first.q - second.q)
    + Math.abs(first.r - second.r)
    + Math.abs(firstS - secondS)
  ) / 2;
}

function createBattlefieldMap(): BattlefieldMap {
  const cells = battlefieldCoordinates().map(([q, r]) => createCell(q, r));
  return {
    id: "legacy-v1",
    navigationRevision: 1,
    cells,
    verdantCamp: BATTLEFIELD_CAMP_LAYOUTS.verdant.camp,
    crimsonCamp: BATTLEFIELD_CAMP_LAYOUTS.crimson.camp,
    center: { q: 0, r: 0 },
    bridges: BATTLEFIELD_BRIDGE_LAYOUTS,
    castles: {
      verdant: BATTLEFIELD_CAMP_LAYOUTS.verdant.castle,
      crimson: BATTLEFIELD_CAMP_LAYOUTS.crimson.castle,
    },
    castleApproaches: {
      verdant: BATTLEFIELD_CAMP_LAYOUTS.verdant.castleApproach,
      crimson: BATTLEFIELD_CAMP_LAYOUTS.crimson.castleApproach,
    },
    radius: BATTLEFIELD_RADIUS,
  };
}

function createCell(q: number, r: number): BattlefieldCell {
  const distance = hexDistance({ q, r }, { q: 0, r: 0 });
  const surface = battlefieldSurfaceAt(q, r);
  const height = battlefieldCastleRockAt(q, r)
    ? HEIGHT_LOW
    : surface === "water"
    ? -0.26
    : surface === "camp"
      ? HEIGHT_HIGH
      : distance <= 3
        ? HEIGHT_MIDDLE
        : distance <= 6
          ? HEIGHT_LOW
          : HEIGHT_MIDDLE;
  const walkable = surface !== "water"
    && surface !== "forest"
    && surface !== "rock"
    && !PERMANENT_STRUCTURE_FOOTPRINT_KEYS.has(coordinateKey({ q, r }))
    && !battlefieldStaticObstacleAt(q, r);
  const territory: Faction | null = r >= 2
    ? "verdant"
    : r <= -2
      ? "crimson"
      : null;
  const reservedForPath = walkable && battlefieldReservedPathAt(q, r);
  return {
    q,
    r,
    height,
    surface,
    walkable,
    territory,
    reservedForPath,
    buildable: territory !== null
      && walkable
      && surface !== "bridge"
      && !STRUCTURE_FOOTPRINT_KEYS.has(coordinateKey({ q, r }))
      && !CASTLE_GATE_KEYS.has(coordinateKey({ q, r })),
  };
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

function createCampStructures(faction: Faction): BattlefieldStructure[] {
  const layout = BATTLEFIELD_CAMP_LAYOUTS[faction];
  const mirror = faction === "verdant" ? 1 : -1;
  const facing = faction === "verdant" ? 0 : Math.PI;
  const coordinate = (q: number, r: number): HexCoordinate => ({
    q: q * mirror,
    r: r * mirror,
  });
  const structure = (
    kind: BattlefieldStructureKind,
    name: string,
    q: number,
    r: number,
    localRotation = 0,
    footprintOffsets: readonly HexCoordinate[] = [{ q: 0, r: 0 }],
  ): BattlefieldStructure => {
    const placement = coordinate(q, r);
    return {
      id: `${faction}-${name}`,
      kind,
      faction,
      coordinate: placement,
      footprint: footprintOffsets.map((offset) => coordinate(q + offset.q, r + offset.r)),
      rotationY: facing + localRotation,
    };
  };

  const supportStructures = BATTLEFIELD_VERDANT_MINE_COORDINATES.map(
    (mineCoordinate, index) => structure(
      "mine",
      index === 0 ? "mine-upper" : "mine",
      mineCoordinate.q,
      mineCoordinate.r,
    ),
  );

  return [
    {
      id: `${faction}-castle`,
      kind: "castle",
      faction,
      coordinate: layout.castle,
      footprint: [layout.castle],
      rotationY: facing,
    },
    ...supportStructures,
    structure(
      "blacksmith",
      "flank-blacksmith",
      BATTLEFIELD_VERDANT_FLANK_BLACKSMITH_COORDINATE.q,
      BATTLEFIELD_VERDANT_FLANK_BLACKSMITH_COORDINATE.r,
      Math.PI / 3,
    ),
    structure("arrow-tower", "arrow-tower-left", -4, 6),
    structure("wall-straight", "wall-left", -5, 8, Math.PI / 3),
    structure("wall-corner", "wall-left-corner", -4, 7, Math.PI),
    structure("wall-gate", "wall-front-gate", -3, 7, 0, []),
    structure("wall-corner", "wall-right-corner", -2, 7, 2 * Math.PI / 3),
    structure("wall-straight", "wall-right", -2, 8, -Math.PI / 3),
    structure("arrow-tower", "arrow-tower-right", -1, 6),
  ];
}

function mirrorCoordinate(coordinate: HexCoordinate): HexCoordinate {
  return { q: -coordinate.q, r: -coordinate.r };
}
