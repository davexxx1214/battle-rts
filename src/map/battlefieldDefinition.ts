import {
  BATTLEFIELD_BATTLE_STRUCTURES,
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_MAP,
  BATTLEFIELD_STATIC_STRUCTURES,
  BATTLEFIELD_STRUCTURES,
  BATTLEFIELD_WORLD_BOUNDS,
  axialToWorld,
  type BattlefieldDecoration,
  type BattlefieldMap,
  type BattlefieldStructure,
  type BattlefieldWorldBounds,
  type HexCoordinate,
} from "./battlefield";
import type { Faction } from "../game/types";
import {
  BATTLEFIELD_CLOUDS,
  type BattlefieldCloud,
} from "./battlefieldAtmosphere";
import {
  BATTLEFIELD_SCENERY,
  type BattlefieldScenery,
} from "./battlefieldScenery";
import {
  SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT,
  SANDBOX_LARGE_BATTLEFIELD_ID,
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BATTLE_STRUCTURES,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_GATES,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_RALLY_POINTS,
  SANDBOX_LARGE_ROAD_NETWORK_CELLS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_ROUTES,
  SANDBOX_LARGE_SPAWNS,
  SANDBOX_LARGE_WORLD_BOUNDS,
  SANDBOX_LARGE_ZONES,
  type BattlefieldBuildAnchor,
  type BattlefieldGateDefinition,
  type BattlefieldMinePitDefinition,
  type BattlefieldRouteDefinition,
  type BattlefieldZoneDefinition,
} from "./sandboxLargeBattlefield";

export type {
  BattlefieldBuildAnchor,
  BattlefieldBuildWing,
  BattlefieldGateDefinition,
  BattlefieldMinePitDefinition,
  BattlefieldMineRegion,
  BattlefieldRouteDefinition,
  BattlefieldRouteId,
  BattlefieldZoneDefinition,
} from "./sandboxLargeBattlefield";

export const LEGACY_BATTLEFIELD_ID = "legacy-v1" as const;

export type BattlefieldId = string;

export interface BattlefieldCameraPreset {
  readonly initialPosition: readonly [x: number, y: number, z: number];
  readonly initialTarget: Readonly<{ x: number; z: number }>;
  readonly defaultZoom: number;
  readonly maximumZoom: number;
  readonly overviewPaddingCells: number;
  readonly near: number;
  readonly far: number;
  readonly desktopYaw: number;
  readonly portraitYaw: number;
}

export interface BattlefieldDefinition {
  readonly id: BattlefieldId;
  readonly version: number;
  readonly displayName: string;
  readonly map: BattlefieldMap;
  readonly navigationRevision: number;
  readonly worldBounds: BattlefieldWorldBounds;
  readonly structures: readonly BattlefieldStructure[];
  readonly battleStructures: readonly BattlefieldStructure[];
  readonly staticStructures: readonly BattlefieldStructure[];
  readonly decorations: readonly BattlefieldDecoration[];
  readonly scenery: readonly BattlefieldScenery[];
  readonly clouds: readonly BattlefieldCloud[];
  readonly cameraPreset: BattlefieldCameraPreset;
  readonly routes?: readonly BattlefieldRouteDefinition[];
  readonly roadNetworkCells?: readonly HexCoordinate[];
  readonly roadReserve?: readonly HexCoordinate[];
  readonly minePits?: readonly BattlefieldMinePitDefinition[];
  readonly buildAnchors?: Readonly<Record<Faction, readonly BattlefieldBuildAnchor[]>>;
  readonly gates?: Readonly<Record<Faction, BattlefieldGateDefinition>>;
  readonly rallyPoints?: Readonly<Record<Faction, HexCoordinate>>;
  readonly spawns?: Readonly<Record<Faction, HexCoordinate>>;
  readonly zones?: readonly BattlefieldZoneDefinition[];
  readonly fingerprint?: string;
}

const LEGACY_VERDANT_CASTLE = axialToWorld(BATTLEFIELD_MAP.castles.verdant);

export const LEGACY_BATTLEFIELD_DEFINITION: BattlefieldDefinition = Object.freeze({
  id: LEGACY_BATTLEFIELD_ID,
  version: 1,
  displayName: "Legacy Battlefield",
  map: BATTLEFIELD_MAP,
  navigationRevision: BATTLEFIELD_MAP.navigationRevision,
  worldBounds: BATTLEFIELD_WORLD_BOUNDS,
  structures: BATTLEFIELD_STRUCTURES,
  battleStructures: BATTLEFIELD_BATTLE_STRUCTURES,
  staticStructures: BATTLEFIELD_STATIC_STRUCTURES,
  decorations: BATTLEFIELD_DECORATIONS,
  scenery: BATTLEFIELD_SCENERY,
  clouds: BATTLEFIELD_CLOUDS,
  cameraPreset: Object.freeze({
    initialPosition: [16, 18, 20] as const,
    initialTarget: Object.freeze({ x: 0, z: 0 }),
    defaultZoom: 32,
    maximumZoom: 56,
    overviewPaddingCells: 1,
    near: 0.1,
    far: 140,
    desktopYaw: 0.68,
    portraitYaw: Math.atan2(LEGACY_VERDANT_CASTLE.x, LEGACY_VERDANT_CASTLE.z),
  }),
});

const EMPTY_STRUCTURES: readonly BattlefieldStructure[] = Object.freeze([]);
const EMPTY_DECORATIONS: readonly BattlefieldDecoration[] = Object.freeze([]);
const EMPTY_SCENERY: readonly BattlefieldScenery[] = Object.freeze([]);
const EMPTY_CLOUDS: readonly BattlefieldCloud[] = Object.freeze([]);
const SANDBOX_INITIAL_TARGET = axialToWorld(SANDBOX_LARGE_RALLY_POINTS.verdant);

export const SANDBOX_LARGE_BATTLEFIELD_DEFINITION: BattlefieldDefinition = Object.freeze({
  id: SANDBOX_LARGE_BATTLEFIELD_ID,
  version: 1,
  displayName: "Sandbox Large Graybox",
  map: SANDBOX_LARGE_BATTLEFIELD_MAP,
  navigationRevision: SANDBOX_LARGE_BATTLEFIELD_MAP.navigationRevision,
  worldBounds: SANDBOX_LARGE_WORLD_BOUNDS,
  structures: SANDBOX_LARGE_BATTLE_STRUCTURES,
  battleStructures: SANDBOX_LARGE_BATTLE_STRUCTURES,
  staticStructures: EMPTY_STRUCTURES,
  decorations: EMPTY_DECORATIONS,
  scenery: EMPTY_SCENERY,
  clouds: EMPTY_CLOUDS,
  cameraPreset: Object.freeze({
    initialPosition: Object.freeze([34, 38, 49] as const),
    initialTarget: Object.freeze(SANDBOX_INITIAL_TARGET),
    defaultZoom: 32,
    maximumZoom: 56,
    overviewPaddingCells: 1,
    near: 0.1,
    far: 220,
    desktopYaw: 0.68,
    portraitYaw: 0,
  }),
  routes: SANDBOX_LARGE_ROUTES,
  roadNetworkCells: SANDBOX_LARGE_ROAD_NETWORK_CELLS,
  roadReserve: SANDBOX_LARGE_ROAD_RESERVE,
  minePits: SANDBOX_LARGE_MINE_PITS,
  buildAnchors: SANDBOX_LARGE_BUILD_ANCHORS,
  gates: SANDBOX_LARGE_GATES,
  rallyPoints: SANDBOX_LARGE_RALLY_POINTS,
  spawns: SANDBOX_LARGE_SPAWNS,
  zones: SANDBOX_LARGE_ZONES,
  fingerprint: SANDBOX_LARGE_BATTLEFIELD_FINGERPRINT,
});

export const BATTLEFIELD_DEFINITIONS: Readonly<Record<BattlefieldId, BattlefieldDefinition>> =
  Object.freeze({
    [LEGACY_BATTLEFIELD_ID]: LEGACY_BATTLEFIELD_DEFINITION,
    [SANDBOX_LARGE_BATTLEFIELD_ID]: SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
  });

export function battlefieldDefinitionFor(
  id: BattlefieldId,
): BattlefieldDefinition {
  const definition = (BATTLEFIELD_DEFINITIONS as Readonly<Record<string, BattlefieldDefinition>>)[id];
  if (!definition) throw new Error(`Unknown battlefield definition: ${id}`);
  return definition;
}
