export interface SandboxSelectionState {
  readonly selectedSquadIds: readonly string[];
}

export type SandboxInteractionMode =
  | "neutral"
  | "box-selecting"
  | "placing-building"
  | "camera-dragging";

export interface SandboxSelectionBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type SandboxInteractionEvent =
  | { readonly type: "select-building"; readonly selected: boolean }
  | { readonly type: "begin-box" }
  | { readonly type: "begin-camera" }
  | { readonly type: "finish" }
  | { readonly type: "cancel" };

export function createSandboxSelectionState(): SandboxSelectionState {
  return Object.freeze({ selectedSquadIds: Object.freeze([]) });
}

export function selectSandboxSquad(
  state: SandboxSelectionState,
  squadId: string | null,
  additive: boolean,
): SandboxSelectionState {
  if (squadId === null) {
    return additive ? state : createSandboxSelectionState();
  }
  if (!additive) return freezeSelection([squadId]);
  const selected = new Set(state.selectedSquadIds);
  if (selected.has(squadId)) selected.delete(squadId);
  else selected.add(squadId);
  return freezeSelection([...selected]);
}

export function selectSandboxSquadsInBox(
  state: SandboxSelectionState,
  squadIds: readonly string[],
  additive: boolean,
): SandboxSelectionState {
  const unique = [...new Set(squadIds)];
  if (!additive) return freezeSelection(unique);
  const selected = new Set(state.selectedSquadIds);
  for (const squadId of unique) {
    if (selected.has(squadId)) selected.delete(squadId);
    else selected.add(squadId);
  }
  return freezeSelection([...selected]);
}

export function pruneSandboxSelection(
  state: SandboxSelectionState,
  livingFriendlySquadIds: ReadonlySet<string>,
): SandboxSelectionState {
  const selectedSquadIds = state.selectedSquadIds.filter((squadId) => (
    livingFriendlySquadIds.has(squadId)
  ));
  return selectedSquadIds.length === state.selectedSquadIds.length
    ? state
    : freezeSelection(selectedSquadIds);
}

export function sandboxSelectionBox(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): SandboxSelectionBox {
  return Object.freeze({
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  });
}

/** One exclusive input tool owns the battlefield at a time. */
export function transitionSandboxInteraction(
  current: SandboxInteractionMode,
  event: SandboxInteractionEvent,
): SandboxInteractionMode {
  if (event.type === "cancel" || event.type === "finish") return "neutral";
  if (event.type === "select-building") {
    return event.selected ? "placing-building" : "neutral";
  }
  if (event.type === "begin-camera") return "camera-dragging";
  return current === "neutral" ? "box-selecting" : current;
}

function freezeSelection(squadIds: readonly string[]): SandboxSelectionState {
  return Object.freeze({
    selectedSquadIds: Object.freeze([...new Set(squadIds)].sort()),
  });
}
