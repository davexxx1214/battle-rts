import type { Faction, WorldPoint } from "../game/types";

export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}

export type TerrainSurface = "grass" | "water" | "bridge" | "forest" | "camp" | "rock";

export interface BattlefieldCell extends HexCoordinate {
  readonly height: number;
  readonly surface: TerrainSurface;
  readonly walkable: boolean;
  readonly territory: Faction | null;
  readonly buildable: boolean;
  readonly reservedForPath: boolean;
}

export interface BattlefieldMap {
  readonly cells: readonly BattlefieldCell[];
  readonly verdantCamp: HexCoordinate;
  readonly crimsonCamp: HexCoordinate;
  readonly center: HexCoordinate;
  readonly castles: Readonly<Record<Faction, HexCoordinate>>;
  readonly castleApproaches: Readonly<Record<Faction, HexCoordinate>>;
  readonly radius: number;
}

export interface BattlefieldStructure {
  readonly id: string;
  readonly kind: "siege-workshop";
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly footprint: readonly HexCoordinate[];
  readonly rotationY: number;
}

const HEX_RADIUS = 9;
const HEIGHT_LOW = 0;
const HEIGHT_MIDDLE = 0.36;
const HEIGHT_HIGH = 0.72;
const CASTLE_COORDINATES: Readonly<Record<Faction, HexCoordinate>> = {
  verdant: { q: 0, r: 7 },
  crimson: { q: 0, r: -7 },
};
const CASTLE_APPROACHES: Readonly<Record<Faction, HexCoordinate>> = {
  verdant: { q: -1, r: 8 },
  crimson: { q: 1, r: -8 },
};
const CASTLE_ROUTE_BRANCH_KEYS = new Set([
  "-3,8",
  "-2,8",
  "-1,8",
  "3,-8",
  "2,-8",
  "1,-8",
]);

export const BATTLEFIELD_STRUCTURES: readonly BattlefieldStructure[] = [
  {
    id: "verdant-siege-workshop",
    kind: "siege-workshop",
    faction: "verdant",
    coordinate: { q: 0, r: 7 },
    footprint: [{ q: 0, r: 7 }, { q: -1, r: 7 }, { q: 0, r: 6 }],
    rotationY: -Math.PI / 5,
  },
  {
    id: "crimson-siege-workshop",
    kind: "siege-workshop",
    faction: "crimson",
    coordinate: { q: 0, r: -7 },
    footprint: [{ q: 0, r: -7 }, { q: 1, r: -7 }, { q: 0, r: -6 }],
    rotationY: Math.PI - Math.PI / 5,
  },
];

const STRUCTURE_FOOTPRINT_KEYS = new Set(
  BATTLEFIELD_STRUCTURES.flatMap((structure) => (
    structure.footprint.map(({ q, r }) => `${q},${r}`)
  )),
);

export const BATTLEFIELD_MAP: BattlefieldMap = createBattlefieldMap();

export function axialToWorld(coordinate: HexCoordinate): WorldPoint {
  return {
    x: 2 * coordinate.q + coordinate.r,
    z: Math.sqrt(3) * coordinate.r,
  };
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
  return map.cells.find((cell) => cell.q === coordinate.q && cell.r === coordinate.r);
}

export function terrainHeightAt(point: WorldPoint): number {
  return getBattlefieldCell(worldToAxial(point))?.height ?? HEIGHT_LOW;
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
  const cells: BattlefieldCell[] = [];
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q += 1) {
    const minimumR = Math.max(-HEX_RADIUS, -q - HEX_RADIUS);
    const maximumR = Math.min(HEX_RADIUS, -q + HEX_RADIUS);
    for (let r = minimumR; r <= maximumR; r += 1) {
      cells.push(createCell(q, r));
    }
  }
  return {
    cells,
    verdantCamp: { q: -3, r: 7 },
    crimsonCamp: { q: 3, r: -7 },
    center: { q: 0, r: 0 },
    castles: CASTLE_COORDINATES,
    castleApproaches: CASTLE_APPROACHES,
    radius: HEX_RADIUS,
  };
}

function createCell(q: number, r: number): BattlefieldCell {
  const distance = hexDistance({ q, r }, { q: 0, r: 0 });
  const isWater = Math.abs(r) <= 1 && Math.abs(q) >= 3 && Math.abs(q) <= 7;
  const isBridge = Math.abs(r) <= 1 && Math.abs(q) <= 2;
  const isCamp = Math.abs(r) >= 6 && Math.abs(2 * q + r) <= 4;
  const isReservedRoute = Math.abs(2 * q + r) <= 1
    || CASTLE_ROUTE_BRANCH_KEYS.has(coordinateKey({ q, r }));
  const isForest = distance >= 6
    && Math.abs(q) >= 4
    && !isReservedRoute
    && positiveModulo(q * 11 + r * 7, 5) <= 1;
  const isRock = distance >= 7
    && !isCamp
    && !isReservedRoute
    && positiveModulo(q * 5 - r * 13, 11) === 0;
  const surface: TerrainSurface = isWater
    ? "water"
    : isBridge
      ? "bridge"
      : isCamp
        ? "camp"
        : isForest
          ? "forest"
          : isRock
            ? "rock"
            : "grass";
  const height = isWater
    ? -0.26
    : isCamp
      ? HEIGHT_HIGH
      : distance <= 3
        ? HEIGHT_MIDDLE
        : distance <= 6
          ? HEIGHT_LOW
          : HEIGHT_MIDDLE;
  const walkable = surface !== "water"
    && surface !== "forest"
    && surface !== "rock"
    && !STRUCTURE_FOOTPRINT_KEYS.has(coordinateKey({ q, r }));
  const territory: Faction | null = r >= 2
    ? "verdant"
    : r <= -2
      ? "crimson"
      : null;
  const reservedForPath = walkable && isReservedRoute;
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
      && !reservedForPath,
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

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
