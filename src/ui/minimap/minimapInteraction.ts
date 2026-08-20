import type { WorldPoint } from "../../game/types";
import type { MinimapPoint, MinimapProjection } from "./minimapProjection";

export interface MinimapClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface MinimapClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MinimapPointerEventLike extends MinimapClientPoint {
  readonly currentTarget: {
    readonly getBoundingClientRect: () => MinimapClientRect;
  };
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}

export interface MinimapBlockEventLike {
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}

export interface MinimapPropagationEventLike {
  readonly stopPropagation: () => void;
}

export function blockMinimapEvent(event: MinimapBlockEventLike): void {
  event.preventDefault();
  event.stopPropagation();
}

export function stopMinimapPropagation(event: MinimapPropagationEventLike): void {
  event.stopPropagation();
}

export function minimapPointFromClientPoint(
  projection: MinimapProjection,
  point: MinimapClientPoint,
  rect: MinimapClientRect,
): MinimapPoint {
  if (
    !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    throw new RangeError("Minimap client bounds must have a positive finite area.");
  }
  return {
    x: ((point.clientX - rect.left) / rect.width) * projection.viewport.width,
    y: ((point.clientY - rect.top) / rect.height) * projection.viewport.height,
  };
}

export function activateMinimapPointer(
  event: MinimapPointerEventLike,
  projection: MinimapProjection,
  onCameraTargetRequest: (target: WorldPoint) => void,
): WorldPoint {
  blockMinimapEvent(event);
  const minimapPoint = minimapPointFromClientPoint(
    projection,
    event,
    event.currentTarget.getBoundingClientRect(),
  );
  const target = projection.unproject(minimapPoint);
  onCameraTargetRequest(target);
  return target;
}
