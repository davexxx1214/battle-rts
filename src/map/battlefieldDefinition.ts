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
} from "./battlefield";
import {
  BATTLEFIELD_CLOUDS,
  type BattlefieldCloud,
} from "./battlefieldAtmosphere";
import {
  BATTLEFIELD_SCENERY,
  type BattlefieldScenery,
} from "./battlefieldScenery";

export const LEGACY_BATTLEFIELD_ID = "legacy-v1" as const;

export type BattlefieldId = string;

export interface BattlefieldCameraPreset {
  readonly initialPosition: readonly [x: number, y: number, z: number];
  readonly initialTarget: Readonly<{ x: number; z: number }>;
  readonly defaultZoom: number;
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
  readonly worldBounds: BattlefieldWorldBounds;
  readonly structures: readonly BattlefieldStructure[];
  readonly battleStructures: readonly BattlefieldStructure[];
  readonly staticStructures: readonly BattlefieldStructure[];
  readonly decorations: readonly BattlefieldDecoration[];
  readonly scenery: readonly BattlefieldScenery[];
  readonly clouds: readonly BattlefieldCloud[];
  readonly cameraPreset: BattlefieldCameraPreset;
}

const LEGACY_VERDANT_CASTLE = axialToWorld(BATTLEFIELD_MAP.castles.verdant);

export const LEGACY_BATTLEFIELD_DEFINITION: BattlefieldDefinition = Object.freeze({
  id: LEGACY_BATTLEFIELD_ID,
  version: 1,
  displayName: "Legacy Battlefield",
  map: BATTLEFIELD_MAP,
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
    near: 0.1,
    far: 140,
    desktopYaw: 0.68,
    portraitYaw: Math.atan2(LEGACY_VERDANT_CASTLE.x, LEGACY_VERDANT_CASTLE.z),
  }),
});

export const BATTLEFIELD_DEFINITIONS: Readonly<Record<BattlefieldId, BattlefieldDefinition>> =
  Object.freeze({
    [LEGACY_BATTLEFIELD_ID]: LEGACY_BATTLEFIELD_DEFINITION,
  });

export function battlefieldDefinitionFor(
  id: BattlefieldId,
): BattlefieldDefinition {
  const definition = (BATTLEFIELD_DEFINITIONS as Readonly<Record<string, BattlefieldDefinition>>)[id];
  if (!definition) throw new Error(`Unknown battlefield definition: ${id}`);
  return definition;
}
