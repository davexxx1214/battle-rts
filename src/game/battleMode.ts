import {
  GAME_RULES,
  MATCH_POLICIES,
  type BattleMatchMode,
  type MatchPolicy,
  type TroopKind,
} from "./rules";
import { SANDBOX_LARGE_BATTLEFIELD_ID } from "../map/sandboxLargeBattlefield";
import { LEGACY_BATTLEFIELD_ID } from "../map/battlefieldDefinition";

export type BattleModeId = BattleMatchMode;

export const DEFAULT_LEGACY_MAP_ID = LEGACY_BATTLEFIELD_ID;

export interface PeriodicPassiveIncomePolicy {
  readonly kind: "periodic";
  readonly goldPerRecovery: number;
  readonly normalRecoverySeconds: number;
  readonly doubleRecoverySeconds: number;
}

export interface DisabledPassiveIncomePolicy {
  readonly kind: "disabled";
}

export type PassiveIncomePolicy =
  | PeriodicPassiveIncomePolicy
  | DisabledPassiveIncomePolicy;

export interface BattleEconomyPolicy {
  readonly initialGold: number;
  readonly maximumGold: number;
  /** Smallest valid wallet transaction. */
  readonly goldStep: number;
  readonly passiveIncome: PassiveIncomePolicy;
}

export interface PopulationIncomeBand {
  readonly maximumPopulation: number;
  readonly multiplier: number;
}

export type PopulationPolicy =
  | {
    readonly kind: "unlimited";
    readonly incomeMultiplier: 1;
  }
  | {
    readonly kind: "capped";
    readonly maximumPopulation: number;
    readonly troopCosts: Readonly<Record<TroopKind, number>>;
    readonly populationIncomeBands: readonly PopulationIncomeBand[];
  };

export interface BuildingLifecyclePolicy {
  readonly naturalDecay: "enabled" | "disabled";
  readonly construction: "instant" | "timed";
  readonly repair: "disabled";
}

export type UnitAcquisitionPolicy =
  | { readonly kind: "direct-deployment" }
  | { readonly kind: "production-buildings" };

export type ProductionPolicy =
  | { readonly kind: "legacy-auto-spawn" }
  | {
    readonly kind: "building-queue";
    readonly queueDiscipline: "fifo";
    readonly maximumQueueLength: number;
    readonly reservesPopulation: true;
    readonly blockedExit: "wait";
  };

export type ControlAuthorityPolicy =
  | { readonly kind: "automatic" }
  | { readonly kind: "issued-orders" };

export type OpponentPolicy =
  | { readonly kind: "legacy-deployment-ai" }
  | { readonly kind: "sandbox-rts-ai" };

export type VictoryPolicy =
  | { readonly kind: "clock-and-castle" }
  | { readonly kind: "castle-only" }
  | { readonly kind: "castle-and-resource-stalemate" };

export type BattleUiLayoutPolicy =
  | { readonly kind: "deployment-rail" }
  | { readonly kind: "sandbox-rts" };

export interface BattleModeDefinition {
  readonly id: BattleModeId;
  readonly defaultMapId: string;
  readonly clockPolicy: MatchPolicy;
  readonly economyPolicy: BattleEconomyPolicy;
  readonly populationPolicy: PopulationPolicy;
  readonly buildingLifecyclePolicy: BuildingLifecyclePolicy;
  readonly acquisitionPolicy: UnitAcquisitionPolicy;
  readonly productionPolicy: ProductionPolicy;
  readonly controlAuthority: ControlAuthorityPolicy;
  readonly opponentPolicy: OpponentPolicy;
  readonly victoryPolicy: VictoryPolicy;
  readonly uiLayout: BattleUiLayoutPolicy;
}

export const LEGACY_ECONOMY_POLICY: BattleEconomyPolicy = Object.freeze({
  initialGold: GAME_RULES.economy.initialGold,
  maximumGold: GAME_RULES.economy.maximumGold,
  goldStep: 100,
  passiveIncome: Object.freeze({
    kind: "periodic",
    goldPerRecovery: GAME_RULES.economy.goldPerRecovery,
    normalRecoverySeconds: GAME_RULES.economy.normalRecoverySeconds,
    doubleRecoverySeconds: GAME_RULES.economy.doubleRecoverySeconds,
  }),
});

export const SANDBOX_ECONOMY_POLICY: BattleEconomyPolicy = Object.freeze({
  initialGold: 1_000,
  maximumGold: 5_000,
  goldStep: 20,
  passiveIncome: Object.freeze({ kind: "disabled" }),
});

const LEGACY_POPULATION_POLICY: PopulationPolicy = Object.freeze({
  kind: "unlimited",
  incomeMultiplier: 1,
});

const SANDBOX_POPULATION_POLICY: PopulationPolicy = Object.freeze({
  kind: "capped",
  maximumPopulation: 100,
  troopCosts: Object.freeze({
    spearman: 2,
    swordsman: 3,
    archer: 2,
    mage: 2,
    catapult: 3,
  }),
  populationIncomeBands: Object.freeze([
    Object.freeze({ maximumPopulation: 50, multiplier: 1 }),
    Object.freeze({ maximumPopulation: 80, multiplier: 0.8 }),
    Object.freeze({ maximumPopulation: 100, multiplier: 0.6 }),
  ]),
});

const LEGACY_BUILDING_LIFECYCLE_POLICY: BuildingLifecyclePolicy = Object.freeze({
  naturalDecay: "enabled",
  construction: "instant",
  repair: "disabled",
});

const SANDBOX_BUILDING_LIFECYCLE_POLICY: BuildingLifecyclePolicy = Object.freeze({
  naturalDecay: "disabled",
  construction: "timed",
  repair: "disabled",
});

const LEGACY_ACQUISITION_POLICY: UnitAcquisitionPolicy = Object.freeze({
  kind: "direct-deployment",
});
const SANDBOX_ACQUISITION_POLICY: UnitAcquisitionPolicy = Object.freeze({
  kind: "production-buildings",
});

const LEGACY_PRODUCTION_POLICY: ProductionPolicy = Object.freeze({
  kind: "legacy-auto-spawn",
});
const SANDBOX_PRODUCTION_POLICY: ProductionPolicy = Object.freeze({
  kind: "building-queue",
  queueDiscipline: "fifo",
  maximumQueueLength: 3,
  reservesPopulation: true,
  blockedExit: "wait",
});

const LEGACY_CONTROL_AUTHORITY: ControlAuthorityPolicy = Object.freeze({
  kind: "automatic",
});
const SANDBOX_CONTROL_AUTHORITY: ControlAuthorityPolicy = Object.freeze({
  kind: "issued-orders",
});

const LEGACY_OPPONENT_POLICY: OpponentPolicy = Object.freeze({
  kind: "legacy-deployment-ai",
});
const SANDBOX_OPPONENT_POLICY: OpponentPolicy = Object.freeze({
  kind: "sandbox-rts-ai",
});

const CLOCK_AND_CASTLE_VICTORY_POLICY: VictoryPolicy = Object.freeze({
  kind: "clock-and-castle",
});
const CASTLE_ONLY_VICTORY_POLICY: VictoryPolicy = Object.freeze({
  kind: "castle-only",
});
const SANDBOX_VICTORY_POLICY: VictoryPolicy = Object.freeze({
  kind: "castle-and-resource-stalemate",
});

const LEGACY_UI_LAYOUT: BattleUiLayoutPolicy = Object.freeze({
  kind: "deployment-rail",
});
const SANDBOX_UI_LAYOUT: BattleUiLayoutPolicy = Object.freeze({
  kind: "sandbox-rts",
});

export const BATTLE_MODE_DEFINITIONS: Readonly<
  Record<BattleModeId, BattleModeDefinition>
> = Object.freeze({
  campaign: Object.freeze({
    id: "campaign",
    defaultMapId: DEFAULT_LEGACY_MAP_ID,
    clockPolicy: MATCH_POLICIES.campaign,
    economyPolicy: LEGACY_ECONOMY_POLICY,
    populationPolicy: LEGACY_POPULATION_POLICY,
    buildingLifecyclePolicy: LEGACY_BUILDING_LIFECYCLE_POLICY,
    acquisitionPolicy: LEGACY_ACQUISITION_POLICY,
    productionPolicy: LEGACY_PRODUCTION_POLICY,
    controlAuthority: LEGACY_CONTROL_AUTHORITY,
    opponentPolicy: LEGACY_OPPONENT_POLICY,
    victoryPolicy: CLOCK_AND_CASTLE_VICTORY_POLICY,
    uiLayout: LEGACY_UI_LAYOUT,
  }),
  normal: Object.freeze({
    id: "normal",
    defaultMapId: DEFAULT_LEGACY_MAP_ID,
    clockPolicy: MATCH_POLICIES.normal,
    economyPolicy: LEGACY_ECONOMY_POLICY,
    populationPolicy: LEGACY_POPULATION_POLICY,
    buildingLifecyclePolicy: LEGACY_BUILDING_LIFECYCLE_POLICY,
    acquisitionPolicy: LEGACY_ACQUISITION_POLICY,
    productionPolicy: LEGACY_PRODUCTION_POLICY,
    controlAuthority: LEGACY_CONTROL_AUTHORITY,
    opponentPolicy: LEGACY_OPPONENT_POLICY,
    victoryPolicy: CLOCK_AND_CASTLE_VICTORY_POLICY,
    uiLayout: LEGACY_UI_LAYOUT,
  }),
  arena: Object.freeze({
    id: "arena",
    defaultMapId: DEFAULT_LEGACY_MAP_ID,
    clockPolicy: MATCH_POLICIES.arena,
    economyPolicy: LEGACY_ECONOMY_POLICY,
    populationPolicy: LEGACY_POPULATION_POLICY,
    buildingLifecyclePolicy: LEGACY_BUILDING_LIFECYCLE_POLICY,
    acquisitionPolicy: LEGACY_ACQUISITION_POLICY,
    productionPolicy: LEGACY_PRODUCTION_POLICY,
    controlAuthority: LEGACY_CONTROL_AUTHORITY,
    opponentPolicy: LEGACY_OPPONENT_POLICY,
    victoryPolicy: CLOCK_AND_CASTLE_VICTORY_POLICY,
    uiLayout: LEGACY_UI_LAYOUT,
  }),
  infinite: Object.freeze({
    id: "infinite",
    defaultMapId: DEFAULT_LEGACY_MAP_ID,
    clockPolicy: MATCH_POLICIES.infinite,
    economyPolicy: LEGACY_ECONOMY_POLICY,
    populationPolicy: LEGACY_POPULATION_POLICY,
    buildingLifecyclePolicy: LEGACY_BUILDING_LIFECYCLE_POLICY,
    acquisitionPolicy: LEGACY_ACQUISITION_POLICY,
    productionPolicy: LEGACY_PRODUCTION_POLICY,
    controlAuthority: LEGACY_CONTROL_AUTHORITY,
    opponentPolicy: LEGACY_OPPONENT_POLICY,
    victoryPolicy: CASTLE_ONLY_VICTORY_POLICY,
    uiLayout: LEGACY_UI_LAYOUT,
  }),
  sandbox: Object.freeze({
    id: "sandbox",
    defaultMapId: SANDBOX_LARGE_BATTLEFIELD_ID,
    clockPolicy: MATCH_POLICIES.sandbox,
    economyPolicy: SANDBOX_ECONOMY_POLICY,
    populationPolicy: SANDBOX_POPULATION_POLICY,
    buildingLifecyclePolicy: SANDBOX_BUILDING_LIFECYCLE_POLICY,
    acquisitionPolicy: SANDBOX_ACQUISITION_POLICY,
    productionPolicy: SANDBOX_PRODUCTION_POLICY,
    controlAuthority: SANDBOX_CONTROL_AUTHORITY,
    opponentPolicy: SANDBOX_OPPONENT_POLICY,
    victoryPolicy: SANDBOX_VICTORY_POLICY,
    uiLayout: SANDBOX_UI_LAYOUT,
  }),
});

export function battleModeDefinitionFor(id: BattleModeId): BattleModeDefinition {
  const definition = (BATTLE_MODE_DEFINITIONS as Readonly<
    Record<string, BattleModeDefinition | undefined>
  >)[id];
  if (!definition) throw new Error(`Unknown battle mode: ${String(id)}`);
  return definition;
}

export function populationIncomeMultiplier(
  mode: BattleModeId,
  usedPopulation: number,
): number {
  if (!Number.isFinite(usedPopulation) || usedPopulation < 0) {
    throw new RangeError("usedPopulation must be a finite, non-negative number");
  }
  const policy = battleModeDefinitionFor(mode).populationPolicy;
  if (policy.kind === "unlimited") return policy.incomeMultiplier;
  return policy.populationIncomeBands.find(
    (band) => usedPopulation <= band.maximumPopulation,
  )?.multiplier
    ?? policy.populationIncomeBands[policy.populationIncomeBands.length - 1].multiplier;
}
