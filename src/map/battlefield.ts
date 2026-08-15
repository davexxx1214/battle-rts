import type { Faction, WorldPoint } from "../game/types";
import { BLOCKING_SCENERY_KEYS } from "./battlefieldScenery";
import {
  BATTLEFIELD_RADIUS,
  battlefieldCoordinates,
  battlefieldSurfaceAt,
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
}

export interface BattlefieldMap {
  readonly cells: readonly BattlefieldCell[];
  readonly verdantCamp: HexCoordinate;
  readonly crimsonCamp: HexCoordinate;
  readonly center: HexCoordinate;
  readonly radius: number;
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

export const BATTLEFIELD_STRUCTURES: readonly BattlefieldStructure[] = [
  ...createCampStructures("verdant"),
  ...createCampStructures("crimson"),
];

export const BATTLEFIELD_DECORATIONS: readonly BattlefieldDecoration[] = [
  ...createCampDecorations("verdant"),
  ...createCampDecorations("crimson"),
];

const STRUCTURE_FOOTPRINT_KEYS = new Set(
  BATTLEFIELD_STRUCTURES.flatMap((structure) => (
    structure.footprint.map(({ q, r }) => `${q},${r}`)
  )),
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
  const cells = battlefieldCoordinates().map(([q, r]) => createCell(q, r));
  return {
    cells,
    verdantCamp: { q: -3, r: 6 },
    crimsonCamp: { q: 3, r: -6 },
    center: { q: 0, r: 0 },
    radius: BATTLEFIELD_RADIUS,
  };
}

function createCell(q: number, r: number): BattlefieldCell {
  const distance = hexDistance({ q, r }, { q: 0, r: 0 });
  const surface = battlefieldSurfaceAt(q, r);
  const height = surface === "water"
    ? -0.26
    : surface === "camp"
      ? HEIGHT_HIGH
      : distance <= 3
        ? HEIGHT_MIDDLE
        : distance <= 6
          ? HEIGHT_LOW
          : HEIGHT_MIDDLE;
  return {
    q,
    r,
    height,
    surface,
    walkable: surface !== "water"
      && surface !== "forest"
      && surface !== "rock"
      && !STRUCTURE_FOOTPRINT_KEYS.has(`${q},${r}`)
      && !BLOCKING_SCENERY_KEYS.has(`${q},${r}`),
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

  return [
    structure("castle", "castle", -4, 9),
    structure("blacksmith", "blacksmith", -3, 8, -0.12),
    structure("barracks", "barracks", -7, 8, 0.12),
    structure("mine", "mine", -1, 8),
    structure("arrow-tower", "arrow-tower-left", -6, 9),
    structure("wall-straight", "wall-left", -5, 8, Math.PI / 3),
    structure("wall-corner", "wall-left-corner", -4, 7, Math.PI),
    structure("wall-gate", "wall-front-gate", -3, 7, 0, []),
    structure("wall-corner", "wall-right-corner", -2, 7, 2 * Math.PI / 3),
    structure("wall-straight", "wall-right", -2, 8, -Math.PI / 3),
    structure("arrow-tower", "arrow-tower-right", -2, 9),
  ];
}

function createCampDecorations(faction: Faction): BattlefieldDecoration[] {
  const mirror = faction === "verdant" ? 1 : -1;
  const coordinate = (q: number, r: number): HexCoordinate => ({
    q: q * mirror,
    r: r * mirror,
  });
  return [
    {
      id: `${faction}-mining-cart`,
      kind: "mining-cart",
      faction,
      coordinate: coordinate(0, 7),
      rotationY: faction === "verdant" ? 0 : Math.PI,
      targetStructureId: `${faction}-mine`,
      phase: faction === "verdant" ? 0 : 0.5,
    },
    {
      id: `${faction}-ore-pile`,
      kind: "ore-pile",
      faction,
      coordinate: coordinate(-1, 7),
      rotationY: 0,
    },
  ];
}
