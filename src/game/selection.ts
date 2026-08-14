import type { Faction } from "./battle";

export interface ScreenRectInput {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ProjectedUnit {
  readonly id: string;
  readonly faction: Faction;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
  readonly visible: boolean;
}

export type SelectionMode = "replace" | "toggle";

export function normalizeScreenRect(input: ScreenRectInput): ScreenRect | null {
  const values = [input.startX, input.startY, input.endX, input.endY];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return {
    left: Math.min(input.startX, input.endX),
    top: Math.min(input.startY, input.endY),
    right: Math.max(input.startX, input.endX),
    bottom: Math.max(input.startY, input.endY),
  };
}

export function selectFriendlyUnitsInRect(
  units: readonly ProjectedUnit[],
  rect: ScreenRect,
): string[] {
  return units
    .filter((unit) => (
      unit.faction === "verdant"
      && unit.alive
      && unit.visible
      && unit.x >= rect.left
      && unit.x <= rect.right
      && unit.y >= rect.top
      && unit.y <= rect.bottom
    ))
    .map((unit) => unit.id)
    .sort();
}

export function applySelection(
  current: readonly string[],
  incoming: readonly string[],
  mode: SelectionMode,
): string[] {
  if (mode === "replace") return [...new Set(incoming)].sort();
  const selected = new Set(current);
  for (const id of incoming) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  return [...selected].sort();
}
