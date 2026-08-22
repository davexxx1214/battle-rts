import {
  axialToWorld,
  hexDistance,
  worldToAxial,
  type HexCoordinate,
} from "../map/battlefield";
import type {
  BattlefieldBuildAnchor,
  BattlefieldDefinition,
  BattlefieldMinePitDefinition,
  BattlefieldRouteDefinition,
} from "../map/battlefieldDefinition";
import type { BattleState, BattleUnit } from "./battle";
import {
  SANDBOX_POPULATION_CAP,
  SANDBOX_POPULATION_INCOME_BANDS,
} from "./battleMode";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import {
  battleBuildingConstructionPhaseAt,
  type BattleBuilding,
} from "./buildings";
import {
  SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH,
  sandboxProductionPopulation,
  sandboxProductionQueueFor,
} from "./sandboxProductionQueue";
import {
  SANDBOX_TROOP_SLOTS,
  sandboxBuildingSpec,
  sandboxTroopSpec,
  type SandboxBuildingSlot,
  type SandboxProductionBuildingSlot,
  type SandboxTroopSlot,
} from "./sandboxCatalog";
import {
  previewSandboxBuildingConstruction,
  startSandboxBuildingConstruction,
} from "./sandboxBattleTransactions";
import {
  enqueueSandboxBattleProduction,
  setSandboxBattleRallyPoint,
} from "./sandboxProductionTransactions";
import {
  issueSandboxSquadOrder,
  sandboxSquadOrderFor,
} from "./sandboxOrders";
import { sandboxUsedPopulation } from "./population";
import type { Faction, WorldPoint } from "./types";

export const SANDBOX_AI_FACTION = "crimson" as const;
export const SANDBOX_AI_FIRST_DECISION_SECONDS = 1;
export const SANDBOX_AI_DECISION_INTERVAL_SECONDS = 1;
export const SANDBOX_AI_FAILURE_RETRY_SECONDS = 3;
export const SANDBOX_AI_LEDGER_LIMIT = 512;

export type SandboxOpponentAiPhase =
  | "opening"
  | "economy"
  | "tech"
  | "produce"
  | "rally"
  | "defend"
  | "attack"
  | "recovery";

export type SandboxOpponentAiAction =
  | "construct-mine"
  | "construct-building"
  | "set-rally-point"
  | "enqueue-production"
  | "capture-mine"
  | "defend"
  | "attack-wave"
  | "assault"
  | "resume-attack";

export interface SandboxOpponentAiCaptureObjective {
  readonly kind: "capture-mine";
  readonly pitId: string;
  readonly squadId: string;
  readonly destination: WorldPoint;
}

export interface SandboxOpponentAiAttackObjective {
  readonly kind: "attack-route";
  readonly routeId: string;
  readonly squadIds: readonly string[];
  readonly destination: WorldPoint;
}

export type SandboxOpponentAiObjective =
  | SandboxOpponentAiCaptureObjective
  | SandboxOpponentAiAttackObjective;

export interface SandboxOpponentAiLedgerEntry {
  readonly sequence: number;
  readonly decidedAt: number;
  readonly phase: SandboxOpponentAiPhase;
  readonly action: SandboxOpponentAiAction;
  readonly subjectId: string;
  readonly outcome: "succeeded" | "failed";
  readonly reason: string | null;
  readonly goldBefore: number;
  readonly goldAfter: number;
  readonly remainingOreBefore: number;
  readonly remainingOreAfter: number;
  readonly livingPopulationBefore: number;
  readonly livingPopulationAfter: number;
  readonly reservedPopulationBefore: number;
  readonly reservedPopulationAfter: number;
  readonly queuedOrdersBefore: number;
  readonly queuedOrdersAfter: number;
  readonly squadOrderSequenceBefore: number;
  readonly squadOrderSequenceAfter: number;
}

export interface SandboxOpponentAiState {
  readonly phase: SandboxOpponentAiPhase;
  readonly phaseChangedAt: number;
  readonly decisionSequence: number;
  readonly actionSequence: number;
  readonly productionCursor: number;
  readonly routeCursor: number;
  readonly retryNotBefore: number;
  readonly lastFailureAction: SandboxOpponentAiAction | null;
  readonly lastFailureReason: string | null;
  readonly repeatedFailureCount: number;
  readonly objective: SandboxOpponentAiObjective | null;
  readonly ledger: readonly SandboxOpponentAiLedgerEntry[];
}

interface MutableAiState {
  phase: SandboxOpponentAiPhase;
  phaseChangedAt: number;
  decisionSequence: number;
  actionSequence: number;
  productionCursor: number;
  routeCursor: number;
  retryNotBefore: number;
  lastFailureAction: SandboxOpponentAiAction | null;
  lastFailureReason: string | null;
  repeatedFailureCount: number;
  objective: SandboxOpponentAiObjective | null;
  ledger: SandboxOpponentAiLedgerEntry[];
}

interface AiSnapshot {
  readonly gold: number;
  readonly remainingOre: number;
  readonly livingPopulation: number;
  readonly reservedPopulation: number;
  readonly queuedOrders: number;
  readonly squadOrderSequence: number;
}

interface AiActionResult {
  readonly battle: BattleState;
  readonly action: SandboxOpponentAiAction;
  readonly subjectId: string;
  readonly ok: boolean;
  readonly reason: string | null;
}

const TECH_ORDER: readonly Exclude<
  SandboxProductionBuildingSlot,
  "barracks"
>[] = Object.freeze(["archery-range", "mage-tower", "siege-workshop"]);
const FACTION: Faction = SANDBOX_AI_FACTION;
const DESIRED_MINE_COUNT = 4;
export const SANDBOX_AI_ATTACK_WAVE_MINIMUM_UNITS = 3;
export const SANDBOX_AI_ATTACK_WAVE_MINIMUM_POPULATION = 10;
const DEFENSE_CASTLE_RADIUS = 10;
const DEFENSE_BUILDING_RADIUS = 5;
const ROUTE_ARRIVAL_RADIUS = 3;

export function createSandboxOpponentAiState(): SandboxOpponentAiState {
  return freezeState({
    phase: "opening",
    phaseChangedAt: 0,
    decisionSequence: 0,
    actionSequence: 0,
    productionCursor: 0,
    routeCursor: 0,
    retryNotBefore: 0,
    lastFailureAction: null,
    lastFailureReason: null,
    repeatedFailureCount: 0,
    objective: null,
    ledger: [],
  });
}

/**
 * Runs one deterministic sandbox AI decision. Every mutation goes through the
 * same authoritative transactions used by the player UI.
 */
export function advanceSandboxOpponentAi(battle: BattleState): BattleState {
  if (
    battle.modeId !== "sandbox"
    || battle.winner !== null
    || battle.resolvedAt !== null
  ) return battle;
  const runtime = resolveBattleRuntimeContext(battle);
  if (runtime.mode.opponentPolicy.kind !== "sandbox-rts-ai") return battle;

  const previous = battle.sandboxAi ?? createSandboxOpponentAiState();
  const ai = mutableState(previous);
  ai.decisionSequence += 1;
  if (battle.matchElapsed + 1e-9 < ai.retryNotBefore) {
    return attachState(battle, ai);
  }

  const threat = nearestThreat(battle, runtime.battlefield);
  if (threat) {
    setPhase(ai, "defend", battle.matchElapsed);
    const squads = livingSquadIds(battle, FACTION);
    if (squads.length > 0) {
      const alreadyDefending = squads.every((squadId) => {
        const order = battle.squadOrders
          ? sandboxSquadOrderFor(battle.squadOrders, squadId)
          : null;
        return order?.kind === "attack"
          && order.target?.targetType === threat.targetType
          && order.target.targetId === threat.id;
      });
      if (alreadyDefending) {
        const guardTowerCount = livingBuildings(battle, FACTION).filter((building) => (
          building.kind === "guard-tower"
        )).length;
        const hasBarracks = livingBuildings(battle, FACTION).some((building) => (
          building.kind === "barracks"
          && battleBuildingConstructionPhaseAt(building, battle.matchElapsed) === "operational"
        ));
        if (
          guardTowerCount < 2
          && hasBarracks
          && battle.economy.accounts[FACTION].gold >= sandboxBuildingSpec("guard-tower").cost
        ) {
          const tower = attemptOrdinaryConstruction(
            battle,
            runtime.battlefield,
            "guard-tower",
          );
          if (tower) return settleAction(battle, ai, tower);
        }
        return attachState(battle, ai);
      }
      return settleAction(battle, ai, orderAttack(
        battle,
        squads,
        threat.targetType,
        threat.id,
        "defend",
      ));
    }
  }

  if (ai.phase === "defend") {
    const squads = livingSquadIds(battle, FACTION);
    if (squads.length > 0) {
      setPhase(ai, "attack", battle.matchElapsed);
      const result = orderAttackMove(
        battle,
        squads,
        enemyApproach(runtime.battlefield),
        "resume-attack",
        "verdant-gate",
      );
      return settleAction(battle, ai, result);
    }
  }

  const objectiveAction = advanceObjective(battle, ai, runtime.battlefield);
  if (objectiveAction) return settleAction(battle, ai, objectiveAction);

  const buildings = livingBuildings(battle, FACTION);
  const mines = buildings.filter((building) => building.kind === "gold-mine");
  const productiveMineIds = new Set(
    battle.mining
      ? Object.values(battle.mining.pitsById).flatMap((pit) => (
          pit.remainingOre > 0 && pit.occupyingMineId !== null
            ? [pit.occupyingMineId]
            : []
        ))
      : [],
  );
  const productiveMineCount = mines.filter((mine) => productiveMineIds.has(mine.id)).length;
  const barracks = buildings.find((building) => building.kind === "barracks");

  if (mines.length === 0) {
    setPhase(ai, battle.economy.accounts[FACTION].gold < sandboxBuildingSpec("mine").cost
      ? "recovery"
      : "opening", battle.matchElapsed);
    const mine = attemptControlledMineConstruction(battle, runtime.battlefield);
    return mine ? settleAction(battle, ai, mine) : attachState(battle, ai);
  }
  if (!barracks) {
    setPhase(ai, "opening", battle.matchElapsed);
    const construction = attemptOrdinaryConstruction(
      battle,
      runtime.battlefield,
      "barracks",
    );
    return construction
      ? settleAction(battle, ai, construction)
      : attachState(battle, ai);
  }

  const population = sandboxUsedPopulation(battle.units, FACTION);
  const queuePopulation = battle.production
    ? sandboxProductionPopulation(battle.production, FACTION)
    : { reservedPopulation: 0, readyBlockedPopulation: 0, totalQueuePopulation: 0 };
  if (
    population === 0
    && queuePopulation.totalQueuePopulation === 0
    && battleBuildingConstructionPhaseAt(barracks, battle.matchElapsed) === "operational"
  ) {
    setPhase(ai, "produce", battle.matchElapsed);
    return settleAction(battle, ai, enqueueTroop(battle, barracks, "spearman"));
  }

  if (productiveMineCount < 2) {
    setPhase(ai, "economy", battle.matchElapsed);
    const mine = attemptControlledMineConstruction(battle, runtime.battlefield);
    if (mine) return settleAction(battle, ai, mine);
  }

  const expansion = beginMineExpansion(
    battle,
    ai,
    runtime.battlefield,
    productiveMineCount,
  );
  if (expansion) return settleAction(battle, ai, expansion);

  for (const slot of TECH_ORDER) {
    if (buildings.some((building) => building.kind === slot)) continue;
    setPhase(ai, "tech", battle.matchElapsed);
    if (battle.economy.accounts[FACTION].gold < sandboxBuildingSpec(slot).cost) {
      return attachState(battle, ai);
    }
    const construction = attemptOrdinaryConstruction(battle, runtime.battlefield, slot);
    return construction
      ? settleAction(battle, ai, construction)
      : attachState(battle, ai);
  }

  const rally = ensureProductionRallyPoint(battle, runtime.battlefield);
  if (rally) {
    setPhase(ai, "rally", battle.matchElapsed);
    return settleAction(battle, ai, rally);
  }

  const wave = beginAttackWave(battle, ai, runtime.battlefield);
  if (wave) {
    setPhase(ai, "attack", battle.matchElapsed);
    return settleAction(battle, ai, wave);
  }

  const committedPopulation = population + queuePopulation.totalQueuePopulation;
  const targetPopulation = sandboxAiPopulationTarget(productiveMineCount, false);
  if (committedPopulation < targetPopulation) {
    setPhase(ai, "produce", battle.matchElapsed);
    const production = attemptProduction(battle, ai, targetPopulation);
    if (production) return settleAction(battle, ai, production);
  }

  setPhase(
    ai,
    population >= SANDBOX_AI_ATTACK_WAVE_MINIMUM_POPULATION ? "attack" : "rally",
    battle.matchElapsed,
  );
  return attachState(battle, ai);
}

/** Stable population targets deliberately stop at the two maintenance thresholds. */
export function sandboxAiPopulationTarget(
  activeMineCount: number,
  defending: boolean,
): number {
  if (defending) return SANDBOX_POPULATION_CAP;
  if (activeMineCount >= 4) {
    return SANDBOX_POPULATION_INCOME_BANDS[1]!.maximumPopulation;
  }
  if (activeMineCount >= 2) {
    return SANDBOX_POPULATION_INCOME_BANDS[0]!.maximumPopulation;
  }
  return 12;
}

function advanceObjective(
  battle: BattleState,
  ai: MutableAiState,
  battlefield: BattlefieldDefinition,
): AiActionResult | null {
  const objective = ai.objective;
  if (!objective) return null;
  if (objective.kind === "capture-mine") {
    const pit = battle.mining && Object.hasOwn(battle.mining.pitsById, objective.pitId)
      ? battle.mining.pitsById[objective.pitId]
      : null;
    if (!pit || pit.remainingOre <= 0) {
      ai.objective = null;
      return null;
    }
    if (pit.controller === FACTION) {
      if (pit.occupyingMineId !== null) {
        ai.objective = null;
        return null;
      }
      const occupyingSquad = battle.units.some((unit) => (
        unit.squadId === objective.squadId
        && unit.health > 0
        && unit.status !== "dead"
        && worldToAxial(unit.position).q === pit.coordinate.q
        && worldToAxial(unit.position).r === pit.coordinate.r
      ));
      if (occupyingSquad) {
        const destination = clearingPoint(pit.coordinate, battlefield);
        ai.objective = Object.freeze({
          ...objective,
          destination: Object.freeze({ ...destination }),
        });
        return orderMove(
          battle,
          [objective.squadId],
          destination,
          "capture-mine",
          pit.id,
        );
      }
      setPhase(ai, "economy", battle.matchElapsed);
      const result = attemptMineConstruction(battle, pit.id);
      if (result.ok) ai.objective = null;
      return result;
    }
    const squadAlive = livingSquadIds(battle, FACTION).includes(objective.squadId);
    if (!squadAlive) {
      ai.objective = null;
      return null;
    }
    const current = battle.squadOrders
      ? sandboxSquadOrderFor(battle.squadOrders, objective.squadId)
      : null;
    if (
      current?.kind !== "move"
      || !samePoint(current.destination, objective.destination)
    ) {
      setPhase(ai, "economy", battle.matchElapsed);
      return orderMove(
        battle,
        [objective.squadId],
        objective.destination,
        "capture-mine",
        objective.pitId,
      );
    }
    return null;
  }

  const living = objective.squadIds.filter((squadId) => (
    livingSquadIds(battle, FACTION).includes(squadId)
  ));
  if (living.length === 0) {
    ai.objective = null;
    return null;
  }
  const arrived = living.filter((squadId) => (
    squadDistanceTo(battle, squadId, objective.destination) <= ROUTE_ARRIVAL_RADIUS
  )).length;
  if (arrived * 2 < living.length) return null;
  ai.objective = null;
  setPhase(ai, "attack", battle.matchElapsed);
  return orderAttackMove(
    battle,
    living,
    enemyApproach(battlefield),
    "assault",
    "verdant-gate",
  );
}

function beginMineExpansion(
  battle: BattleState,
  ai: MutableAiState,
  battlefield: BattlefieldDefinition,
  currentMineCount: number,
): AiActionResult | null {
  if (currentMineCount >= DESIRED_MINE_COUNT || ai.objective !== null || !battle.mining) {
    return null;
  }
  const pits = sortedMinePits(battlefield)
    .map((definition) => ({ definition, state: battle.mining!.pitsById[definition.id] }))
    .filter(({ definition, state }) => (
      state
      && state.remainingOre > 0
      && state.occupyingMineId === null
      && definition.region !== "verdant-safe"
    ));
  const controlled = pits.find(({ state }) => state.controller === FACTION);
  if (controlled) return attemptMineConstruction(battle, controlled.state.id);

  const target = pits.find(({ state }) => state.controller === null);
  if (!target) return null;
  const squadId = livingSquadIds(battle, FACTION).find((candidate) => {
    const order = battle.squadOrders
      ? sandboxSquadOrderFor(battle.squadOrders, candidate)
      : null;
    return order === null || order.kind === "stop" || order.kind === "hold";
  });
  if (!squadId) return null;
  const destination = axialToWorld(nearestEntrance(target.definition, battlefield));
  ai.objective = Object.freeze({
    kind: "capture-mine",
    pitId: target.state.id,
    squadId,
    destination: Object.freeze({ ...destination }),
  });
  setPhase(ai, "economy", battle.matchElapsed);
  return orderMove(
    battle,
    [squadId],
    destination,
    "capture-mine",
    target.state.id,
  );
}

function beginAttackWave(
  battle: BattleState,
  ai: MutableAiState,
  battlefield: BattlefieldDefinition,
): AiActionResult | null {
  if (ai.objective !== null) return null;
  const candidates = livingSquadIds(battle, FACTION).filter((squadId) => {
    const order = battle.squadOrders
      ? sandboxSquadOrderFor(battle.squadOrders, squadId)
      : null;
    return order === null || order.kind === "stop" || order.kind === "hold";
  });
  if (candidates.length < SANDBOX_AI_ATTACK_WAVE_MINIMUM_UNITS) return null;
  const wavePopulation = candidates.reduce((sum, squadId) => (
    sum + squadPopulation(battle, squadId)
  ), 0);
  if (wavePopulation < SANDBOX_AI_ATTACK_WAVE_MINIMUM_POPULATION) return null;
  const routes = sortedRoutes(battlefield);
  if (routes.length === 0) return null;
  const route = routes[ai.routeCursor % routes.length]!;
  ai.routeCursor += 1;
  const destination = routeMidpointFromCrimson(route);
  ai.objective = Object.freeze({
    kind: "attack-route",
    routeId: route.id,
    squadIds: Object.freeze([...candidates]),
    destination: Object.freeze({ ...destination }),
  });
  return orderAttackMove(
    battle,
    candidates,
    destination,
    "attack-wave",
    route.id,
  );
}

function attemptProduction(
  battle: BattleState,
  ai: MutableAiState,
  maximumCommittedPopulation: number,
): AiActionResult | null {
  const queuePopulation = battle.production
    ? sandboxProductionPopulation(battle.production, FACTION)
    : { totalQueuePopulation: 0 };
  const committedPopulation = sandboxUsedPopulation(battle.units, FACTION)
    + queuePopulation.totalQueuePopulation;
  const operational = livingBuildings(battle, FACTION)
    .filter((building) => (
      battleBuildingConstructionPhaseAt(building, battle.matchElapsed) === "operational"
    ))
    .sort(compareBuildings);
  for (let offset = 0; offset < SANDBOX_TROOP_SLOTS.length; offset += 1) {
    const cursor = (ai.productionCursor + offset) % SANDBOX_TROOP_SLOTS.length;
    const troop = SANDBOX_TROOP_SLOTS[cursor]!;
    if (
      committedPopulation + sandboxTroopSpec(troop).populationCost
      > maximumCommittedPopulation
    ) continue;
    const producer = operational.find((building) => (
      building.kind === sandboxTroopSpec(troop).producer
      && (battle.production
        ? (sandboxProductionQueueFor(battle.production, building.id)?.entries.length
            ?? SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH) < SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH
        : false)
    ));
    if (!producer) continue;
    if (battle.economy.accounts[FACTION].gold < sandboxTroopSpec(troop).cost) return null;
    ai.productionCursor = cursor + 1;
    return enqueueTroop(battle, producer, troop);
  }
  return null;
}

function ensureProductionRallyPoint(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
): AiActionResult | null {
  if (!battle.production) return null;
  const rally = battlefield.rallyPoints?.[FACTION];
  if (!rally) return null;
  for (const building of livingBuildings(battle, FACTION).sort(compareBuildings)) {
    if (!isProductionKind(building.kind)) continue;
    if (battleBuildingConstructionPhaseAt(building, battle.matchElapsed) !== "operational") continue;
    const queue = sandboxProductionQueueFor(battle.production, building.id);
    if (!queue || queue.rallyPoint !== null) continue;
    const result = setSandboxBattleRallyPoint(battle, {
      faction: FACTION,
      buildingId: building.id,
      worldPosition: axialToWorld(rally),
    });
    return {
      battle: result.battle,
      action: "set-rally-point",
      subjectId: building.id,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    };
  }
  return null;
}

function attemptControlledMineConstruction(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
): AiActionResult | null {
  if (!battle.mining) return null;
  const candidate = sortedMinePits(battlefield).find((definition) => {
    const pit = battle.mining!.pitsById[definition.id];
    return pit
      && pit.controller === FACTION
      && pit.remainingOre > 0
      && pit.occupyingMineId === null;
  });
  return candidate ? attemptMineConstruction(battle, candidate.id) : null;
}

function attemptMineConstruction(
  battle: BattleState,
  pitId: string,
): AiActionResult {
  const result = startSandboxBuildingConstruction(battle, {
    faction: FACTION,
    slot: "mine",
    worldPosition: battle.mining && Object.hasOwn(battle.mining.pitsById, pitId)
      ? axialToWorld(battle.mining.pitsById[pitId].coordinate)
      : { x: Number.NaN, z: Number.NaN },
  });
  return {
    battle: result.battle,
    action: "construct-mine",
    subjectId: pitId,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
  };
}

function attemptOrdinaryConstruction(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
  slot: Exclude<SandboxBuildingSlot, "mine">,
): AiActionResult | null {
  const anchors = sortedBuildAnchors(battlefield);
  for (const anchor of anchors) {
    const worldPosition = axialToWorld(anchor.coordinate);
    const preview = previewSandboxBuildingConstruction(battle, {
      faction: FACTION,
      slot,
      worldPosition,
    });
    if (!preview.valid) continue;
    const result = startSandboxBuildingConstruction(battle, {
      faction: FACTION,
      slot,
      worldPosition,
    });
    return {
      battle: result.battle,
      action: "construct-building",
      subjectId: slot,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    };
  }
  return {
    battle,
    action: "construct-building",
    subjectId: slot,
    ok: false,
    reason: "no-legal-anchor",
  };
}

function enqueueTroop(
  battle: BattleState,
  building: BattleBuilding,
  troop: SandboxTroopSlot,
): AiActionResult {
  const result = enqueueSandboxBattleProduction(battle, {
    faction: FACTION,
    buildingId: building.id,
    troopKind: troop,
  });
  return {
    battle: result.battle,
    action: "enqueue-production",
    subjectId: troop,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
  };
}

function orderMove(
  battle: BattleState,
  squadIds: readonly string[],
  destination: WorldPoint,
  action: "capture-mine",
  subjectId: string,
): AiActionResult {
  const result = issueSandboxSquadOrder(battle, {
    faction: FACTION,
    squadIds,
    kind: "move",
    destination,
  });
  return {
    battle: result.battle,
    action,
    subjectId,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
  };
}

function orderAttackMove(
  battle: BattleState,
  squadIds: readonly string[],
  destination: WorldPoint,
  action: "attack-wave" | "assault" | "resume-attack",
  subjectId: string,
): AiActionResult {
  const result = issueSandboxSquadOrder(battle, {
    faction: FACTION,
    squadIds,
    kind: "attack-move",
    destination,
  });
  return {
    battle: result.battle,
    action,
    subjectId,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
  };
}

function orderAttack(
  battle: BattleState,
  squadIds: readonly string[],
  targetType: "unit" | "building",
  targetId: string,
  action: "defend",
): AiActionResult {
  const result = issueSandboxSquadOrder(battle, {
    faction: FACTION,
    squadIds,
    kind: "attack",
    target: { targetType, targetId },
  });
  return {
    battle: result.battle,
    action,
    subjectId: targetId,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
  };
}

function settleAction(
  original: BattleState,
  ai: MutableAiState,
  result: AiActionResult,
): BattleState {
  const before = snapshot(original);
  const after = snapshot(result.battle);
  const sameFailure = !result.ok
    && ai.lastFailureAction === result.action
    && ai.lastFailureReason === result.reason;
  if (result.ok) {
    ai.actionSequence += 1;
    ai.retryNotBefore = 0;
    ai.lastFailureAction = null;
    ai.lastFailureReason = null;
    ai.repeatedFailureCount = 0;
  } else {
    ai.retryNotBefore = original.matchElapsed + SANDBOX_AI_FAILURE_RETRY_SECONDS;
    ai.lastFailureAction = result.action;
    ai.lastFailureReason = result.reason;
    ai.repeatedFailureCount = sameFailure ? ai.repeatedFailureCount + 1 : 1;
  }
  const entry: SandboxOpponentAiLedgerEntry = Object.freeze({
    sequence: ai.ledger.length === 0
      ? 1
      : ai.ledger[ai.ledger.length - 1]!.sequence + 1,
    decidedAt: normalizeTime(original.matchElapsed),
    phase: ai.phase,
    action: result.action,
    subjectId: result.subjectId,
    outcome: result.ok ? "succeeded" : "failed",
    reason: result.reason,
    goldBefore: before.gold,
    goldAfter: after.gold,
    remainingOreBefore: before.remainingOre,
    remainingOreAfter: after.remainingOre,
    livingPopulationBefore: before.livingPopulation,
    livingPopulationAfter: after.livingPopulation,
    reservedPopulationBefore: before.reservedPopulation,
    reservedPopulationAfter: after.reservedPopulation,
    queuedOrdersBefore: before.queuedOrders,
    queuedOrdersAfter: after.queuedOrders,
    squadOrderSequenceBefore: before.squadOrderSequence,
    squadOrderSequenceAfter: after.squadOrderSequence,
  });
  ai.ledger = [...ai.ledger, entry].slice(-SANDBOX_AI_LEDGER_LIMIT);
  return attachState(result.battle, ai);
}

function attachState(battle: BattleState, ai: MutableAiState): BattleState {
  const state = freezeState(ai);
  if (battle.sandboxAi === state) return battle;
  return {
    ...battle,
    sandboxAi: state,
    revision: battle.revision + 1,
  };
}

function snapshot(battle: BattleState): AiSnapshot {
  const queuePopulation = battle.production
    ? sandboxProductionPopulation(battle.production, FACTION)
    : { reservedPopulation: 0 };
  return {
    gold: battle.economy.accounts[FACTION].gold,
    remainingOre: battle.mining
      ? Object.values(battle.mining.pitsById).reduce((sum, pit) => sum + pit.remainingOre, 0)
      : 0,
    livingPopulation: sandboxUsedPopulation(battle.units, FACTION),
    reservedPopulation: queuePopulation.reservedPopulation,
    queuedOrders: battle.production
      ? Object.values(battle.production.queuesByBuildingId).reduce(
          (sum, queue) => sum + queue.entries.length,
          0,
        )
      : 0,
    squadOrderSequence: battle.squadOrders?.nextSequence ?? 0,
  };
}

function nearestThreat(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
): BattleUnit | null {
  const castle = battlefield.map.castles[FACTION];
  const ownBuildings = livingBuildings(battle, FACTION);
  return battle.units
    .filter((unit) => (
      unit.faction !== FACTION
      && unit.health > 0
      && unit.status !== "dead"
      && (
        hexDistance(worldToAxial(unit.position), castle) <= DEFENSE_CASTLE_RADIUS
        || ownBuildings.some((building) => (
          hexDistance(worldToAxial(unit.position), building.coordinate) <= DEFENSE_BUILDING_RADIUS
        ))
      )
    ))
    .sort((first, second) => (
      hexDistance(worldToAxial(first.position), castle)
      - hexDistance(worldToAxial(second.position), castle)
      || first.id.localeCompare(second.id)
    ))[0] ?? null;
}

function livingBuildings(battle: BattleState, faction: Faction): BattleBuilding[] {
  return battle.buildings.filter((building) => (
    building.faction === faction
    && building.status === "active"
    && building.health > 0
  ));
}

function livingSquadIds(battle: BattleState, faction: Faction): string[] {
  return [...new Set(battle.units
    .filter((unit) => (
      unit.faction === faction && unit.health > 0 && unit.status !== "dead"
    ))
    .map((unit) => unit.squadId))].sort();
}

function squadPopulation(battle: BattleState, squadId: string): number {
  return sandboxUsedPopulation(
    battle.units.filter((unit) => unit.squadId === squadId),
    FACTION,
  );
}

function squadDistanceTo(
  battle: BattleState,
  squadId: string,
  destination: WorldPoint,
): number {
  const members = battle.units.filter((unit) => (
    unit.squadId === squadId && unit.health > 0 && unit.status !== "dead"
  ));
  if (members.length === 0) return Number.POSITIVE_INFINITY;
  const center = {
    x: members.reduce((sum, unit) => sum + unit.position.x, 0) / members.length,
    z: members.reduce((sum, unit) => sum + unit.position.z, 0) / members.length,
  };
  return hexDistance(worldToAxial(center), worldToAxial(destination));
}

function sortedMinePits(
  battlefield: BattlefieldDefinition,
): BattlefieldMinePitDefinition[] {
  const castle = battlefield.map.castles[FACTION];
  return [...(battlefield.minePits ?? [])].sort((first, second) => (
    hexDistance(first.coordinate, castle) - hexDistance(second.coordinate, castle)
    || first.coordinate.q - second.coordinate.q
    || first.coordinate.r - second.coordinate.r
    || first.id.localeCompare(second.id)
  ));
}

function sortedBuildAnchors(
  battlefield: BattlefieldDefinition,
): BattlefieldBuildAnchor[] {
  const castle = battlefield.map.castles[FACTION];
  return [...(battlefield.buildAnchors?.[FACTION] ?? [])].sort((first, second) => (
    hexDistance(first.coordinate, castle) - hexDistance(second.coordinate, castle)
    || first.coordinate.q - second.coordinate.q
    || first.coordinate.r - second.coordinate.r
  ));
}

function sortedRoutes(battlefield: BattlefieldDefinition): BattlefieldRouteDefinition[] {
  const order = new Map(["center", "west", "east"].map((id, index) => [id, index]));
  return [...(battlefield.routes ?? [])].sort((first, second) => (
    (order.get(first.id) ?? 99) - (order.get(second.id) ?? 99)
    || first.id.localeCompare(second.id)
  ));
}

function nearestEntrance(
  pit: BattlefieldMinePitDefinition,
  battlefield: BattlefieldDefinition,
): HexCoordinate {
  const castle = battlefield.map.castles[FACTION];
  return [...pit.entrances].sort((first, second) => (
    hexDistance(first, castle) - hexDistance(second, castle)
    || first.q - second.q
    || first.r - second.r
  ))[0]!;
}

function routeMidpointFromCrimson(route: BattlefieldRouteDefinition): WorldPoint {
  const path = route.referencePath;
  const coordinate = path[Math.floor(path.length / 2)] ?? path[0];
  if (!coordinate) throw new Error(`Sandbox route ${route.id} has no reference path.`);
  return axialToWorld(coordinate);
}

function enemyApproach(battlefield: BattlefieldDefinition): WorldPoint {
  return axialToWorld(
    battlefield.gates?.verdant.approach
      ?? battlefield.map.castleApproaches.verdant,
  );
}

function clearingPoint(
  pit: HexCoordinate,
  battlefield: BattlefieldDefinition,
): WorldPoint {
  const castle = battlefield.map.castles[FACTION];
  const coordinate = [...battlefield.map.cells]
    .filter((cell) => cell.walkable && hexDistance(cell, pit) >= 3)
    .sort((first, second) => (
      hexDistance(first, pit) - hexDistance(second, pit)
      || hexDistance(first, castle) - hexDistance(second, castle)
      || first.q - second.q
      || first.r - second.r
    ))[0];
  if (!coordinate) throw new Error("Sandbox mine has no clearing point.");
  return axialToWorld(coordinate);
}

function isProductionKind(kind: string): kind is SandboxProductionBuildingSlot {
  return kind === "barracks"
    || kind === "archery-range"
    || kind === "mage-tower"
    || kind === "siege-workshop";
}

function compareBuildings(first: BattleBuilding, second: BattleBuilding): number {
  return first.createdAt - second.createdAt || first.id.localeCompare(second.id);
}

function setPhase(
  ai: MutableAiState,
  phase: SandboxOpponentAiPhase,
  elapsed: number,
): void {
  if (ai.phase === phase) return;
  ai.phase = phase;
  ai.phaseChangedAt = elapsed;
}

function samePoint(first: WorldPoint | null, second: WorldPoint): boolean {
  return first !== null
    && Math.abs(first.x - second.x) <= 1e-9
    && Math.abs(first.z - second.z) <= 1e-9;
}

function normalizeTime(value: number): number {
  return Number(value.toFixed(9));
}

function mutableState(state: SandboxOpponentAiState): MutableAiState {
  return {
    ...state,
    objective: cloneObjective(state.objective),
    ledger: [...state.ledger],
  };
}

function freezeState(state: MutableAiState): SandboxOpponentAiState {
  return Object.freeze({
    ...state,
    objective: cloneObjective(state.objective),
    ledger: Object.freeze([...state.ledger]),
  });
}

function cloneObjective(
  objective: SandboxOpponentAiObjective | null,
): SandboxOpponentAiObjective | null {
  if (!objective) return null;
  if (objective.kind === "capture-mine") {
    return Object.freeze({
      ...objective,
      destination: Object.freeze({ ...objective.destination }),
    });
  }
  return Object.freeze({
    ...objective,
    squadIds: Object.freeze([...objective.squadIds]),
    destination: Object.freeze({ ...objective.destination }),
  });
}
