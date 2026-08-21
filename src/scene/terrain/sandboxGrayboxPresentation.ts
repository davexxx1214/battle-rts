import type {
  BattlefieldBuildWing,
  BattlefieldDefinition,
  BattlefieldMineRegion,
  BattlefieldRouteId,
} from "../../map/battlefieldDefinition";
import { SANDBOX_LARGE_BATTLEFIELD_ID } from "../../map/sandboxLargeBattlefield";
import {
  axialToWorld,
  coordinateKey,
  type BattlefieldCell,
  type HexCoordinate,
} from "../../map/battlefield";
import type { Faction, WorldPoint } from "../../game/types";
import type { SandboxMiningState } from "../../game/miningEconomy";
import {
  createBattlefieldBoundaryPresentation,
  type BattlefieldWaterUnderlayPresentation,
} from "./battlefieldBoundaryPresentation";

export const SANDBOX_GRAYBOX_MAP_ID = SANDBOX_LARGE_BATTLEFIELD_ID;
export const SANDBOX_GRAYBOX_HEX_ROTATION_Y = 0;

export type SandboxGrayboxRouteId = BattlefieldRouteId;

export interface SandboxGrayboxCellPresentation {
  readonly coordinate: HexCoordinate;
  readonly position: WorldPoint;
  readonly height: number;
}

export interface SandboxGrayboxRoutePresentation {
  readonly id: SandboxGrayboxRouteId;
  readonly color: string;
  readonly cells: readonly SandboxGrayboxCellPresentation[];
}

export interface SandboxGrayboxBuildZonePresentation {
  readonly faction: Faction;
  readonly color: string;
  readonly anchors: readonly (SandboxGrayboxCellPresentation & {
    readonly wing: BattlefieldBuildWing;
  })[];
}

export interface SandboxGrayboxMinePitPresentation {
  readonly id: string;
  readonly label: string;
  readonly region: BattlefieldMineRegion;
  readonly initialController: Faction | null;
  readonly marker: SandboxGrayboxCellPresentation;
  readonly entrances: readonly [
    SandboxGrayboxCellPresentation,
    SandboxGrayboxCellPresentation,
  ];
}

export interface SandboxMineControlPresentation {
  readonly id: string;
  readonly controller: Faction | null;
  readonly marker: SandboxGrayboxCellPresentation;
}

export interface SandboxGrayboxBoundaryPresentation {
  readonly waterCells: readonly SandboxGrayboxCellPresentation[];
  readonly underlay: BattlefieldWaterUnderlayPresentation;
}

export interface SandboxGrayboxPresentation {
  readonly terrainColor: string;
  readonly terrainCells: readonly SandboxGrayboxCellPresentation[];
  readonly boundary: SandboxGrayboxBoundaryPresentation;
  readonly routes: readonly SandboxGrayboxRoutePresentation[];
  readonly buildZones: readonly SandboxGrayboxBuildZonePresentation[];
  readonly minePits: readonly SandboxGrayboxMinePitPresentation[];
}

export const SANDBOX_GRAYBOX_COLORS = Object.freeze({
  terrain: "#687368",
  routes: Object.freeze({
    center: "#e5c95f",
    west: "#4aa4cc",
    east: "#a878d1",
  }),
  buildZones: Object.freeze({
    verdant: "#50c878",
    crimson: "#e56b6f",
  }),
  minePit: "#d9a83e",
  mineEntrance: "#f6f0c6",
  water: "#4b8fa4",
});

export function createSandboxGrayboxPresentation(
  definition: BattlefieldDefinition,
): SandboxGrayboxPresentation | null {
  if (definition.id !== SANDBOX_GRAYBOX_MAP_ID) return null;
  const { buildAnchors, minePits, routes } = definition;
  if (!routes || !minePits || !buildAnchors) {
    throw new Error("Sandbox graybox definition is missing presentation data.");
  }

  const cellsByKey = new Map(
    definition.map.cells.map((cell) => [coordinateKey(cell), cell] as const),
  );
  const markerFor = (coordinate: HexCoordinate) => markerForCoordinate(
    cellsByKey,
    coordinate,
  );
  const boundary = createBattlefieldBoundaryPresentation(
    definition.map,
    definition.worldBounds,
  );

  return {
    terrainColor: SANDBOX_GRAYBOX_COLORS.terrain,
    terrainCells: definition.map.cells.map(markerFor),
    boundary: {
      waterCells: boundary.waterCells.map(markerForCell),
      underlay: boundary.underlay,
    },
    routes: routes.map((route) => ({
      id: route.id,
      color: SANDBOX_GRAYBOX_COLORS.routes[route.id],
      cells: uniqueCoordinates(route.cells).map(markerFor),
    })),
    buildZones: (["verdant", "crimson"] as const).map((faction) => ({
      faction,
      color: SANDBOX_GRAYBOX_COLORS.buildZones[faction],
      anchors: buildAnchors[faction].map((anchor) => ({
        ...markerFor(anchor.coordinate),
        wing: anchor.wing,
      })),
    })),
    minePits: minePits.map((pit) => ({
      id: pit.id,
      label: pit.id,
      region: pit.region,
      initialController: pit.initialController,
      marker: markerFor(pit.coordinate),
      entrances: [markerFor(pit.entrances[0]), markerFor(pit.entrances[1])],
    })),
  };
}

/**
 * Resolves the visible pieces from the authoritative runtime controller state.
 * The static controller is retained only as a compatibility fallback for old
 * sandbox snapshots that predate runtime mining state.
 */
export function createSandboxMineControlPresentation(
  plan: SandboxGrayboxPresentation,
  mining: SandboxMiningState | null,
): readonly SandboxMineControlPresentation[] {
  return plan.minePits.map((pit) => Object.freeze({
    id: pit.id,
    controller: mining?.pitsById[pit.id]?.controller ?? pit.initialController,
    marker: pit.marker,
  }));
}

function markerForCell(cell: BattlefieldCell): SandboxGrayboxCellPresentation {
  return {
    coordinate: { q: cell.q, r: cell.r },
    position: axialToWorld(cell),
    height: cell.height,
  };
}

function markerForCoordinate(
  cellsByKey: ReadonlyMap<string, BattlefieldCell>,
  coordinate: HexCoordinate,
): SandboxGrayboxCellPresentation {
  const cell = cellsByKey.get(coordinateKey(coordinate));
  if (!cell) {
    throw new Error(
      `Sandbox graybox marker ${coordinateKey(coordinate)} is outside the battlefield.`,
    );
  }
  return {
    coordinate: { q: coordinate.q, r: coordinate.r },
    position: axialToWorld(coordinate),
    height: cell.height,
  };
}

function uniqueCoordinates(
  coordinates: readonly HexCoordinate[],
): readonly HexCoordinate[] {
  const seen = new Set<string>();
  return coordinates.filter((coordinate) => {
    const key = coordinateKey(coordinate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
