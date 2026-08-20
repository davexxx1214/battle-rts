export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

export interface GroundBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface CameraGroundAxes {
  readonly right: GroundPoint;
  readonly up: GroundPoint;
}

interface CameraAlignedBounds {
  readonly minHorizontal: number;
  readonly maxHorizontal: number;
  readonly minVertical: number;
  readonly maxVertical: number;
}

export function cameraGroundAxes(yaw: number): CameraGroundAxes {
  return {
    right: { x: Math.cos(yaw), z: -Math.sin(yaw) },
    up: { x: -Math.sin(yaw), z: -Math.cos(yaw) },
  };
}

export function screenPanWorldDelta(
  deltaX: number,
  deltaY: number,
  yaw: number,
  zoom: number,
  cameraHeight: number,
  cameraGroundDistance: number,
): GroundPoint {
  if (
    !Number.isFinite(deltaX)
    || !Number.isFinite(deltaY)
    || !Number.isFinite(zoom)
    || zoom <= 0
    || !Number.isFinite(cameraHeight)
    || cameraHeight <= 0
    || !Number.isFinite(cameraGroundDistance)
  ) return { x: 0, z: 0 };

  const axes = cameraGroundAxes(yaw);
  const horizontal = -deltaX / zoom;
  const cameraDistance = Math.hypot(cameraHeight, cameraGroundDistance);
  const vertical = (deltaY / zoom) * (cameraDistance / cameraHeight);
  return {
    x: axes.right.x * horizontal + axes.up.x * vertical,
    z: axes.right.z * horizontal + axes.up.z * vertical,
  };
}

export function clampCameraTarget(
  target: GroundPoint,
  bounds: GroundBounds,
  yaw: number,
  progress: number,
): GroundPoint {
  const axes = cameraGroundAxes(yaw);
  const alignedBounds = cameraAlignedBounds(bounds, axes);
  const travel = clamp(progress, 0, 1);
  const horizontalCenter = (alignedBounds.minHorizontal + alignedBounds.maxHorizontal) / 2;
  const verticalCenter = (alignedBounds.minVertical + alignedBounds.maxVertical) / 2;
  const horizontalRadius = (alignedBounds.maxHorizontal - alignedBounds.minHorizontal) / 2;
  const verticalRadius = (alignedBounds.maxVertical - alignedBounds.minVertical) / 2;
  const horizontal = clamp(
    dot(target, axes.right),
    horizontalCenter - horizontalRadius * travel,
    horizontalCenter + horizontalRadius * travel,
  );
  const vertical = clamp(
    dot(target, axes.up),
    verticalCenter - verticalRadius * travel,
    verticalCenter + verticalRadius * travel,
  );
  const clampedTarget = {
    x: axes.right.x * horizontal + axes.up.x * vertical,
    z: axes.right.z * horizontal + axes.up.z * vertical,
  };
  return {
    x: snapFloatingBoundary(clampedTarget.x, bounds.minX, bounds.maxX),
    z: snapFloatingBoundary(clampedTarget.z, bounds.minZ, bounds.maxZ),
  };
}

/** A direct camera jump uses the active map's current zoom-dependent range. */
export function cameraCenterForWorldPoint(
  point: GroundPoint,
  bounds: GroundBounds,
  yaw: number,
  panProgress = 1,
): GroundPoint {
  const centered = clampCameraTarget(point, bounds, yaw, panProgress);
  return {
    x: clamp(centered.x, bounds.minX, bounds.maxX),
    z: clamp(centered.z, bounds.minZ, bounds.maxZ),
  };
}

function cameraAlignedBounds(
  bounds: GroundBounds,
  axes: CameraGroundAxes,
): CameraAlignedBounds {
  const corners = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.minX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
  ];
  const horizontal = corners.map((corner) => dot(corner, axes.right));
  const vertical = corners.map((corner) => dot(corner, axes.up));
  return {
    minHorizontal: Math.min(...horizontal),
    maxHorizontal: Math.max(...horizontal),
    minVertical: Math.min(...vertical),
    maxVertical: Math.max(...vertical),
  };
}

function dot(first: GroundPoint, second: GroundPoint): number {
  return first.x * second.x + first.z * second.z;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function snapFloatingBoundary(value: number, minimum: number, maximum: number): number {
  const epsilon = 1e-10;
  if (value < minimum && minimum - value <= epsilon) return minimum;
  if (value > maximum && value - maximum <= epsilon) return maximum;
  return value;
}
