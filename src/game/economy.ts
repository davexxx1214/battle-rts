import { GAME_RULES } from "./rules";
import type { Faction } from "./types";

export type GoldPhase = "normal" | "double";

export interface FactionEconomyState {
  readonly gold: number;
  readonly recoveryProgress: number;
  readonly isFull: boolean;
  readonly fullPromptSequence: number;
}

export interface EconomyState {
  readonly accounts: Readonly<Record<Faction, FactionEconomyState>>;
}

export interface EconomyAdvanceResult {
  readonly state: EconomyState;
  readonly newlyFullFactions: readonly Faction[];
}

export interface SpendGoldResult {
  readonly state: EconomyState;
  readonly spent: boolean;
}

export interface MatchClock {
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
  readonly phase: GoldPhase;
}

const FACTIONS: readonly Faction[] = ["verdant", "crimson"];
const PROGRESS_EPSILON = 1e-10;

export function createEconomyState(): EconomyState {
  const createAccount = (): FactionEconomyState => ({
    gold: GAME_RULES.economy.initialGold,
    recoveryProgress: 0,
    isFull: GAME_RULES.economy.initialGold >= GAME_RULES.economy.maximumGold,
    fullPromptSequence: 0,
  });
  return {
    accounts: {
      verdant: createAccount(),
      crimson: createAccount(),
    },
  };
}

export function advanceEconomy(
  state: EconomyState,
  elapsedSeconds: number,
  deltaSeconds: number,
): EconomyAdvanceResult {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { state, newlyFullFactions: [] };
  }

  const start = clamp(elapsedSeconds, 0, GAME_RULES.match.durationSeconds);
  const end = clamp(
    elapsedSeconds + deltaSeconds,
    0,
    GAME_RULES.match.durationSeconds,
  );
  if (end <= start) {
    return { state, newlyFullFactions: [] };
  }

  let accounts = state.accounts;
  const newlyFull = new Set<Faction>();
  for (const segment of splitRecoverySegments(start, end)) {
    const nextAccounts = { ...accounts };
    for (const faction of FACTIONS) {
      const advanced = advanceAccount(accounts[faction], segment.seconds, segment.phase);
      nextAccounts[faction] = advanced.account;
      if (advanced.becameFull) newlyFull.add(faction);
    }
    accounts = nextAccounts;
  }

  return {
    state: {
      accounts,
    },
    newlyFullFactions: FACTIONS.filter((faction) => newlyFull.has(faction)),
  };
}

export function trySpendGold(
  state: EconomyState,
  faction: Faction,
  amount: number,
): SpendGoldResult {
  if (
    !Number.isInteger(amount)
    || amount <= 0
    || amount % 100 !== 0
    || state.accounts[faction].gold < amount
  ) {
    return { state, spent: false };
  }
  const account = state.accounts[faction];
  const gold = account.gold - amount;
  return {
    spent: true,
    state: {
      ...state,
      accounts: {
        ...state.accounts,
        [faction]: {
          ...account,
          gold,
          isFull: gold >= GAME_RULES.economy.maximumGold,
        },
      },
    },
  };
}

export function getMatchClock(elapsedSeconds: number): MatchClock {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const elapsed = clamp(safeElapsed, 0, GAME_RULES.match.durationSeconds);
  return {
    elapsedSeconds: elapsed,
    remainingSeconds: GAME_RULES.match.durationSeconds - elapsed,
    phase: elapsed >= GAME_RULES.match.doubleGoldStartsAtSeconds ? "double" : "normal",
  };
}

interface RecoverySegment {
  readonly seconds: number;
  readonly phase: GoldPhase;
}

function splitRecoverySegments(start: number, end: number): RecoverySegment[] {
  const boundary = GAME_RULES.match.doubleGoldStartsAtSeconds;
  const segments: RecoverySegment[] = [];
  if (start < boundary) {
    const normalEnd = Math.min(end, boundary);
    if (normalEnd > start) segments.push({ seconds: normalEnd - start, phase: "normal" });
  }
  const doubleStart = Math.max(start, boundary);
  if (end > doubleStart) segments.push({ seconds: end - doubleStart, phase: "double" });
  return segments;
}

function advanceAccount(
  account: FactionEconomyState,
  seconds: number,
  phase: GoldPhase,
): { readonly account: FactionEconomyState; readonly becameFull: boolean } {
  const interval = phase === "double"
    ? GAME_RULES.economy.doubleRecoverySeconds
    : GAME_RULES.economy.normalRecoverySeconds;
  const accumulated = account.recoveryProgress + seconds / interval;
  const recoveryCount = Math.floor(accumulated + PROGRESS_EPSILON);
  let recoveryProgress = accumulated - recoveryCount;
  if (Math.abs(recoveryProgress) < PROGRESS_EPSILON) recoveryProgress = 0;
  const gold = Math.min(
    GAME_RULES.economy.maximumGold,
    account.gold + recoveryCount * GAME_RULES.economy.goldPerRecovery,
  );
  const isFull = gold >= GAME_RULES.economy.maximumGold;
  const becameFull = isFull && !account.isFull;
  return {
    becameFull,
    account: {
      gold,
      recoveryProgress,
      isFull,
      fullPromptSequence: account.fullPromptSequence + (becameFull ? 1 : 0),
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
