import type { WorldPoint } from "../game/battle";

export interface SceneInteractionBridge {
  screenToWorld: (x: number, y: number) => WorldPoint | null;
  zoomBy: (deltaY: number) => void;
  zoomByFactor: (factor: number) => void;
  panByScreenDelta: (deltaX: number, deltaY: number) => void;
}

export function createSceneInteractionBridge(): SceneInteractionBridge {
  return {
    screenToWorld: () => null,
    zoomBy: () => undefined,
    zoomByFactor: () => undefined,
    panByScreenDelta: () => undefined,
  };
}
