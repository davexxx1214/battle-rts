import type { WorldPoint } from "../../game/types";
import type { BattlefieldWorldBounds } from "../../map/battlefield";

export interface MinimapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MinimapViewport {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

export interface MinimapProjection {
  readonly bounds: BattlefieldWorldBounds;
  readonly viewport: MinimapViewport;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly project: (point: WorldPoint) => MinimapPoint;
  readonly unproject: (point: MinimapPoint) => WorldPoint;
}

export const SANDBOX_MINIMAP_VIEWPORT: MinimapViewport = Object.freeze({
  width: 180,
  height: 234,
  padding: 8,
});

/**
 * Fits world X/Z into the minimap without stretching it. Positive world Z is
 * intentionally positive screen Y so the verdant/player base stays at the
 * bottom and the crimson/enemy base stays at the top.
 */
export function createMinimapProjection(
  sourceBounds: BattlefieldWorldBounds,
  sourceViewport: MinimapViewport = SANDBOX_MINIMAP_VIEWPORT,
): MinimapProjection {
  const bounds = freezeBounds(sourceBounds);
  const viewport = freezeViewport(sourceViewport);
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxZ - bounds.minZ;
  const availableWidth = viewport.width - viewport.padding * 2;
  const availableHeight = viewport.height - viewport.padding * 2;
  if (
    !Number.isFinite(worldWidth)
    || !Number.isFinite(worldHeight)
    || worldWidth <= 0
    || worldHeight <= 0
  ) {
    throw new RangeError("Minimap world bounds must have a positive finite area.");
  }
  if (
    !Number.isFinite(availableWidth)
    || !Number.isFinite(availableHeight)
    || availableWidth <= 0
    || availableHeight <= 0
  ) {
    throw new RangeError("Minimap viewport padding must leave a positive finite area.");
  }

  const scale = Math.min(availableWidth / worldWidth, availableHeight / worldHeight);
  const offsetX = (viewport.width - worldWidth * scale) / 2;
  const offsetY = (viewport.height - worldHeight * scale) / 2;
  const project = (point: WorldPoint): MinimapPoint => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (point.z - bounds.minZ) * scale,
  });
  const unproject = (point: MinimapPoint): WorldPoint => ({
    x: clamp(bounds.minX + (point.x - offsetX) / scale, bounds.minX, bounds.maxX),
    z: clamp(bounds.minZ + (point.y - offsetY) / scale, bounds.minZ, bounds.maxZ),
  });

  return Object.freeze({
    bounds,
    viewport,
    scale,
    offsetX,
    offsetY,
    project,
    unproject,
  });
}

function freezeBounds(bounds: BattlefieldWorldBounds): BattlefieldWorldBounds {
  if (
    !Number.isFinite(bounds.minX)
    || !Number.isFinite(bounds.maxX)
    || !Number.isFinite(bounds.minZ)
    || !Number.isFinite(bounds.maxZ)
  ) {
    throw new RangeError("Minimap world bounds must be finite.");
  }
  return Object.freeze({ ...bounds });
}

function freezeViewport(viewport: MinimapViewport): MinimapViewport {
  if (
    !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || !Number.isFinite(viewport.padding)
    || viewport.width <= 0
    || viewport.height <= 0
    || viewport.padding < 0
  ) {
    throw new RangeError("Minimap viewport dimensions must be positive and finite.");
  }
  return Object.freeze({ ...viewport });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
