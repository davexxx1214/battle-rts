import type { WorldPoint } from "../../game/types";
import {
  BATTLEFIELD_HEX_CIRCUMRADIUS,
  HEX_NEIGHBOR_OFFSETS,
  axialToWorld,
  coordinateKey,
  type BattlefieldCell,
  type BattlefieldMap,
  type BattlefieldWorldBounds,
} from "../../map/battlefield";

export const BATTLEFIELD_WATER_SKIRT_HEIGHT = -0.34;
export const BATTLEFIELD_WATER_TILE_RADIUS = BATTLEFIELD_HEX_CIRCUMRADIUS;
export const BATTLEFIELD_WATER_UNDERLAY_HEIGHT = 1.5;

export interface BattlefieldWaterUnderlayPresentation {
  readonly center: WorldPoint;
  readonly topRadius: number;
  readonly bottomRadius: number;
  readonly height: number;
  readonly y: number;
}

export interface BattlefieldBoundaryPresentation {
  readonly waterCells: readonly BattlefieldCell[];
  readonly underlay: BattlefieldWaterUnderlayPresentation;
}

/**
 * Builds a single water-cell skirt from the map's real exposed edges. This is
 * deliberately independent of `map.radius`: clipped and otherwise irregular
 * battlefield definitions must not expose the empty scene below their cells.
 */
export function createBattlefieldBoundaryPresentation(
  map: BattlefieldMap,
  worldBounds: BattlefieldWorldBounds,
): BattlefieldBoundaryPresentation {
  const battlefieldKeys = new Set(map.cells.map(coordinateKey));
  const waterByKey = new Map<string, BattlefieldCell>();

  for (const cell of map.cells) {
    for (const offset of HEX_NEIGHBOR_OFFSETS) {
      const coordinate = {
        q: cell.q + offset.q,
        r: cell.r + offset.r,
      };
      const key = coordinateKey(coordinate);
      if (battlefieldKeys.has(key) || waterByKey.has(key)) continue;
      waterByKey.set(key, {
        ...coordinate,
        height: BATTLEFIELD_WATER_SKIRT_HEIGHT,
        surface: "water",
        walkable: false,
        territory: null,
        buildable: false,
        reservedForPath: false,
        buildPolicy: "forbidden",
        blocker: "terrain",
      });
    }
  }

  const waterCells = [...waterByKey.values()].sort((left, right) => (
    left.q - right.q || left.r - right.r
  ));
  const center = {
    x: (worldBounds.minX + worldBounds.maxX) / 2,
    z: (worldBounds.minZ + worldBounds.maxZ) / 2,
  };
  const farthestCellCenter = Math.max(
    0,
    ...map.cells.concat(waterCells).map((cell) => {
      const point = axialToWorld(cell);
      return Math.hypot(point.x - center.x, point.z - center.z);
    }),
  );
  const topRadius = Math.max(
    22,
    Math.ceil(farthestCellCenter + BATTLEFIELD_WATER_TILE_RADIUS),
  );

  return {
    waterCells,
    underlay: {
      center,
      topRadius,
      bottomRadius: topRadius + BATTLEFIELD_WATER_UNDERLAY_HEIGHT,
      height: BATTLEFIELD_WATER_UNDERLAY_HEIGHT,
      y: -0.95,
    },
  };
}
