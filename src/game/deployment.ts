import { findHexPath } from "./navigation";
import {
  DEPLOYABLE_CATEGORIES,
  type BuildingKind,
  type DeployableKind,
} from "./rules";
import type { Faction, WorldPoint } from "./types";
import {
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";

export interface OccupiedBuildingHex {
  readonly buildingId: string;
  readonly kind: BuildingKind;
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
}

export type BuildingOccupancy = Readonly<Record<string, OccupiedBuildingHex>>;
export type DeploymentCounts = Readonly<
  Record<Faction, Readonly<Record<DeployableKind, number>>>
>;

export type BuildingPlacementFailureReason =
  | "outside-battlefield"
  | "enemy-territory"
  | "unbuildable-hex"
  | "occupied-hex"
  | "duplicate-building-id"
  | "blocked-route"
  | "no-buildable-hex";

export interface BuildingPlacementRequest {
  readonly buildingId: string;
  readonly kind: BuildingKind;
  readonly faction: Faction;
  readonly worldPosition: WorldPoint;
}

export type BuildingPlacementResult =
  | {
      readonly ok: true;
      readonly coordinate: HexCoordinate;
      readonly occupancy: BuildingOccupancy;
    }
  | {
      readonly ok: false;
      readonly reason: BuildingPlacementFailureReason;
      readonly occupancy: BuildingOccupancy;
    };

export function createBuildingOccupancy(): BuildingOccupancy {
  return {};
}

export function createDeploymentCounts(): DeploymentCounts {
  const emptyFactionCounts = () => Object.fromEntries(
    Object.keys(DEPLOYABLE_CATEGORIES).map((kind) => [kind, 0]),
  ) as Record<DeployableKind, number>;
  return {
    verdant: emptyFactionCounts(),
    crimson: emptyFactionCounts(),
  };
}

export function recordSuccessfulDeployment(
  counts: DeploymentCounts,
  faction: Faction,
  kind: DeployableKind,
): DeploymentCounts {
  return {
    ...counts,
    [faction]: {
      ...counts[faction],
      [kind]: counts[faction][kind] + 1,
    },
  };
}

export function requestBuildingPlacement(
  map: BattlefieldMap,
  occupancy: BuildingOccupancy,
  request: BuildingPlacementRequest,
): BuildingPlacementResult {
  if (!hasBuildableHex(map, request.faction, occupancy)) {
    return { ok: false, reason: "no-buildable-hex", occupancy };
  }
  const coordinate = resolveWorldHex(map, request.worldPosition);
  if (!coordinate) return { ok: false, reason: "outside-battlefield", occupancy };
  if (Object.values(occupancy).some(({ buildingId }) => buildingId === request.buildingId)) {
    return { ok: false, reason: "duplicate-building-id", occupancy };
  }
  const failure = validateCoordinate(map, request.faction, coordinate, occupancy);
  if (failure) return { ok: false, reason: failure, occupancy };

  return {
    ok: true,
    coordinate,
    occupancy: {
      ...occupancy,
      [coordinateKey(coordinate)]: {
        buildingId: request.buildingId,
        kind: request.kind,
        faction: request.faction,
        coordinate,
      },
    },
  };
}

export function removeBuildingFromOccupancy(
  occupancy: BuildingOccupancy,
  buildingId: string,
): BuildingOccupancy {
  const entry = Object.entries(occupancy).find(([, building]) => (
    building.buildingId === buildingId
  ));
  if (!entry) return occupancy;
  const next = { ...occupancy };
  delete next[entry[0]];
  return next;
}

export function hasBuildableHex(
  map: BattlefieldMap,
  faction: Faction,
  occupancy: BuildingOccupancy,
): boolean {
  return map.cells.some((cell) => (
    cell.territory === faction
    && cell.buildable
    && validateCoordinate(map, faction, cell, occupancy) === null
  ));
}

export function resolveWorldHex(
  map: BattlefieldMap,
  point: WorldPoint,
): HexCoordinate | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const coordinate = worldToAxial(point);
  const cell = getMapCell(map, coordinate);
  return cell ? { q: cell.q, r: cell.r } : null;
}

export function validateBuildingCoordinate(
  map: BattlefieldMap,
  faction: Faction,
  coordinate: HexCoordinate,
  occupancy: BuildingOccupancy,
): BuildingPlacementFailureReason | null {
  return validateCoordinate(map, faction, coordinate, occupancy);
}

function validateCoordinate(
  map: BattlefieldMap,
  faction: Faction,
  coordinate: HexCoordinate,
  occupancy: BuildingOccupancy,
): BuildingPlacementFailureReason | null {
  const cell = getMapCell(map, coordinate);
  if (!cell) return "outside-battlefield";
  if (cell.territory !== null && cell.territory !== faction) return "enemy-territory";
  if (!cell.buildable || cell.territory !== faction) return "unbuildable-hex";
  if (occupancy[coordinateKey(coordinate)]) return "occupied-hex";
  if (!keepsAllAttackRoutesOpen(map, occupancy, coordinate)) return "blocked-route";
  return null;
}

function keepsAllAttackRoutesOpen(
  map: BattlefieldMap,
  occupancy: BuildingOccupancy,
  candidate: HexCoordinate,
): boolean {
  const blocked = new Set([...Object.keys(occupancy), coordinateKey(candidate)]);
  const mapWithOccupancy: BattlefieldMap = {
    ...map,
    cells: map.cells.map((cell) => (
      blocked.has(coordinateKey(cell)) ? { ...cell, walkable: false } : cell
    )),
  };
  return findHexPath(
    mapWithOccupancy,
    map.verdantCamp,
    map.castleApproaches.crimson,
  ).length > 0 && findHexPath(
    mapWithOccupancy,
    map.crimsonCamp,
    map.castleApproaches.verdant,
  ).length > 0;
}
