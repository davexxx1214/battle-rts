import { createInitialBattle, stepBattle, type BattleState } from "./battle";
import type { BattleSessionState } from "./battleSessionState";
import { deployBattleSessionEntity } from "./deployTransaction";
import { getPassiveRecoveryWaitSeconds } from "./economy";
import {
  deploymentCostForRace,
  GAME_RULES,
  TROOP_KINDS,
  troopCountForRace,
  unitRoleForRace,
  unitSpecFor,
  type TroopKind,
} from "./rules";
import { createFactionRaces } from "./factions";
import type { BattleRace, Faction, FactionRaces } from "./types";
import { BATTLEFIELD_MAP, axialToWorld } from "../map/battlefield";

export type ArenaLane = "west" | "east" | "alternating";

export interface BalanceArenaMatchConfig {
  readonly verdant: TroopKind;
  readonly crimson: TroopKind;
  readonly initialGold?: number;
  readonly durationSeconds?: number;
  readonly deploymentIntervalSeconds?: number;
  readonly lane?: ArenaLane;
  readonly factionRaces?: Partial<FactionRaces>;
}

export interface FactionArenaTotals {
  readonly verdant: number;
  readonly crimson: number;
}

export interface BalanceArenaMatchResult {
  readonly strategies: Readonly<Record<Faction, TroopKind>>;
  readonly winner: Faction | "draw";
  readonly elapsedSeconds: number;
  readonly spentGold: FactionArenaTotals;
  readonly deployments: FactionArenaTotals;
  readonly spawnedUnits: FactionArenaTotals;
  readonly livingUnits: FactionArenaTotals;
  readonly remainingUnitHealth: FactionArenaTotals;
  readonly troopDamage: FactionArenaTotals;
  readonly castleDamage: FactionArenaTotals;
  readonly castleHealth: FactionArenaTotals;
}

export interface ArenaTroopSummary {
  readonly kind: TroopKind;
  readonly matches: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly spentGold: number;
  readonly spawnedUnits: number;
  readonly livingUnits: number;
  readonly troopDamagePer100Gold: number;
  readonly castleDamagePer100Gold: number;
  readonly totalDamagePer100Gold: number;
  readonly survivalRate: number;
}

export interface TroopBalanceProfile {
  readonly race: BattleRace;
  readonly kind: TroopKind;
  readonly cost: number;
  readonly squadSize: number;
  readonly additionalRecoveryWaitSeconds: number;
  readonly attackRange: number;
  readonly splashRadius: number;
  readonly damageReductionPercent: number;
  readonly totalHealthPer100Gold: number;
  readonly effectiveHealthPer100Gold: number;
  readonly singleTargetDpsPer100Gold: number;
}

const FACTIONS = ["verdant", "crimson"] as const;
const SIMULATION_STEP_SECONDS = 0.1;
const TIME_EPSILON = 1e-9;

export function runBalanceArenaMatch(
  config: BalanceArenaMatchConfig,
): BalanceArenaMatchResult {
  const durationSeconds = positiveArenaParameter(
    config.durationSeconds,
    GAME_RULES.match.durationSeconds,
    "durationSeconds",
  );
  const deploymentIntervalSeconds = positiveArenaParameter(
    config.deploymentIntervalSeconds,
    1,
    "deploymentIntervalSeconds",
  );
  const initialGold = validateInitialGold(config.initialGold ?? GAME_RULES.economy.maximumGold);
  const strategies = { verdant: config.verdant, crimson: config.crimson } as const;
  const factionRaces = createFactionRaces(config.factionRaces);
  const lane = config.lane ?? "alternating";
  const spentGold = mutableTotals();
  const deployments = mutableTotals();
  const troopDamage = mutableTotals();
  const castleDamage = mutableTotals();
  let session: BattleSessionState = {
    phase: "engaged",
    battle: withInitialGold(createInitialBattle({ factionRaces }), initialGold),
  };
  let nextDeploymentAt = 0;
  let lastEventSequence = -1;

  while (
    session.battle.winner === null
    && session.battle.matchElapsed + TIME_EPSILON < durationSeconds
  ) {
    if (session.battle.matchElapsed + TIME_EPSILON >= nextDeploymentAt) {
      for (const faction of FACTIONS) {
        const kind = strategies[faction];
        const result = deployBattleSessionEntity(session, {
          faction,
          kind,
          worldPosition: deploymentPosition(faction, lane, deployments[faction]),
        });
        if (!result.ok) continue;
        session = result.state;
        spentGold[faction] += deploymentCostForRace(kind, factionRaces[faction]);
        deployments[faction] += 1;
      }
      nextDeploymentAt += deploymentIntervalSeconds;
    }

    const previousCastleHealth = castleHealth(session.battle);
    const remaining = durationSeconds - session.battle.matchElapsed;
    session = {
      ...session,
      battle: stepBattle(session.battle, Math.min(SIMULATION_STEP_SECONDS, remaining)),
    };
    const nextCastleHealth = castleHealth(session.battle);
    castleDamage.verdant += Math.max(0, previousCastleHealth.crimson - nextCastleHealth.crimson);
    castleDamage.crimson += Math.max(0, previousCastleHealth.verdant - nextCastleHealth.verdant);

    for (const event of session.battle.events) {
      if (event.sequence <= lastEventSequence || event.type !== "damage-applied") continue;
      if (event.sourceRole === "castle" || event.targetType !== "unit") continue;
      const source = session.battle.units.find((unit) => unit.id === event.sourceId);
      if (source) troopDamage[source.faction] += event.amount;
    }
    lastEventSequence = Math.max(
      lastEventSequence,
      ...session.battle.events.map((event) => event.sequence),
    );
  }

  const spawnedUnits = countUnits(session.battle, () => true);
  const livingUnits = countUnits(session.battle, (health) => health > 0);
  const remainingUnitHealth = sumUnitHealth(session.battle);
  const finalCastleHealth = castleHealth(session.battle);
  return {
    strategies,
    winner: session.battle.winner ?? "draw",
    elapsedSeconds: round(session.battle.matchElapsed),
    spentGold: freezeTotals(spentGold),
    deployments: freezeTotals(deployments),
    spawnedUnits,
    livingUnits,
    remainingUnitHealth,
    troopDamage: roundTotals(troopDamage),
    castleDamage: roundTotals(castleDamage),
    castleHealth: roundTotals(finalCastleHealth),
  };
}

export function summarizeBalanceArena(
  results: readonly BalanceArenaMatchResult[],
): readonly ArenaTroopSummary[] {
  return troopKindsByCost().map((kind) => {
    const totals = {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      spentGold: 0,
      spawnedUnits: 0,
      livingUnits: 0,
      troopDamage: 0,
      castleDamage: 0,
    };
    for (const result of results) {
      for (const faction of FACTIONS) {
        if (result.strategies[faction] !== kind) continue;
        totals.matches += 1;
        totals.wins += Number(result.winner === faction);
        totals.draws += Number(result.winner === "draw");
        totals.losses += Number(result.winner !== faction && result.winner !== "draw");
        totals.spentGold += result.spentGold[faction];
        totals.spawnedUnits += result.spawnedUnits[faction];
        totals.livingUnits += result.livingUnits[faction];
        totals.troopDamage += result.troopDamage[faction];
        totals.castleDamage += result.castleDamage[faction];
      }
    }
    const per100Gold = totals.spentGold > 0 ? 100 / totals.spentGold : 0;
    return {
      kind,
      matches: totals.matches,
      wins: totals.wins,
      draws: totals.draws,
      losses: totals.losses,
      spentGold: totals.spentGold,
      spawnedUnits: totals.spawnedUnits,
      livingUnits: totals.livingUnits,
      troopDamagePer100Gold: round(totals.troopDamage * per100Gold),
      castleDamagePer100Gold: round(totals.castleDamage * per100Gold),
      totalDamagePer100Gold: round(
        (totals.troopDamage + totals.castleDamage) * per100Gold,
      ),
      survivalRate: totals.spawnedUnits > 0
        ? round(totals.livingUnits / totals.spawnedUnits)
        : 0,
    };
  });
}

export function getTroopBalanceProfiles(
  race: BattleRace = "human",
): readonly TroopBalanceProfile[] {
  const cheapestTroopCost = Math.min(
    ...TROOP_KINDS.map((kind) => deploymentCostForRace(kind, race)),
  );
  return troopKindsByCost(race).map((kind) => {
    const role = unitRoleForRace(kind, race);
    const spec = unitSpecFor(role, race);
    const cost = deploymentCostForRace(kind, race);
    const squadSize = troopCountForRace(kind, race);
    const per100Gold = 100 / cost;
    const totalHealth = spec.maxHealth * squadSize;
    return {
      race,
      kind,
      cost,
      squadSize,
      additionalRecoveryWaitSeconds: round(
        getPassiveRecoveryWaitSeconds(cost - cheapestTroopCost, "normal"),
      ),
      attackRange: spec.attackRange,
      splashRadius: spec.splashRadius,
      damageReductionPercent: round(spec.damageReduction * 100),
      totalHealthPer100Gold: round(totalHealth * per100Gold),
      effectiveHealthPer100Gold: round(
        totalHealth / (1 - spec.damageReduction) * per100Gold,
      ),
      singleTargetDpsPer100Gold: round(
        spec.damage / spec.attackCooldown * squadSize * per100Gold,
      ),
    };
  });
}

function withInitialGold(state: BattleState, gold: number): BattleState {
  return {
    ...state,
    economy: {
      ...state.economy,
      accounts: {
        verdant: {
          ...state.economy.accounts.verdant,
          gold,
          isFull: gold === GAME_RULES.economy.maximumGold,
        },
        crimson: {
          ...state.economy.accounts.crimson,
          gold,
          isFull: gold === GAME_RULES.economy.maximumGold,
        },
      },
    },
  };
}

function deploymentPosition(
  faction: Faction,
  lane: ArenaLane,
  deploymentCount: number,
) {
  const bridgeId = lane === "alternating"
    ? deploymentCount % 2 === 0 ? "west" : "east"
    : lane;
  const bridge = BATTLEFIELD_MAP.bridges.find((candidate) => candidate.id === bridgeId);
  if (!bridge) throw new Error(`Arena requires the ${bridgeId} bridge.`);
  return axialToWorld(bridge.landings[faction][0]);
}

function castleHealth(state: BattleState): { verdant: number; crimson: number } {
  return {
    verdant: state.buildings.find((building) => (
      building.kind === "castle" && building.faction === "verdant"
    ))?.health ?? 0,
    crimson: state.buildings.find((building) => (
      building.kind === "castle" && building.faction === "crimson"
    ))?.health ?? 0,
  };
}

function countUnits(
  state: BattleState,
  predicate: (health: number) => boolean,
): FactionArenaTotals {
  return {
    verdant: state.units.filter((unit) => unit.faction === "verdant" && predicate(unit.health)).length,
    crimson: state.units.filter((unit) => unit.faction === "crimson" && predicate(unit.health)).length,
  };
}

function sumUnitHealth(state: BattleState): FactionArenaTotals {
  return {
    verdant: round(state.units.filter((unit) => unit.faction === "verdant")
      .reduce((total, unit) => total + unit.health, 0)),
    crimson: round(state.units.filter((unit) => unit.faction === "crimson")
      .reduce((total, unit) => total + unit.health, 0)),
  };
}

function mutableTotals(): { verdant: number; crimson: number } {
  return { verdant: 0, crimson: 0 };
}

function freezeTotals(totals: { verdant: number; crimson: number }): FactionArenaTotals {
  return { verdant: totals.verdant, crimson: totals.crimson };
}

function roundTotals(totals: { verdant: number; crimson: number }): FactionArenaTotals {
  return { verdant: round(totals.verdant), crimson: round(totals.crimson) };
}

function validateInitialGold(gold: number): number {
  if (
    !Number.isFinite(gold)
    || gold < 0
    || gold > GAME_RULES.economy.maximumGold
  ) throw new Error("Arena initialGold must be between zero and the configured maximum.");
  return gold;
}

function positiveArenaParameter(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Arena ${name} must be positive.`);
  }
  return value;
}

function troopKindsByCost(race: BattleRace = "human"): readonly TroopKind[] {
  return [...TROOP_KINDS].sort((first, second) => (
    deploymentCostForRace(first, race) - deploymentCostForRace(second, race)
    || first.localeCompare(second)
  ));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
