import {
  HEX_NEIGHBOR_OFFSETS,
  axialToWorld,
  coordinateKey,
  getMapCell,
  hexDistance,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import type { WorldPoint } from "./types";
import { areWorldPointsConnected } from "./navigation";

export type SandboxProductionExitFailureReason =
  | "outside-battlefield"
  | "missing-road-reserve";

export interface SandboxProductionExitFan {
  readonly buildingCoordinate: HexCoordinate;
  readonly roadTarget: HexCoordinate;
  readonly facingDirection: number;
  /** Door cell first, followed by the three outward cells on ring two. */
  readonly candidates: readonly [
    HexCoordinate,
    HexCoordinate,
    HexCoordinate,
    HexCoordinate,
  ];
}

export type CreateSandboxProductionExitFanResult =
  | {
      readonly ok: true;
      readonly fan: SandboxProductionExitFan;
    }
  | {
      readonly ok: false;
      readonly reason: SandboxProductionExitFailureReason;
    };

export type ResolveSandboxProductionExitResult =
  | {
      readonly status: "available";
      readonly coordinates: readonly HexCoordinate[];
      readonly positions: readonly WorldPoint[];
    }
  | {
      readonly status: "ready-blocked";
      readonly coordinates: readonly [];
      readonly positions: readonly [];
    };

export interface ValidateSandboxRallyPointResult {
  readonly valid: boolean;
  readonly coordinate: HexCoordinate | null;
}

/**
 * Produces a stable door + three-cell ring-two fan oriented toward the nearest
 * RoadReserve cell. The plan is static; live blockers are applied separately
 * when a completed order attempts to leave the building.
 */
export function createSandboxProductionExitFan(
  map: BattlefieldMap,
  roadReserve: readonly HexCoordinate[],
  buildingCoordinate: HexCoordinate,
): CreateSandboxProductionExitFanResult {
  if (!getMapCell(map, buildingCoordinate)) {
    return { ok: false, reason: "outside-battlefield" };
  }
  const mirrorToCanonical = getMapCell(map, buildingCoordinate)?.territory === "crimson";
  const roadTargets = roadReserve
    .filter((coordinate) => Boolean(getMapCell(map, coordinate)?.walkable))
    .map((coordinate) => canonicalCoordinate(coordinate, mirrorToCanonical));
  if (roadTargets.length === 0) {
    return { ok: false, reason: "missing-road-reserve" };
  }
  const canonicalBuilding = canonicalCoordinate(buildingCoordinate, mirrorToCanonical);

  const orientations = HEX_NEIGHBOR_OFFSETS.map((offset, direction) => {
    const door = addCoordinates(canonicalBuilding, offset);
    const roadTarget = nearestRoadTarget(door, roadTargets);
    return {
      direction,
      door,
      roadTarget,
      distance: hexDistance(door, roadTarget),
      doorOnMap: getMapCell(
        map,
        canonicalCoordinate(door, mirrorToCanonical),
      )?.walkable === true,
    };
  });
  const orientation = [...orientations].sort((first, second) => (
    Number(second.doorOnMap) - Number(first.doorOnMap)
    || first.distance - second.distance
    || first.direction - second.direction
  ))[0]!;
  const forward = HEX_NEIGHBOR_OFFSETS[orientation.direction]!;
  const left = HEX_NEIGHBOR_OFFSETS[
    (orientation.direction + HEX_NEIGHBOR_OFFSETS.length - 1)
      % HEX_NEIGHBOR_OFFSETS.length
  ]!;
  const right = HEX_NEIGHBOR_OFFSETS[
    (orientation.direction + 1) % HEX_NEIGHBOR_OFFSETS.length
  ]!;
  const canonicalCandidates = [
    cloneCoordinate(orientation.door),
    addCoordinates(orientation.door, forward),
    addCoordinates(orientation.door, left),
    addCoordinates(orientation.door, right),
  ] as const;
  const candidates = Object.freeze(canonicalCandidates.map((coordinate) => (
    Object.freeze(canonicalCoordinate(coordinate, mirrorToCanonical))
  ))) as SandboxProductionExitFan["candidates"];
  return {
    ok: true,
    fan: Object.freeze({
      buildingCoordinate: Object.freeze(cloneCoordinate(buildingCoordinate)),
      roadTarget: Object.freeze(canonicalCoordinate(
        orientation.roadTarget,
        mirrorToCanonical,
      )),
      facingDirection: mirrorToCanonical
        ? (orientation.direction + 3) % HEX_NEIGHBOR_OFFSETS.length
        : orientation.direction,
      candidates,
    }),
  };
}

/**
 * Resolves the fan against the current building/unit blockers. One open cell
 * is sufficient; multi-entity squads cycle over the available fan cells and
 * therefore never disappear merely because fewer than four cells are free.
 */
export function resolveSandboxProductionExit(
  map: BattlefieldMap,
  roadReserve: readonly HexCoordinate[],
  fan: SandboxProductionExitFan,
  blockedKeys: ReadonlySet<string>,
  entityCount: number,
): ResolveSandboxProductionExitResult {
  if (!Number.isInteger(entityCount) || entityCount <= 0) {
    throw new RangeError("entityCount must be a positive integer");
  }
  const effectiveBlockedKeys = new Set(blockedKeys);
  effectiveBlockedKeys.add(coordinateKey(fan.buildingCoordinate));
  const roadTargets = roadReserve.filter((coordinate) => (
    getMapCell(map, coordinate)?.walkable === true
    && !effectiveBlockedKeys.has(coordinateKey(coordinate))
  ));
  if (roadTargets.length === 0) return readyBlockedResult();

  const context = {
    revision: map.navigationRevision,
    blockedKeys: effectiveBlockedKeys,
    movementMode: "ground",
  } as const;
  const available = fan.candidates.filter((coordinate) => {
    const key = coordinateKey(coordinate);
    if (!getMapCell(map, coordinate)?.walkable || effectiveBlockedKeys.has(key)) return false;
    return roadTargets.some((roadTarget) => areWorldPointsConnected(
      map,
      axialToWorld(coordinate),
      axialToWorld(roadTarget),
      context,
    ));
  });
  if (available.length === 0) return readyBlockedResult();

  const coordinates = Object.freeze(Array.from(
    { length: entityCount },
    (_, index) => Object.freeze(cloneCoordinate(available[index % available.length]!)),
  ));
  return Object.freeze({
    status: "available",
    coordinates,
    positions: Object.freeze(coordinates.map((coordinate) => (
      Object.freeze(axialToWorld(coordinate))
    ))),
  });
}

export function validateSandboxRallyPoint(
  map: BattlefieldMap,
  point: WorldPoint,
): ValidateSandboxRallyPointResult {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return { valid: false, coordinate: null };
  }
  const coordinate = worldToAxial(point);
  const cell = getMapCell(map, coordinate);
  return cell?.walkable
    ? { valid: true, coordinate: cloneCoordinate(coordinate) }
    : { valid: false, coordinate: null };
}

function nearestRoadTarget(
  coordinate: HexCoordinate,
  targets: readonly HexCoordinate[],
): HexCoordinate {
  return [...targets].sort((first, second) => (
    hexDistance(coordinate, first) - hexDistance(coordinate, second)
    || coordinateKey(first).localeCompare(coordinateKey(second))
  ))[0]!;
}

function addCoordinates(
  first: HexCoordinate,
  second: HexCoordinate,
): HexCoordinate {
  return Object.freeze({ q: first.q + second.q, r: first.r + second.r });
}

function cloneCoordinate(coordinate: HexCoordinate): HexCoordinate {
  return { q: coordinate.q, r: coordinate.r };
}

function canonicalCoordinate(
  coordinate: HexCoordinate,
  mirrored: boolean,
): HexCoordinate {
  return mirrored
    ? { q: -coordinate.q || 0, r: -coordinate.r || 0 }
    : cloneCoordinate(coordinate);
}

function readyBlockedResult(): ResolveSandboxProductionExitResult {
  return Object.freeze({
    status: "ready-blocked",
    coordinates: Object.freeze([]) as readonly [],
    positions: Object.freeze([]) as readonly [],
  });
}
