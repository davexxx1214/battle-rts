import type { Faction, UnitRole } from "./types";

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

interface RoleSelectableUnit {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly health: number;
}

export type FieldClickIntent =
  | { readonly type: "select"; readonly unitId: string }
  | { readonly type: "attack"; readonly targetId: string }
  | { readonly type: "advance" }
  | { readonly type: "clear" };

export function resolveFieldClickIntent(input: {
  readonly canIssueCommands: boolean;
  readonly hasCommandableSelection: boolean;
  readonly friendlyId: string | null;
  readonly enemyId: string | null;
}): FieldClickIntent {
  if (input.canIssueCommands && input.hasCommandableSelection && input.enemyId) {
    return { type: "attack", targetId: input.enemyId };
  }
  if (input.friendlyId) return { type: "select", unitId: input.friendlyId };
  if (input.canIssueCommands && input.hasCommandableSelection) return { type: "advance" };
  return { type: "clear" };
}

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

export function selectLivingFriendlyRole(
  units: readonly RoleSelectableUnit[],
  selectedUnitId: string,
): string[] {
  const selectedUnit = units.find((unit) => (
    unit.id === selectedUnitId
    && unit.faction === "verdant"
    && unit.health > 0
  ));
  if (!selectedUnit) return [];
  return units
    .filter((unit) => (
      unit.faction === "verdant"
      && unit.role === selectedUnit.role
      && unit.health > 0
    ))
    .map((unit) => unit.id)
    .sort();
}
