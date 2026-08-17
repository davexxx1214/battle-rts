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
  const horizontal = clamp(
    dot(target, axes.right),
    alignedBounds.minHorizontal * travel,
    alignedBounds.maxHorizontal * travel,
  );
  const vertical = clamp(
    dot(target, axes.up),
    alignedBounds.minVertical * travel,
    alignedBounds.maxVertical * travel,
  );
  return {
    x: axes.right.x * horizontal + axes.up.x * vertical,
    z: axes.right.z * horizontal + axes.up.z * vertical,
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
