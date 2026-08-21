import type { Faction, WorldPoint } from "../game/types";

export interface SceneScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type SceneBattlefieldPick =
  | {
      readonly targetType: "unit";
      readonly id: string;
      readonly squadId: string;
      readonly faction: Faction;
      readonly position: WorldPoint;
    }
  | {
      readonly targetType: "building";
      readonly id: string;
      readonly faction: Faction;
      readonly position: WorldPoint;
    };

export interface SceneInteractionBridge {
  screenToWorld: (x: number, y: number) => WorldPoint | null;
  pickBattlefieldEntity: (x: number, y: number) => SceneBattlefieldPick | null;
  squadIdsInScreenRect: (rect: SceneScreenRect, faction: Faction) => readonly string[];
  zoomBy: (deltaY: number, deltaMode?: number) => void;
  zoomByFactor: (factor: number) => void;
  panByScreenDelta: (deltaX: number, deltaY: number) => void;
  centerOn: (point: WorldPoint) => void;
}

export function createSceneInteractionBridge(): SceneInteractionBridge {
  return {
    screenToWorld: () => null,
    pickBattlefieldEntity: () => null,
    squadIdsInScreenRect: () => [],
    zoomBy: () => undefined,
    zoomByFactor: () => undefined,
    panByScreenDelta: () => undefined,
    centerOn: () => undefined,
  };
}
