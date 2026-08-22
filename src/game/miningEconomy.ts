import type { Faction } from "./types";
import {
  SANDBOX_POPULATION_CAP,
  populationIncomeMultiplier,
} from "./battleMode";
import type { HexCoordinate } from "../map/battlefield";
import {
  SANDBOX_LARGE_MINE_CAPACITY,
  SANDBOX_LARGE_MINE_PITS,
  type BattlefieldMinePitDefinition,
} from "../map/sandboxLargeBattlefield";

export const MINING_CYCLE_SECONDS = 4;
export const MAXIMUM_GROSS_ORE_PER_CYCLE = 100;
export const SANDBOX_MINE_CAPACITY = SANDBOX_LARGE_MINE_CAPACITY;
export const SANDBOX_WALLET_CAPACITY = 5_000;
export const MINING_FIXED_POINT_SCALE = 100;

const RATE_DENOMINATOR = 5;
const TIME_EPSILON = 1e-9;
const AMOUNT_EPSILON = 1e-7;
const FACTIONS: readonly Faction[] = ["verdant", "crimson"];

export interface MinePitState {
  readonly id: string;
  readonly coordinate: HexCoordinate;
  readonly capacityOre: number;
  readonly remainingOre: number;
  /** Write-time derived invariant: exactly equivalent to remainingOre === 0. */
  readonly depleted: boolean;
  readonly controller: Faction | null;
  readonly captureProgress: number;
  readonly capturingFaction: Faction | null;
  readonly productionProgress: number;
  readonly occupyingMineId: string | null;
}

export interface EmergencyMinePermitState {
  readonly used: boolean;
}

export interface SandboxMiningState {
  readonly pitsById: Readonly<Record<string, MinePitState>>;
  readonly emergencyPermits: Readonly<Record<Faction, EmergencyMinePermitState>>;
  /** Fractional mined gold retained outside the integer game wallet. */
  readonly walletRemainderHundredths: Readonly<Record<Faction, number>>;
  readonly nextLedgerSequence: number;
}

export interface MiningPopulationSnapshot {
  readonly usedPopulation: number;
  readonly reservedPopulation: number;
}

/** Only completed, living gold mines belong in this input. */
export interface MineProductionSource {
  readonly pitId: string;
  readonly mineId: string;
  readonly faction: Faction;
}

export type MiningSettlementOutcome = "settled" | "wallet-full" | "depleted";

export interface MiningLedgerEvent {
  readonly type: "mine-production-settled";
  readonly sequence: number;
  readonly scheduledAt: number;
  readonly pitId: string;
  readonly mineId: string;
  readonly faction: Faction;
  readonly outcome: MiningSettlementOutcome;
  readonly usedPopulation: number;
  readonly reservedPopulation: number;
  readonly incomeMultiplier: 1 | 0.8 | 0.6;
  readonly grossExtracted: number;
  readonly upkeepWithheld: number;
  readonly netCredited: number;
  readonly walletBefore: number;
  readonly walletAfter: number;
  readonly oreBefore: number;
  readonly oreAfter: number;
}

export interface AdvanceSandboxMiningInput {
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly walletGoldByFaction: Readonly<Record<Faction, number>>;
  readonly populationByFaction: Readonly<Record<Faction, MiningPopulationSnapshot>>;
  readonly productionSources: readonly MineProductionSource[];
}

export interface AdvanceSandboxMiningResult {
  readonly state: SandboxMiningState;
  readonly walletGoldByFaction: Readonly<Record<Faction, number>>;
  readonly events: readonly MiningLedgerEvent[];
}

export interface EmergencyMineBuildingSummary {
  readonly id: string;
  readonly faction: Faction;
  readonly status: "constructing" | "active" | "destroyed";
}

export type EmergencyMinePermitIneligibilityReason =
  | "already-used"
  | "gold-not-below-mine-cost"
  | "friendly-mine-exists"
  | "no-controlled-available-pit";

export type EmergencyMinePermitEligibility =
  | {
    readonly eligible: true;
    readonly reason: null;
    readonly eligiblePitIds: readonly string[];
  }
  | {
    readonly eligible: false;
    readonly reason: EmergencyMinePermitIneligibilityReason;
    readonly eligiblePitIds: readonly string[];
  };

export interface EmergencyMinePermitEligibilityInput {
  readonly faction: Faction;
  readonly walletGold: number;
  readonly mineCost?: number;
  readonly mineBuildings: readonly EmergencyMineBuildingSummary[];
}

export interface ConsumeEmergencyMinePermitResult {
  readonly state: SandboxMiningState;
  readonly consumed: boolean;
}

export type OccupyMinePitFailureReason = "unknown-pit" | "depleted" | "occupied";

export type OccupyMinePitResult =
  | { readonly state: SandboxMiningState; readonly occupied: true; readonly reason: null }
  | {
    readonly state: SandboxMiningState;
    readonly occupied: false;
    readonly reason: OccupyMinePitFailureReason;
  };

export interface VacateMinePitResult {
  readonly state: SandboxMiningState;
  readonly vacated: boolean;
}

export function createMinePitState(
  definition: BattlefieldMinePitDefinition,
): MinePitState {
  if (!definition.id.trim()) throw new Error("Mine pit requires a non-empty id.");
  assertWholeNonNegative(definition.capacity, "Mine pit capacity");
  if (definition.capacity <= 0) throw new RangeError("Mine pit capacity must be positive.");
  return freezePit({
    id: definition.id,
    coordinate: definition.coordinate,
    capacityOre: definition.capacity,
    remainingOre: definition.capacity,
    depleted: false,
    controller: definition.initialController,
    captureProgress: 0,
    capturingFaction: null,
    productionProgress: 0,
    occupyingMineId: null,
  });
}

export function createSandboxMiningState(
  definitions: readonly BattlefieldMinePitDefinition[] = SANDBOX_LARGE_MINE_PITS,
): SandboxMiningState {
  const entries = definitions.map((definition) => {
    const pit = createMinePitState(definition);
    return [pit.id, pit] as const;
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length) {
    throw new Error("Mine pit ids must be unique.");
  }
  return freezeState({
    pitsById: Object.fromEntries(entries),
    emergencyPermits: {
      verdant: { used: false },
      crimson: { used: false },
    },
    walletRemainderHundredths: { verdant: 0, crimson: 0 },
    nextLedgerSequence: 0,
  });
}

/** Replaces one authoritative pit without allowing reserve/capacity corruption. */
export function replaceMinePitState(
  state: SandboxMiningState,
  pit: MinePitState,
): SandboxMiningState {
  const previous = minePitFor(state, pit.id);
  if (!previous) throw new Error(`Unknown mine pit: ${pit.id}`);
  const nextPit = freezePit(pit);
  if (nextPit.capacityOre !== previous.capacityOre) {
    throw new Error("Mine pit capacity cannot change at runtime.");
  }
  return freezeState({
    ...state,
    pitsById: { ...state.pitsById, [pit.id]: nextPit },
  });
}

export function occupyMinePit(
  state: SandboxMiningState,
  pitId: string,
  mineId: string,
): OccupyMinePitResult {
  const pit = minePitFor(state, pitId);
  if (!pit) return { state, occupied: false, reason: "unknown-pit" };
  if (pit.remainingOre <= 0) return { state, occupied: false, reason: "depleted" };
  if (pit.occupyingMineId !== null) return { state, occupied: false, reason: "occupied" };
  if (!mineId.trim()) throw new Error("Mine occupancy requires a non-empty mine id.");
  return {
    occupied: true,
    reason: null,
    state: replaceMinePitState(state, {
      ...pit,
      occupyingMineId: mineId,
      productionProgress: 0,
    }),
  };
}

export function vacateMinePit(
  state: SandboxMiningState,
  pitId: string,
  mineId: string,
): VacateMinePitResult {
  const pit = minePitFor(state, pitId);
  if (!pit || pit.occupyingMineId !== mineId) return { state, vacated: false };
  return {
    vacated: true,
    state: replaceMinePitState(state, {
      ...pit,
      occupyingMineId: null,
      productionProgress: 0,
    }),
  };
}

export function advanceSandboxMining(
  state: SandboxMiningState,
  input: AdvanceSandboxMiningInput,
): AdvanceSandboxMiningResult {
  if (
    !Number.isFinite(input.elapsedSeconds)
    || !Number.isFinite(input.deltaSeconds)
    || input.elapsedSeconds < 0
    || input.deltaSeconds <= 0
  ) {
    return {
      state,
      walletGoldByFaction: input.walletGoldByFaction,
      events: Object.freeze([]),
    };
  }
  const populationByFaction = validatePopulations(input.populationByFaction);
  const walletHundredths = createWalletHundredths(state, input.walletGoldByFaction);
  const sourceByPitId = validateProductionSources(state, input.productionSources);
  const nextPits: Record<string, MinePitState> = { ...state.pitsById };
  const attempts: MiningAttempt[] = [];

  for (const pitId of Object.keys(state.pitsById).sort()) {
    const pit = state.pitsById[pitId]!;
    const source = sourceByPitId.get(pitId);
    if (!source) {
      if (pit.productionProgress !== 0) {
        nextPits[pitId] = freezePit({ ...pit, productionProgress: 0 });
      }
      continue;
    }
    const accumulated = pit.productionProgress + input.deltaSeconds;
    const cycleCount = Math.floor((accumulated + TIME_EPSILON) / MINING_CYCLE_SECONDS);
    let productionProgress = accumulated - cycleCount * MINING_CYCLE_SECONDS;
    if (Math.abs(productionProgress) < TIME_EPSILON) productionProgress = 0;
    nextPits[pitId] = freezePit({ ...pit, productionProgress });
    const firstOffset = Math.max(0, MINING_CYCLE_SECONDS - pit.productionProgress);
    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      attempts.push({
        offset: firstOffset + cycle * MINING_CYCLE_SECONDS,
        pitId,
        source,
      });
    }
  }
  attempts.sort((first, second) => (
    first.offset - second.offset || first.pitId.localeCompare(second.pitId)
  ));

  const events: MiningLedgerEvent[] = [];
  let nextSequence = state.nextLedgerSequence;
  for (const attempt of attempts) {
    const pit = nextPits[attempt.pitId]!;
    const population = populationByFaction[attempt.source.faction];
    const rate = miningIncomeRate(population.usedPopulation);
    const settlement = settleAttempt(
      pit,
      attempt.source,
      walletHundredths[attempt.source.faction],
      rate,
    );
    nextPits[attempt.pitId] = freezePit(settlement.pit);
    walletHundredths[attempt.source.faction] = settlement.walletAfterHundredths;
    events.push(Object.freeze({
      type: "mine-production-settled",
      sequence: nextSequence,
      scheduledAt: fixedSeconds(input.elapsedSeconds + attempt.offset),
      pitId: pit.id,
      mineId: attempt.source.mineId,
      faction: attempt.source.faction,
      outcome: settlement.outcome,
      usedPopulation: population.usedPopulation,
      reservedPopulation: population.reservedPopulation,
      incomeMultiplier: rate.multiplier,
      grossExtracted: fromHundredths(settlement.grossHundredths),
      upkeepWithheld: fromHundredths(settlement.upkeepHundredths),
      netCredited: fromHundredths(settlement.netHundredths),
      walletBefore: fromHundredths(settlement.walletBeforeHundredths),
      walletAfter: fromHundredths(settlement.walletAfterHundredths),
      oreBefore: fromHundredths(settlement.oreBeforeHundredths),
      oreAfter: fromHundredths(settlement.oreAfterHundredths),
    }));
    nextSequence += 1;
  }

  const nextWalletGold = Object.freeze({
    verdant: Math.floor(walletHundredths.verdant / MINING_FIXED_POINT_SCALE),
    crimson: Math.floor(walletHundredths.crimson / MINING_FIXED_POINT_SCALE),
  });
  return {
    state: freezeState({
      pitsById: nextPits,
      emergencyPermits: state.emergencyPermits,
      walletRemainderHundredths: {
        verdant: walletHundredths.verdant % MINING_FIXED_POINT_SCALE,
        crimson: walletHundredths.crimson % MINING_FIXED_POINT_SCALE,
      },
      nextLedgerSequence: nextSequence,
    }),
    walletGoldByFaction: nextWalletGold,
    events: Object.freeze(events),
  };
}

export function miningIncomeMultiplier(usedPopulation: number): 1 | 0.8 | 0.6 {
  return miningIncomeRate(usedPopulation).multiplier;
}

export function emergencyMinePermitEligibility(
  state: SandboxMiningState,
  input: EmergencyMinePermitEligibilityInput,
): EmergencyMinePermitEligibility {
  assertWholeNonNegative(input.walletGold, "Wallet gold");
  const mineCost = input.mineCost ?? 400;
  assertWholeNonNegative(mineCost, "Mine cost");
  if (mineCost <= 0) throw new RangeError("Mine cost must be positive.");
  const availablePits = Object.values(state.pitsById)
    .filter((pit) => (
      pit.controller === input.faction
      && pit.remainingOre > 0
      && pit.occupyingMineId === null
    ))
    .map((pit) => pit.id)
    .sort();
  const result = (
    eligible: boolean,
    reason: EmergencyMinePermitIneligibilityReason | null,
  ): EmergencyMinePermitEligibility => Object.freeze({
    eligible,
    reason,
    eligiblePitIds: Object.freeze(availablePits),
  }) as EmergencyMinePermitEligibility;

  if (state.emergencyPermits[input.faction].used) return result(false, "already-used");
  const walletHundredths = input.walletGold * MINING_FIXED_POINT_SCALE
    + state.walletRemainderHundredths[input.faction];
  if (walletHundredths >= mineCost * MINING_FIXED_POINT_SCALE) {
    return result(false, "gold-not-below-mine-cost");
  }
  if (input.mineBuildings.some((mine) => (
    mine.faction === input.faction
    && (mine.status === "constructing" || mine.status === "active")
  ))) {
    return result(false, "friendly-mine-exists");
  }
  if (availablePits.length === 0) return result(false, "no-controlled-available-pit");
  return result(true, null);
}

export function consumeEmergencyMinePermit(
  state: SandboxMiningState,
  faction: Faction,
): ConsumeEmergencyMinePermitResult {
  if (state.emergencyPermits[faction].used) return { state, consumed: false };
  return {
    consumed: true,
    state: freezeState({
      ...state,
      emergencyPermits: {
        ...state.emergencyPermits,
        [faction]: { used: true },
      },
    }),
  };
}

interface MiningIncomeRate {
  readonly numerator: 5 | 4 | 3;
  readonly multiplier: 1 | 0.8 | 0.6;
}

interface MiningAttempt {
  readonly offset: number;
  readonly pitId: string;
  readonly source: MineProductionSource;
}

interface AttemptSettlement {
  readonly pit: MinePitState;
  readonly outcome: MiningSettlementOutcome;
  readonly grossHundredths: number;
  readonly upkeepHundredths: number;
  readonly netHundredths: number;
  readonly walletBeforeHundredths: number;
  readonly walletAfterHundredths: number;
  readonly oreBeforeHundredths: number;
  readonly oreAfterHundredths: number;
}

function settleAttempt(
  pit: MinePitState,
  source: MineProductionSource,
  walletBeforeHundredths: number,
  rate: MiningIncomeRate,
): AttemptSettlement {
  void source;
  const oreBeforeHundredths = toHundredths(pit.remainingOre, "Remaining ore");
  const walletCapacityHundredths = SANDBOX_WALLET_CAPACITY * MINING_FIXED_POINT_SCALE
    - walletBeforeHundredths;
  let grossHundredths = 0;
  let outcome: MiningSettlementOutcome = "settled";
  if (oreBeforeHundredths <= 0) outcome = "depleted";
  else if (walletCapacityHundredths <= 0) outcome = "wallet-full";
  else {
    const proportionalGross = Math.floor(
      walletCapacityHundredths * RATE_DENOMINATOR / rate.numerator,
    );
    // Five hundredths is the smallest gross unit that stays exact in all
    // 100%/80%/60% bands. Tail ore may be smaller and is still consumed when
    // wallet capacity is not the limiting factor.
    const maximumGrossForWallet = proportionalGross
      - proportionalGross % RATE_DENOMINATOR;
    grossHundredths = Math.min(
      MAXIMUM_GROSS_ORE_PER_CYCLE * MINING_FIXED_POINT_SCALE,
      oreBeforeHundredths,
      maximumGrossForWallet,
    );
  }
  const netHundredths = Math.floor(grossHundredths * rate.numerator / RATE_DENOMINATOR);
  const upkeepHundredths = grossHundredths - netHundredths;
  const walletAfterHundredths = walletBeforeHundredths + netHundredths;
  const oreAfterHundredths = oreBeforeHundredths - grossHundredths;
  return {
    pit: {
      ...pit,
      remainingOre: fromHundredths(oreAfterHundredths),
    },
    outcome,
    grossHundredths,
    upkeepHundredths,
    netHundredths,
    walletBeforeHundredths,
    walletAfterHundredths,
    oreBeforeHundredths,
    oreAfterHundredths,
  };
}

function miningIncomeRate(usedPopulation: number): MiningIncomeRate {
  assertWholeNonNegative(usedPopulation, "Used population");
  if (usedPopulation > SANDBOX_POPULATION_CAP) {
    throw new RangeError(`Used population cannot exceed ${SANDBOX_POPULATION_CAP}.`);
  }
  const multiplier = populationIncomeMultiplier("sandbox", usedPopulation);
  if (multiplier === 1) return { numerator: 5, multiplier };
  if (multiplier === 0.8) return { numerator: 4, multiplier };
  return { numerator: 3, multiplier: 0.6 };
}

function validatePopulations(
  populations: Readonly<Record<Faction, MiningPopulationSnapshot>>,
): Readonly<Record<Faction, MiningPopulationSnapshot>> {
  for (const faction of FACTIONS) {
    const population = populations[faction];
    assertWholeNonNegative(population.usedPopulation, `${faction} used population`);
    assertWholeNonNegative(population.reservedPopulation, `${faction} reserved population`);
    if (
      population.usedPopulation + population.reservedPopulation
      > SANDBOX_POPULATION_CAP
    ) {
      throw new RangeError(
        `${faction} committed population cannot exceed ${SANDBOX_POPULATION_CAP}.`,
      );
    }
  }
  return populations;
}

function createWalletHundredths(
  state: SandboxMiningState,
  walletGold: Readonly<Record<Faction, number>>,
): Record<Faction, number> {
  const result = { verdant: 0, crimson: 0 };
  for (const faction of FACTIONS) {
    assertWholeNonNegative(walletGold[faction], `${faction} wallet gold`);
    const total = walletGold[faction] * MINING_FIXED_POINT_SCALE
      + state.walletRemainderHundredths[faction];
    if (total > SANDBOX_WALLET_CAPACITY * MINING_FIXED_POINT_SCALE) {
      throw new RangeError(`${faction} wallet cannot exceed ${SANDBOX_WALLET_CAPACITY}.`);
    }
    result[faction] = total;
  }
  return result;
}

function validateProductionSources(
  state: SandboxMiningState,
  sources: readonly MineProductionSource[],
): ReadonlyMap<string, MineProductionSource> {
  const byPitId = new Map<string, MineProductionSource>();
  for (const source of sources) {
    const pit = minePitFor(state, source.pitId);
    if (!pit) throw new Error(`Production source references unknown pit: ${source.pitId}`);
    if (pit.occupyingMineId !== source.mineId) {
      throw new Error(`Production source ${source.mineId} does not occupy pit ${source.pitId}.`);
    }
    if (byPitId.has(source.pitId)) {
      throw new Error(`Pit ${source.pitId} has duplicate production sources.`);
    }
    byPitId.set(source.pitId, source);
  }
  return byPitId;
}

function validatePit(pit: MinePitState): void {
  if (!pit.id.trim()) throw new Error("Mine pit requires a non-empty id.");
  assertFixedNonNegative(pit.capacityOre, "Mine pit capacity");
  assertFixedNonNegative(pit.remainingOre, "Remaining ore");
  if (pit.capacityOre <= 0 || pit.remainingOre > pit.capacityOre) {
    throw new RangeError("Mine pit ore must remain within its fixed capacity.");
  }
  if (pit.depleted !== (pit.remainingOre === 0)) {
    throw new Error("Mine pit depleted state must match its remaining ore.");
  }
  if (
    !Number.isFinite(pit.captureProgress)
    || pit.captureProgress < 0
    || !Number.isFinite(pit.productionProgress)
    || pit.productionProgress < 0
    || pit.productionProgress >= MINING_CYCLE_SECONDS + TIME_EPSILON
  ) {
    throw new RangeError("Mine pit progress values must be finite and in range.");
  }
}

function freezePit(pit: MinePitState): MinePitState {
  const normalized = {
    ...pit,
    depleted: pit.remainingOre === 0,
  };
  validatePit(normalized);
  return Object.freeze({
    ...normalized,
    coordinate: Object.freeze({ ...normalized.coordinate }),
  });
}

function freezeState(state: SandboxMiningState): SandboxMiningState {
  return Object.freeze({
    pitsById: Object.freeze({ ...state.pitsById }),
    emergencyPermits: Object.freeze({
      verdant: Object.freeze({ ...state.emergencyPermits.verdant }),
      crimson: Object.freeze({ ...state.emergencyPermits.crimson }),
    }),
    walletRemainderHundredths: Object.freeze({ ...state.walletRemainderHundredths }),
    nextLedgerSequence: state.nextLedgerSequence,
  });
}

function toHundredths(value: number, label: string): number {
  assertFixedNonNegative(value, label);
  return Math.round(value * MINING_FIXED_POINT_SCALE);
}

function fromHundredths(value: number): number {
  return value / MINING_FIXED_POINT_SCALE;
}

function assertFixedNonNegative(value: number, label: string): void {
  if (
    !Number.isFinite(value)
    || value < 0
    || Math.abs(value * MINING_FIXED_POINT_SCALE - Math.round(value * MINING_FIXED_POINT_SCALE))
      > AMOUNT_EPSILON
  ) {
    throw new RangeError(`${label} must be a non-negative amount with at most two decimals.`);
  }
}

function assertWholeNonNegative(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

function fixedSeconds(value: number): number {
  return Number(value.toFixed(9));
}

function minePitFor(
  state: SandboxMiningState,
  pitId: string,
): MinePitState | undefined {
  return Object.hasOwn(state.pitsById, pitId)
    ? state.pitsById[pitId]
    : undefined;
}
