import type { WorldPoint } from "../game/types";

export interface SceneInteractionBridge {
  screenToWorld: (x: number, y: number) => WorldPoint | null;
  zoomBy: (deltaY: number, deltaMode?: number) => void;
  zoomByFactor: (factor: number) => void;
  panByScreenDelta: (deltaX: number, deltaY: number) => void;
  centerOn: (point: WorldPoint) => void;
}

export function createSceneInteractionBridge(): SceneInteractionBridge {
  return {
    screenToWorld: () => null,
    zoomBy: () => undefined,
    zoomByFactor: () => undefined,
    panByScreenDelta: () => undefined,
    centerOn: () => undefined,
  };
}
