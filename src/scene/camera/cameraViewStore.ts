import type { WorldPoint } from "../../game/types";

export interface CameraViewSnapshot {
  readonly center: WorldPoint;
  readonly width: number;
  readonly height: number;
  readonly yaw: number;
}

export interface CameraViewStore {
  readonly getSnapshot: () => CameraViewSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly publish: (view: CameraViewSnapshot) => void;
}

export const DEFAULT_CAMERA_VIEW: CameraViewSnapshot = {
  center: { x: 0, z: 0 },
  width: 40,
  height: 22.5,
  yaw: 0.68,
};

export function createCameraViewStore(): CameraViewStore {
  let snapshot = DEFAULT_CAMERA_VIEW;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (view) => {
      if (cameraViewsEqual(snapshot, view)) return;
      snapshot = view;
      listeners.forEach((listener) => listener());
    },
  };
}

function cameraViewsEqual(first: CameraViewSnapshot, second: CameraViewSnapshot): boolean {
  return (
    Math.abs(first.center.x - second.center.x) < 0.01
    && Math.abs(first.center.z - second.center.z) < 0.01
    && Math.abs(first.width - second.width) < 0.01
    && Math.abs(first.height - second.height) < 0.01
    && Math.abs(first.yaw - second.yaw) < 0.01
  );
}
