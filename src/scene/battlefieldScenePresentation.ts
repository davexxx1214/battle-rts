import { axialToWorld } from "../map/battlefield";
import type { BattlefieldDefinition } from "../map/battlefieldDefinition";
import { BATTLEFIELD_WATER_TILE_RADIUS } from "./terrain/battlefieldBoundaryPresentation";

export interface BattlefieldScenePresentation {
  readonly center: Readonly<{ x: number; z: number }>;
  readonly fog: Readonly<{ near: number; far: number }>;
  readonly directionalLightPosition: readonly [x: number, y: number, z: number];
  readonly shadowCameraExtent: number;
  readonly fallbackRadius: number;
}

/** Scene-wide ranges shared by fog, lighting and the terrain loading fallback. */
export function createBattlefieldScenePresentation(
  definition: BattlefieldDefinition,
): BattlefieldScenePresentation {
  const { map, worldBounds } = definition;
  const center = {
    x: (worldBounds.minX + worldBounds.maxX) / 2,
    z: (worldBounds.minZ + worldBounds.maxZ) / 2,
  };
  const maximumCellRadius = Math.max(0, ...map.cells.map((cell) => {
    const point = axialToWorld(cell);
    return Math.hypot(point.x - center.x, point.z - center.z);
  }));
  const shadowCameraExtent = Math.max(
    20,
    roundUpToHalfUnit(maximumCellRadius + 2),
  );
  const legacyScale = shadowCameraExtent / 20;

  return {
    center,
    fog: {
      near: Math.max(34, Math.ceil(maximumCellRadius + 8)),
      far: Math.max(72, Math.ceil(maximumCellRadius * 2.5 + 20)),
    },
    directionalLightPosition: [
      center.x + 9 * legacyScale,
      18 * legacyScale,
      center.z + 7 * legacyScale,
    ],
    shadowCameraExtent,
    fallbackRadius: roundUpToHalfUnit(
      Math.max(17, maximumCellRadius + BATTLEFIELD_WATER_TILE_RADIUS),
    ),
  };
}

function roundUpToHalfUnit(value: number): number {
  return Math.ceil(value * 2) / 2;
}
