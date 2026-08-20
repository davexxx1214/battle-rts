import {
  battleModeDefinitionFor,
} from "./battleMode";
import {
  SANDBOX_TROOP_SLOTS,
  sandboxTroopSpec,
  type SandboxProductionBuildingSlot,
  type SandboxTroopSlot,
} from "./sandboxCatalog";
import {
  trySpendGold,
  type EconomyState,
} from "./economy";
import type { Faction } from "./types";
import type { HexCoordinate } from "../map/battlefield";

export type { SandboxProductionBuildingSlot } from "./sandboxCatalog";

export type SandboxProductionEntryStatus =
  | "queued"
  | "training"
  | "ready-blocked";

export interface SandboxProductionQueueEntry {
  readonly id: string;
  readonly sequence: number;
  readonly troopKind: SandboxTroopSlot;
  readonly status: SandboxProductionEntryStatus;
  readonly trainingProgressSeconds: number;
}

export interface SandboxProductionBuildingQueue {
  readonly buildingId: string;
  readonly faction: Faction;
  readonly producer: SandboxProductionBuildingSlot;
  readonly rallyPoint: HexCoordinate | null;
  readonly entries: readonly SandboxProductionQueueEntry[];
}

export interface SandboxProductionState {
  readonly queuesByBuildingId: Readonly<Record<string, SandboxProductionBuildingQueue>>;
  readonly nextEntrySequence: number;
}

export interface SandboxProductionBuildingRegistration {
  readonly buildingId: string;
  readonly faction: Faction;
  readonly producer: SandboxProductionBuildingSlot;
}

export type SandboxProductionRallyPointFailureReason =
  | "building-not-found"
  | "invalid-coordinate";

export type SetSandboxProductionRallyPointResult =
  | {
    readonly updated: true;
    readonly reason: null;
    readonly state: SandboxProductionState;
    readonly rallyPoint: HexCoordinate | null;
  }
  | {
    readonly updated: false;
    readonly reason: SandboxProductionRallyPointFailureReason;
    readonly state: SandboxProductionState;
    readonly rallyPoint: null;
  };

export type SandboxProductionRegistrationFailureReason =
  | "invalid-building-id"
  | "unsupported-producer"
  | "building-already-registered";

export type SandboxProductionRegistrationResult =
  | {
    readonly registered: true;
    readonly reason: null;
    readonly state: SandboxProductionState;
    readonly queue: SandboxProductionBuildingQueue;
  }
  | {
    readonly registered: false;
    readonly reason: SandboxProductionRegistrationFailureReason;
    readonly state: SandboxProductionState;
    readonly queue: null;
  };

export interface SandboxProductionPopulationCommitment {
  /** Population reserved by queued or actively training orders. */
  readonly reservedPopulation: number;
  /** Completed orders waiting for an unblocked building exit; counted as used. */
  readonly readyBlockedPopulation: number;
  readonly totalQueuePopulation: number;
}

export type SandboxProductionPopulationByFaction = Readonly<
  Record<Faction, SandboxProductionPopulationCommitment>
>;

export interface SandboxProductionEnqueueRequest {
  readonly buildingId: string;
  readonly faction: Faction;
  readonly troopKind: SandboxTroopSlot;
}

export interface EnqueueSandboxProductionInput {
  readonly state: SandboxProductionState;
  readonly economy: EconomyState;
  /** Living-unit population only. Queue reservations are derived from state. */
  readonly livingPopulationByFaction: Readonly<Record<Faction, number>>;
  readonly request: SandboxProductionEnqueueRequest;
}

export type SandboxProductionEnqueueFailureReason =
  | "building-not-found"
  | "faction-mismatch"
  | "invalid-troop"
  | "wrong-producer"
  | "queue-full"
  | "invalid-population"
  | "population-cap"
  | "insufficient-gold";

export type EnqueueSandboxProductionResult =
  | {
    readonly accepted: true;
    readonly reason: null;
    readonly state: SandboxProductionState;
    readonly economy: EconomyState;
    readonly entry: SandboxProductionQueueEntry;
    readonly population: SandboxProductionPopulationCommitment;
  }
  | {
    readonly accepted: false;
    readonly reason: SandboxProductionEnqueueFailureReason;
    readonly state: SandboxProductionState;
    readonly economy: EconomyState;
    readonly entry: null;
    readonly population: SandboxProductionPopulationCommitment | null;
  };

export interface SandboxProductionSpawn {
  readonly entryId: string;
  readonly entrySequence: number;
  readonly buildingId: string;
  readonly faction: Faction;
  readonly producer: SandboxProductionBuildingSlot;
  readonly troopKind: SandboxTroopSlot;
  readonly entityCount: number;
  readonly populationCost: number;
  readonly scheduledAtSeconds: number;
  readonly squadId: string;
  readonly unitIds: readonly string[];
  /** Immutable snapshot; navigation begins only after the caller creates units. */
  readonly rallyPoint: HexCoordinate | null;
}

export interface AdvanceSandboxProductionInput {
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly isExitBlocked?: (spawn: SandboxProductionSpawn) => boolean;
}

export interface AdvanceSandboxProductionResult {
  readonly state: SandboxProductionState;
  readonly spawns: readonly SandboxProductionSpawn[];
  readonly populationBefore: SandboxProductionPopulationByFaction;
  readonly populationAfter: SandboxProductionPopulationByFaction;
}

export interface DestroySandboxProductionBuildingResult {
  readonly state: SandboxProductionState;
  readonly destroyed: boolean;
  readonly faction: Faction | null;
  readonly discardedEntries: readonly SandboxProductionQueueEntry[];
  readonly releasedReservedPopulation: number;
  readonly releasedReadyBlockedPopulation: number;
}

const sandboxMode = battleModeDefinitionFor("sandbox");

if (sandboxMode.productionPolicy.kind !== "building-queue") {
  throw new Error("Sandbox production policy must use a building queue");
}
if (sandboxMode.populationPolicy.kind !== "capped") {
  throw new Error("Sandbox population policy must be capped");
}

export const SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH =
  sandboxMode.productionPolicy.maximumQueueLength;
export const SANDBOX_PRODUCTION_POPULATION_CAP =
  sandboxMode.populationPolicy.maximumPopulation;

const PRODUCTION_BUILDING_SLOTS = Object.freeze(
  [...new Set(SANDBOX_TROOP_SLOTS.map((slot) => sandboxTroopSpec(slot).producer))],
) as readonly SandboxProductionBuildingSlot[];
const TIME_EPSILON = 1e-9;

export function createSandboxProductionState(
  registrations: readonly SandboxProductionBuildingRegistration[] = [],
): SandboxProductionState {
  let state = freezeState({}, 1);
  for (const registration of registrations) {
    const result = registerSandboxProductionBuilding(state, registration);
    if (!result.registered) {
      throw new Error(
        `Cannot register sandbox production building ${registration.buildingId}: ${result.reason}`,
      );
    }
    state = result.state;
  }
  return state;
}

export function registerSandboxProductionBuilding(
  state: SandboxProductionState,
  registration: SandboxProductionBuildingRegistration,
): SandboxProductionRegistrationResult {
  if (registration.buildingId.trim().length === 0) {
    return registrationFailure(state, "invalid-building-id");
  }
  if (!isSandboxProductionBuildingSlot(registration.producer)) {
    return registrationFailure(state, "unsupported-producer");
  }
  if (Object.hasOwn(state.queuesByBuildingId, registration.buildingId)) {
    return registrationFailure(state, "building-already-registered");
  }

  const queue = freezeQueue({
    ...registration,
    rallyPoint: null,
    entries: [],
  });
  return Object.freeze({
    registered: true,
    reason: null,
    state: replaceQueue(state, queue),
    queue,
  });
}

export function sandboxProductionQueueFor(
  state: SandboxProductionState,
  buildingId: string,
): SandboxProductionBuildingQueue | null {
  return ownQueue(state, buildingId);
}

export function setSandboxProductionRallyPoint(
  state: SandboxProductionState,
  buildingId: string,
  coordinate: HexCoordinate | null,
): SetSandboxProductionRallyPointResult {
  const queue = ownQueue(state, buildingId);
  if (queue === null) {
    return Object.freeze({
      updated: false,
      reason: "building-not-found",
      state,
      rallyPoint: null,
    });
  }
  if (
    coordinate !== null
    && (!Number.isInteger(coordinate.q) || !Number.isInteger(coordinate.r))
  ) {
    return Object.freeze({
      updated: false,
      reason: "invalid-coordinate",
      state,
      rallyPoint: null,
    });
  }

  const rallyPoint = coordinate === null
    ? null
    : Object.freeze({ q: coordinate.q, r: coordinate.r });
  const nextQueue = freezeQueue({ ...queue, rallyPoint });
  return Object.freeze({
    updated: true,
    reason: null,
    state: replaceQueue(state, nextQueue),
    rallyPoint,
  });
}

export function sandboxProductionPopulation(
  state: SandboxProductionState,
  faction: Faction,
): SandboxProductionPopulationCommitment {
  let reservedPopulation = 0;
  let readyBlockedPopulation = 0;
  for (const queue of Object.values(state.queuesByBuildingId)) {
    if (queue.faction !== faction) continue;
    for (const entry of queue.entries) {
      const populationCost = sandboxTroopSpec(entry.troopKind).populationCost;
      if (entry.status === "ready-blocked") {
        readyBlockedPopulation += populationCost;
      } else {
        reservedPopulation += populationCost;
      }
    }
  }
  return freezePopulation({ reservedPopulation, readyBlockedPopulation });
}

export function sandboxProductionPopulationByFaction(
  state: SandboxProductionState,
): SandboxProductionPopulationByFaction {
  return Object.freeze({
    verdant: sandboxProductionPopulation(state, "verdant"),
    crimson: sandboxProductionPopulation(state, "crimson"),
  });
}

export function enqueueSandboxProduction(
  input: EnqueueSandboxProductionInput,
): EnqueueSandboxProductionResult {
  const { state, economy, request } = input;
  const queue = ownQueue(state, request.buildingId);
  if (queue === null) {
    return enqueueFailure(state, economy, "building-not-found", null);
  }
  const currentPopulation = sandboxProductionPopulation(state, queue.faction);
  if (queue.faction !== request.faction) {
    return enqueueFailure(state, economy, "faction-mismatch", currentPopulation);
  }
  if (!isSandboxTroopSlot(request.troopKind)) {
    return enqueueFailure(state, economy, "invalid-troop", currentPopulation);
  }

  const spec = sandboxTroopSpec(request.troopKind);
  if (spec.producer !== queue.producer) {
    return enqueueFailure(state, economy, "wrong-producer", currentPopulation);
  }
  if (queue.entries.length >= SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH) {
    return enqueueFailure(state, economy, "queue-full", currentPopulation);
  }

  const livingPopulation = input.livingPopulationByFaction[queue.faction];
  if (!Number.isInteger(livingPopulation) || livingPopulation < 0) {
    return enqueueFailure(state, economy, "invalid-population", currentPopulation);
  }
  const committedPopulation = livingPopulation
    + currentPopulation.totalQueuePopulation
    + spec.populationCost;
  if (committedPopulation > SANDBOX_PRODUCTION_POPULATION_CAP) {
    return enqueueFailure(state, economy, "population-cap", currentPopulation);
  }

  const spending = trySpendGold(
    economy,
    queue.faction,
    spec.cost,
    sandboxMode.economyPolicy,
  );
  if (!spending.spent) {
    return enqueueFailure(state, economy, "insufficient-gold", currentPopulation);
  }

  const entry = freezeEntry({
    id: `${queue.buildingId}:production:${state.nextEntrySequence}`,
    sequence: state.nextEntrySequence,
    troopKind: request.troopKind,
    status: queue.entries.length === 0 ? "training" : "queued",
    trainingProgressSeconds: 0,
  });
  const nextQueue = freezeQueue({
    ...queue,
    entries: [...queue.entries, entry],
  });
  const nextState = replaceQueue(state, nextQueue, state.nextEntrySequence + 1);
  return Object.freeze({
    accepted: true,
    reason: null,
    state: nextState,
    economy: spending.state,
    entry,
    population: sandboxProductionPopulation(nextState, queue.faction),
  });
}

export function advanceSandboxProduction(
  state: SandboxProductionState,
  input: AdvanceSandboxProductionInput,
): AdvanceSandboxProductionResult {
  const populationBefore = sandboxProductionPopulationByFaction(state);
  if (
    !Number.isFinite(input.elapsedSeconds)
    || !Number.isFinite(input.deltaSeconds)
    || input.deltaSeconds <= 0
  ) {
    return freezeAdvanceResult(state, [], populationBefore, populationBefore);
  }

  let queuesByBuildingId = state.queuesByBuildingId;
  let changed = false;
  const spawns: SandboxProductionSpawn[] = [];
  const buildingIds = Object.keys(state.queuesByBuildingId).sort();

  for (const buildingId of buildingIds) {
    const queue = state.queuesByBuildingId[buildingId];
    if (queue.entries.length === 0) continue;

    const advanced = advanceBuildingQueue(queue, input);
    if (advanced.queue !== queue) {
      if (!changed) queuesByBuildingId = { ...queuesByBuildingId };
      (queuesByBuildingId as Record<string, SandboxProductionBuildingQueue>)[buildingId]
        = advanced.queue;
      changed = true;
    }
    spawns.push(...advanced.spawns);
  }

  spawns.sort(compareSpawns);
  const nextState = changed
    ? freezeState(queuesByBuildingId, state.nextEntrySequence)
    : state;
  return freezeAdvanceResult(
    nextState,
    spawns,
    populationBefore,
    sandboxProductionPopulationByFaction(nextState),
  );
}

export function destroySandboxProductionBuilding(
  state: SandboxProductionState,
  buildingId: string,
): DestroySandboxProductionBuildingResult {
  const queue = ownQueue(state, buildingId);
  if (queue === null) {
    return Object.freeze({
      state,
      destroyed: false,
      faction: null,
      discardedEntries: Object.freeze([]),
      releasedReservedPopulation: 0,
      releasedReadyBlockedPopulation: 0,
    });
  }

  let releasedReservedPopulation = 0;
  let releasedReadyBlockedPopulation = 0;
  for (const entry of queue.entries) {
    const populationCost = sandboxTroopSpec(entry.troopKind).populationCost;
    if (entry.status === "ready-blocked") {
      releasedReadyBlockedPopulation += populationCost;
    } else {
      releasedReservedPopulation += populationCost;
    }
  }

  const queuesByBuildingId = { ...state.queuesByBuildingId };
  delete queuesByBuildingId[buildingId];
  return Object.freeze({
    state: freezeState(queuesByBuildingId, state.nextEntrySequence),
    destroyed: true,
    faction: queue.faction,
    discardedEntries: queue.entries,
    releasedReservedPopulation,
    releasedReadyBlockedPopulation,
  });
}

function advanceBuildingQueue(
  queue: SandboxProductionBuildingQueue,
  input: AdvanceSandboxProductionInput,
): {
  readonly queue: SandboxProductionBuildingQueue;
  readonly spawns: readonly SandboxProductionSpawn[];
} {
  const entries = [...queue.entries];
  const spawns: SandboxProductionSpawn[] = [];
  let availableSeconds = input.deltaSeconds;
  let consumedSeconds = 0;
  let changed = false;

  while (entries.length > 0) {
    let head = entries[0];
    if (head.status === "queued") {
      head = freezeEntry({ ...head, status: "training" });
      entries[0] = head;
      changed = true;
    }

    if (head.status === "ready-blocked") {
      const spawn = createSpawn(queue, head, input.elapsedSeconds + consumedSeconds);
      if (input.isExitBlocked?.(spawn) === true) break;
      spawns.push(spawn);
      entries.shift();
      changed = true;
      continue;
    }

    const trainingSeconds = sandboxTroopSpec(head.troopKind).trainingSeconds;
    const secondsNeeded = Math.max(0, trainingSeconds - head.trainingProgressSeconds);
    if (availableSeconds + TIME_EPSILON < secondsNeeded) {
      entries[0] = freezeEntry({
        ...head,
        trainingProgressSeconds: head.trainingProgressSeconds + availableSeconds,
      });
      changed = true;
      break;
    }

    consumedSeconds += secondsNeeded;
    availableSeconds = Math.max(0, availableSeconds - secondsNeeded);
    const completed = freezeEntry({
      ...head,
      status: "ready-blocked",
      trainingProgressSeconds: trainingSeconds,
    });
    const spawn = createSpawn(queue, completed, input.elapsedSeconds + consumedSeconds);
    if (input.isExitBlocked?.(spawn) === true) {
      entries[0] = completed;
      changed = true;
      break;
    }

    spawns.push(spawn);
    entries.shift();
    changed = true;
  }

  return {
    queue: changed ? freezeQueue({ ...queue, entries }) : queue,
    spawns,
  };
}

function createSpawn(
  queue: SandboxProductionBuildingQueue,
  entry: SandboxProductionQueueEntry,
  scheduledAtSeconds: number,
): SandboxProductionSpawn {
  const spec = sandboxTroopSpec(entry.troopKind);
  const squadId = `${queue.buildingId}:squad:${entry.sequence}`;
  return Object.freeze({
    entryId: entry.id,
    entrySequence: entry.sequence,
    buildingId: queue.buildingId,
    faction: queue.faction,
    producer: queue.producer,
    troopKind: entry.troopKind,
    entityCount: spec.entityCount,
    populationCost: spec.populationCost,
    scheduledAtSeconds,
    squadId,
    unitIds: Object.freeze(
      Array.from(
        { length: spec.entityCount },
        (_, index) => `${squadId}:unit:${index + 1}`,
      ),
    ),
    rallyPoint: queue.rallyPoint === null
      ? null
      : Object.freeze({ q: queue.rallyPoint.q, r: queue.rallyPoint.r }),
  });
}

function replaceQueue(
  state: SandboxProductionState,
  queue: SandboxProductionBuildingQueue,
  nextEntrySequence = state.nextEntrySequence,
): SandboxProductionState {
  return freezeState(
    {
      ...state.queuesByBuildingId,
      [queue.buildingId]: queue,
    },
    nextEntrySequence,
  );
}

function freezeState(
  queuesByBuildingId: Readonly<Record<string, SandboxProductionBuildingQueue>>,
  nextEntrySequence: number,
): SandboxProductionState {
  return Object.freeze({
    queuesByBuildingId: Object.freeze(queuesByBuildingId),
    nextEntrySequence,
  });
}

function freezeQueue(
  queue: Omit<SandboxProductionBuildingQueue, "entries"> & {
    readonly entries: readonly SandboxProductionQueueEntry[];
  },
): SandboxProductionBuildingQueue {
  return Object.freeze({
    ...queue,
    entries: Object.freeze([...queue.entries]),
  });
}

function freezeEntry(
  entry: SandboxProductionQueueEntry,
): SandboxProductionQueueEntry {
  return Object.freeze(entry);
}

function freezePopulation(
  population: Pick<
    SandboxProductionPopulationCommitment,
    "reservedPopulation" | "readyBlockedPopulation"
  >,
): SandboxProductionPopulationCommitment {
  return Object.freeze({
    ...population,
    totalQueuePopulation:
      population.reservedPopulation + population.readyBlockedPopulation,
  });
}

function registrationFailure(
  state: SandboxProductionState,
  reason: SandboxProductionRegistrationFailureReason,
): SandboxProductionRegistrationResult {
  return Object.freeze({ registered: false, reason, state, queue: null });
}

function enqueueFailure(
  state: SandboxProductionState,
  economy: EconomyState,
  reason: SandboxProductionEnqueueFailureReason,
  population: SandboxProductionPopulationCommitment | null,
): EnqueueSandboxProductionResult {
  return Object.freeze({
    accepted: false,
    reason,
    state,
    economy,
    entry: null,
    population,
  });
}

function freezeAdvanceResult(
  state: SandboxProductionState,
  spawns: readonly SandboxProductionSpawn[],
  populationBefore: SandboxProductionPopulationByFaction,
  populationAfter: SandboxProductionPopulationByFaction,
): AdvanceSandboxProductionResult {
  return Object.freeze({
    state,
    spawns: Object.freeze([...spawns]),
    populationBefore,
    populationAfter,
  });
}

export function isSandboxTroopSlot(value: string): value is SandboxTroopSlot {
  return (SANDBOX_TROOP_SLOTS as readonly string[]).includes(value);
}

function ownQueue(
  state: SandboxProductionState,
  buildingId: string,
): SandboxProductionBuildingQueue | null {
  return Object.hasOwn(state.queuesByBuildingId, buildingId)
    ? state.queuesByBuildingId[buildingId]!
    : null;
}

function isSandboxProductionBuildingSlot(
  value: string,
): value is SandboxProductionBuildingSlot {
  return (PRODUCTION_BUILDING_SLOTS as readonly string[]).includes(value);
}

function compareSpawns(
  left: SandboxProductionSpawn,
  right: SandboxProductionSpawn,
): number {
  return left.scheduledAtSeconds - right.scheduledAtSeconds
    || left.buildingId.localeCompare(right.buildingId)
    || left.entrySequence - right.entrySequence;
}
