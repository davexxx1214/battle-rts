interface ClosestTarget {
  closest?: (selector: string) => unknown;
}

export interface FieldPoint {
  readonly x: number;
  readonly y: number;
}

interface FieldBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface FieldSize {
  readonly width: number;
  readonly height: number;
}

export function fieldPointerCoordinates(
  client: FieldPoint,
  bounds: FieldBounds,
  size: FieldSize,
  rotatedClockwise: boolean,
): FieldPoint {
  if (rotatedClockwise) {
    return {
      x: ((client.y - bounds.top) / bounds.height) * size.width,
      y: ((bounds.right - client.x) / bounds.width) * size.height,
    };
  }
  return {
    x: ((client.x - bounds.left) / bounds.width) * size.width,
    y: ((client.y - bounds.top) / bounds.height) * size.height,
  };
}

export function shouldStartFieldPointerInteraction(
  button: number,
  target: ClosestTarget | null,
): boolean {
  if (button !== 0) return false;
  return !target?.closest?.(
    "button, a, input, select, textarea, [role='button'], [data-field-ui]",
  );
}

export function fieldPointerDistance(first: FieldPoint, second: FieldPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function pinchZoomFactor(previousDistance: number, currentDistance: number): number {
  if (previousDistance <= 0 || currentDistance <= 0) return 1;
  return Math.min(1.25, Math.max(0.8, currentDistance / previousDistance));
}
