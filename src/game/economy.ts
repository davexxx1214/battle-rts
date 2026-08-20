import { getMatchClock } from "./matchClock";
import {
  LEGACY_ECONOMY_POLICY,
  type BattleEconomyPolicy,
  type PeriodicPassiveIncomePolicy,
} from "./battleMode";
import {
  GAME_RULES,
  MATCH_POLICIES,
  type MatchPolicy,
} from "./rules";
import type { Faction } from "./types";

export {
  getMatchClock,
  getMatchResourceMultiplier,
} from "./matchClock";
export type { MatchClock } from "./matchClock";

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

export interface GrantGoldResult {
  readonly state: EconomyState;
  readonly creditedAmount: number;
  readonly wastedAmount: number;
  readonly becameFull: boolean;
}

const FACTIONS: readonly Faction[] = ["verdant", "crimson"];
const PROGRESS_EPSILON = 1e-10;

export function createEconomyState(
  policy: BattleEconomyPolicy = LEGACY_ECONOMY_POLICY,
): EconomyState {
  const createAccount = (): FactionEconomyState => ({
    gold: policy.initialGold,
    recoveryProgress: 0,
    isFull: policy.initialGold >= policy.maximumGold,
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
  clockPolicy: MatchPolicy = MATCH_POLICIES.normal,
  economyPolicy: BattleEconomyPolicy = LEGACY_ECONOMY_POLICY,
): EconomyAdvanceResult {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { state, newlyFullFactions: [] };
  }
  if (economyPolicy.passiveIncome.kind === "disabled") {
    return { state, newlyFullFactions: [] };
  }

  const start = getMatchClock(elapsedSeconds, clockPolicy).elapsedSeconds;
  const end = getMatchClock(elapsedSeconds + deltaSeconds, clockPolicy).elapsedSeconds;
  if (end <= start) {
    return { state, newlyFullFactions: [] };
  }

  let accounts = state.accounts;
  const newlyFull = new Set<Faction>();
  for (const segment of splitRecoverySegments(start, end, clockPolicy)) {
    const nextAccounts = { ...accounts };
    for (const faction of FACTIONS) {
      const advanced = advanceAccount(
        accounts[faction],
        segment.seconds,
        economyPolicy.passiveIncome.normalRecoverySeconds / segment.multiplier,
        economyPolicy,
        economyPolicy.passiveIncome,
      );
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
  policy: BattleEconomyPolicy = LEGACY_ECONOMY_POLICY,
): SpendGoldResult {
  if (
    !Number.isInteger(amount)
    || amount <= 0
    || amount % policy.goldStep !== 0
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
          isFull: gold >= policy.maximumGold,
        },
      },
    },
  };
}

export function grantGold(
  state: EconomyState,
  faction: Faction,
  amount: number,
  policy: BattleEconomyPolicy = LEGACY_ECONOMY_POLICY,
): GrantGoldResult {
  if (!Number.isInteger(amount) || amount <= 0 || amount % policy.goldStep !== 0) {
    return {
      state,
      creditedAmount: 0,
      wastedAmount: 0,
      becameFull: false,
    };
  }
  const account = state.accounts[faction];
  const availableCapacity = Math.max(0, policy.maximumGold - account.gold);
  const creditedAmount = Math.min(amount, availableCapacity);
  const wastedAmount = amount - creditedAmount;
  const gold = account.gold + creditedAmount;
  const isFull = gold >= policy.maximumGold;
  const becameFull = isFull && !account.isFull;
  return {
    creditedAmount,
    wastedAmount,
    becameFull,
    state: {
      ...state,
      accounts: {
        ...state.accounts,
        [faction]: {
          ...account,
          gold,
          isFull,
          fullPromptSequence: account.fullPromptSequence + (becameFull ? 1 : 0),
        },
      },
    },
  };
}

export function getPassiveRecoveryWaitSeconds(
  goldGap: number,
  phase: GoldPhase,
  recoveryProgress = 0,
): number {
  if (!Number.isFinite(goldGap) || goldGap <= 0) return 0;
  const progress = Number.isFinite(recoveryProgress)
    ? clamp(recoveryProgress, 0, 1)
    : 0;
  const recoveryCount = Math.ceil(goldGap / GAME_RULES.economy.goldPerRecovery);
  const interval = phase === "double"
    ? GAME_RULES.economy.doubleRecoverySeconds
    : GAME_RULES.economy.normalRecoverySeconds;
  return Math.max(0, recoveryCount - progress) * interval;
}

interface RecoverySegment {
  readonly seconds: number;
  readonly multiplier: number;
}

function splitRecoverySegments(
  start: number,
  end: number,
  policy: MatchPolicy,
): RecoverySegment[] {
  const bonus = policy.finalBonus;
  if (
    policy.durationSeconds === null
    || bonus?.resource !== "gold"
  ) {
    return end > start ? [{ seconds: end - start, multiplier: 1 }] : [];
  }
  const boundary = policy.durationSeconds - bonus.startsAtRemainingSeconds;
  const segments: RecoverySegment[] = [];
  if (start < boundary) {
    const normalEnd = Math.min(end, boundary);
    if (normalEnd > start) segments.push({ seconds: normalEnd - start, multiplier: 1 });
  }
  const doubleStart = Math.max(start, boundary);
  if (end > doubleStart) {
    segments.push({ seconds: end - doubleStart, multiplier: bonus.multiplier });
  }
  return segments;
}

function advanceAccount(
  account: FactionEconomyState,
  seconds: number,
  interval: number,
  economyPolicy: BattleEconomyPolicy,
  passiveIncome: PeriodicPassiveIncomePolicy,
): { readonly account: FactionEconomyState; readonly becameFull: boolean } {
  const accumulated = account.recoveryProgress + seconds / interval;
  const recoveryCount = Math.floor(accumulated + PROGRESS_EPSILON);
  let recoveryProgress = accumulated - recoveryCount;
  if (Math.abs(recoveryProgress) < PROGRESS_EPSILON) recoveryProgress = 0;
  const gold = Math.min(
    economyPolicy.maximumGold,
    account.gold + recoveryCount * passiveIncome.goldPerRecovery,
  );
  const isFull = gold >= economyPolicy.maximumGold;
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
