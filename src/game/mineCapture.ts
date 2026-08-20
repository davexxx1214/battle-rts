import { hexDistance, type HexCoordinate } from "../map/battlefield";
import type { MinePitState } from "./miningEconomy";
import type { Faction } from "./types";

export const MINE_CAPTURE_RADIUS_CELLS = 2;
export const MINE_CAPTURE_INTERFERENCE_RADIUS_CELLS = 3;
export const MINE_CAPTURE_DURATION_SECONDS = 3;

const CAPTURE_EPSILON = 1e-10;
const FACTIONS: readonly Faction[] = ["verdant", "crimson"];

export interface MineCaptureUnitSummary {
  readonly faction: Faction;
  readonly coordinate: HexCoordinate;
  readonly alive: boolean;
}

export interface MineCaptureOccupyingMineSummary {
  readonly id: string;
  readonly faction: Faction;
  readonly active: boolean;
}

export interface UpdatePitCaptureInput {
  readonly state: MinePitState;
  readonly units: readonly MineCaptureUnitSummary[];
  readonly occupyingMine: MineCaptureOccupyingMineSummary | null;
  readonly deltaSeconds: number;
}

export interface MineCapturedEvent {
  readonly type: "mine-pit-captured";
  readonly pitId: string;
  readonly previousController: Faction | null;
  readonly faction: Faction;
}

export interface UpdatePitCaptureResult {
  readonly state: MinePitState;
  readonly event: MineCapturedEvent | null;
}

/**
 * Advances one authoritative pit from explicit post-combat summaries.
 * The caller remains responsible for replacing this pit in SandboxMiningState.
 */
export function updatePitCapture({
  state,
  units,
  occupyingMine,
  deltaSeconds,
}: UpdatePitCaptureInput): UpdatePitCaptureResult {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return unchanged(state);
  }

  const capturingFaction = FACTIONS.find((faction) => canCapturePit(
    state,
    faction,
    units,
    occupyingMine,
  )) ?? null;
  if (capturingFaction === null) {
    return unchanged(resetCaptureProgress(state));
  }

  const previousProgress = state.capturingFaction === capturingFaction
    && Number.isFinite(state.captureProgress)
    && state.captureProgress > 0
    ? state.captureProgress
    : 0;
  const captureProgress = Number((previousProgress + deltaSeconds).toFixed(9));
  if (captureProgress + CAPTURE_EPSILON < MINE_CAPTURE_DURATION_SECONDS) {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        captureProgress,
        capturingFaction,
      }),
      event: null,
    });
  }

  const event: MineCapturedEvent = Object.freeze({
    type: "mine-pit-captured",
    pitId: state.id,
    previousController: state.controller,
    faction: capturingFaction,
  });
  return Object.freeze({
    state: Object.freeze({
      ...state,
      controller: capturingFaction,
      captureProgress: 0,
      capturingFaction: null,
    }),
    event,
  });
}

function canCapturePit(
  state: MinePitState,
  faction: Faction,
  units: readonly MineCaptureUnitSummary[],
  occupyingMine: MineCaptureOccupyingMineSummary | null,
): boolean {
  if (state.controller === faction) return false;
  const hasCapturingUnit = units.some((unit) => (
    unit.alive
    && unit.faction === faction
    && hexDistance(unit.coordinate, state.coordinate) <= MINE_CAPTURE_RADIUS_CELLS
  ));
  if (!hasCapturingUnit) return false;
  const hasEnemyInterference = units.some((unit) => (
    unit.alive
    && unit.faction !== faction
    && hexDistance(unit.coordinate, state.coordinate)
      <= MINE_CAPTURE_INTERFERENCE_RADIUS_CELLS
  ));
  return !hasEnemyInterference
    && !hasBlockingEnemyMine(state, faction, occupyingMine);
}

function hasBlockingEnemyMine(
  state: MinePitState,
  faction: Faction,
  occupyingMine: MineCaptureOccupyingMineSummary | null,
): boolean {
  if (state.occupyingMineId === null) return false;
  // A missing/mismatched summary cannot silently erase authoritative occupancy.
  if (occupyingMine?.id !== state.occupyingMineId) return true;
  return occupyingMine.active && occupyingMine.faction !== faction;
}

function resetCaptureProgress(state: MinePitState): MinePitState {
  if (state.captureProgress === 0 && state.capturingFaction === null) return state;
  return Object.freeze({
    ...state,
    captureProgress: 0,
    capturingFaction: null,
  });
}

function unchanged(state: MinePitState): UpdatePitCaptureResult {
  return Object.freeze({ state, event: null });
}
