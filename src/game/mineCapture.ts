import { hexDistance, type HexCoordinate } from "../map/battlefield";
import type { MinePitState } from "./miningEconomy";
import type { Faction } from "./types";

export const MINE_CAPTURE_RADIUS_CELLS = 1;

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

  const presentFactions = factionsPresentAtPit(state, units);
  const capturingFaction = firstArrivalFaction(state, units, presentFactions);
  if (
    capturingFaction === null
    || capturingFaction === state.controller
    || hasBlockingEnemyMine(state, capturingFaction, occupyingMine)
  ) return unchanged(clearLegacyCaptureProgress(state));

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

function factionsPresentAtPit(
  state: MinePitState,
  units: readonly MineCaptureUnitSummary[],
): ReadonlySet<Faction> {
  return new Set(units.flatMap((unit) => (
    unit.alive
      && hexDistance(unit.coordinate, state.coordinate) <= MINE_CAPTURE_RADIUS_CELLS
      ? [unit.faction]
      : []
  )));
}

function firstArrivalFaction(
  state: MinePitState,
  units: readonly MineCaptureUnitSummary[],
  presentFactions: ReadonlySet<Faction>,
): Faction | null {
  if (state.controller && presentFactions.has(state.controller)) return state.controller;
  // Retain an in-flight claimant from an older serialized snapshot if present.
  if (state.capturingFaction && presentFactions.has(state.capturingFaction)) {
    return state.capturingFaction;
  }
  // Unit order is stable in BattleState and provides a deterministic fallback
  // when both factions enter between the same two simulation ticks.
  return units.find((unit) => (
    unit.alive
    && presentFactions.has(unit.faction)
    && hexDistance(unit.coordinate, state.coordinate) <= MINE_CAPTURE_RADIUS_CELLS
  ))?.faction ?? null;
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

function clearLegacyCaptureProgress(state: MinePitState): MinePitState {
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
