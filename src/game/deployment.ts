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

export interface BuildingPlacementUnit {
  readonly position: WorldPoint;
  readonly health: number;
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
  units: readonly BuildingPlacementUnit[],
): BuildingPlacementResult {
  if (!hasBuildableHex(map, request.faction, occupancy, units)) {
    return { ok: false, reason: "no-buildable-hex", occupancy };
  }
  const coordinate = resolveWorldHex(map, request.worldPosition);
  if (!coordinate) return { ok: false, reason: "outside-battlefield", occupancy };
  if (Object.values(occupancy).some(({ buildingId }) => buildingId === request.buildingId)) {
    return { ok: false, reason: "duplicate-building-id", occupancy };
  }
  const failure = validateCoordinate(
    map,
    request.faction,
    coordinate,
    occupancy,
    occupiedUnitKeys(units),
  );
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
  units: readonly BuildingPlacementUnit[],
): boolean {
  const occupiedByUnits = occupiedUnitKeys(units);
  return map.cells.some((cell) => (
    cell.territory === faction
    && cell.buildable
    && validateCoordinate(map, faction, cell, occupancy, occupiedByUnits) === null
  ));
}

export function validBuildingDeploymentCoordinates(
  map: BattlefieldMap,
  faction: Faction,
  occupancy: BuildingOccupancy,
  units: readonly BuildingPlacementUnit[],
): readonly HexCoordinate[] {
  const occupiedByUnits = occupiedUnitKeys(units);
  return map.cells
    .filter((cell) => (
      validateCoordinate(map, faction, cell, occupancy, occupiedByUnits) === null
    ))
    .map(({ q, r }) => ({ q, r }));
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
  units: readonly BuildingPlacementUnit[],
): BuildingPlacementFailureReason | null {
  return validateCoordinate(map, faction, coordinate, occupancy, occupiedUnitKeys(units));
}

function validateCoordinate(
  map: BattlefieldMap,
  faction: Faction,
  coordinate: HexCoordinate,
  occupancy: BuildingOccupancy,
  occupiedByUnits: ReadonlySet<string>,
): BuildingPlacementFailureReason | null {
  const cell = getMapCell(map, coordinate);
  if (!cell) return "outside-battlefield";
  if (cell.territory !== null && cell.territory !== faction) return "enemy-territory";
  if (!cell.buildable || cell.territory !== faction) return "unbuildable-hex";
  const key = coordinateKey(coordinate);
  if (occupancy[key] || occupiedByUnits.has(key)) return "occupied-hex";
  return null;
}

function occupiedUnitKeys(units: readonly BuildingPlacementUnit[]): ReadonlySet<string> {
  return new Set(units
    .filter((unit) => (
      unit.health > 0
      && Number.isFinite(unit.position.x)
      && Number.isFinite(unit.position.z)
    ))
    .map((unit) => coordinateKey(worldToAxial(unit.position))));
}
