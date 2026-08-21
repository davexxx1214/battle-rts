import {
  pruneBattleEvents,
  stampBattleEvent,
  type BattleEvent,
  type BattleEventInput,
} from "./events";
import {
  advanceProjectiles,
  type BattleProjectile,
  type ProjectileImpact,
} from "./projectiles";
import { buildSquads, type BattleSquad } from "./squads";
import {
  buildSquadNavigationPlans,
  squadNavigationWaypointsFor,
  type SquadNavigationPlan,
} from "./squadNavigation";
import {
  assignMeleeEngagementSlots,
  type MeleeEngagementSlot,
} from "./engagements";
import {
  separateLivingAllies,
} from "./formation";
import {
  areWorldPointsConnected,
  castleChargeNavigationKey,
  findWorldPath,
  resolveWalkableWorldPoint,
} from "./navigation";
import {
  axialToWorld,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type BattlefieldStructure,
} from "../map/battlefield";
import type {
  Faction,
  FactionRaces,
  UnitCombatProfile,
  UnitRole,
  WorldPoint,
} from "./types";
import {
  createFactionRaces,
  legacyUndeadOpponentRaces,
} from "./factions";
import { BattleSpatialIndex } from "./spatialIndex";
import {
  unitSpecFor,
  type MatchPolicy,
} from "./rules";
import { battleModeDefinitionFor, type BattleModeId } from "./battleMode";
import { battlefieldDefinitionFor } from "../map/battlefieldDefinition";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import {
  advanceEconomy,
  createEconomyState,
  getMatchClock,
  type EconomyState,
  type MatchClock,
} from "./economy";
import {
  createBuildingOccupancy,
  createDeploymentCounts,
  type BuildingOccupancy,
  type DeploymentCounts,
} from "./deployment";
import {
  advanceBuildingProduction,
  createBattleBuilding,
  removeDestroyedBuildingsAt,
  settleBuildingHealth,
  type BattleBuilding,
} from "./buildings";
import type {
  CombatDamageIntent,
  CombatTarget,
  CombatTargetRef,
} from "./combat";
import {
  clampToForwardProgress,
  selectAutomaticTarget,
  type AutomaticCombatTarget,
} from "./autoCombat";
import {
  activateCastlesFromDamage,
  advanceCastleAttacks,
} from "./castleCombat";
import { advanceArrowTowerAttacks } from "./arrowTowerCombat";
import {
  applyUnitStatusEffect,
  periodicStatusDamageForInterval,
  pruneUnitStatusEffects,
  unitStatusModifiers,
  type CombatStatusEffectIntent,
  type UnitStatusEffect,
  type UnitStatusEffectApplication,
} from "./unitStatusEffects";
import {
  createSandboxMiningState,
  type MiningLedgerEvent,
  type SandboxMiningState,
} from "./miningEconomy";
import {
  advanceSandboxMiningSystems,
  synchronizeSandboxMineOccupancy,
} from "./sandboxMiningIntegration";
import {
  advanceSandboxProduction,
  createSandboxProductionState,
  sandboxProductionPopulationByFaction,
  type SandboxProductionSpawn,
  type SandboxProductionState,
} from "./sandboxProductionQueue";
import {
  sandboxProductionExitForSpawn,
  synchronizeSandboxProductionBuildings,
} from "./sandboxProductionIntegration";
import { sandboxTroopSpec } from "./sandboxCatalog";
import {
  createSandboxSquadOrderState,
  pruneSandboxSquadOrders,
  sandboxSquadOrderFor,
  type SandboxSquadOrder,
  type SandboxSquadOrderState,
} from "./sandboxOrders";
import type { SandboxOpponentAiState } from "./sandboxOpponentAi";

export type { BattleRace, Faction, FactionRaces, UnitRole, WorldPoint } from "./types";
export { UNIT_SPECS } from "./rules";
export type { UnitSpec } from "./rules";
export type UnitStatus = "idle" | "moving" | "attacking" | "dead";
export type UnitBehavior = "charging" | "engaging" | "castle-locked";

export interface BattleUnit extends CombatTarget {
  readonly targetType: "unit";
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly combatProfile: UnitCombatProfile;
  readonly squadId: string;
  readonly maxHealth: number;
  readonly health: number;
  readonly position: WorldPoint;
  readonly formationSlot: WorldPoint;
  readonly waypoints: readonly WorldPoint[];
  readonly navigationKey: string | null;
  readonly behavior: UnitBehavior;
  readonly status: UnitStatus;
  readonly statusEffects: readonly UnitStatusEffect[];
  readonly cooldownRemaining: number;
  readonly facing: number;
  readonly currentTarget: CombatTargetRef | null;
  readonly engagementSlot: MeleeEngagementSlot | null;
  readonly diedAt: number | null;
}

export interface BattleState {
  readonly modeId: BattleModeId;
  readonly mapId: string;
  readonly units: readonly BattleUnit[];
  readonly squads: readonly BattleSquad[];
  readonly projectiles: readonly BattleProjectile[];
  readonly events: readonly BattleEvent[];
  readonly economy: EconomyState;
  readonly mining: SandboxMiningState | null;
  readonly miningLedger: readonly MiningLedgerEvent[];
  readonly production: SandboxProductionState | null;
  readonly squadOrders: SandboxSquadOrderState | null;
  readonly sandboxAi: SandboxOpponentAiState | null;
  readonly matchPolicy: MatchPolicy;
  readonly matchElapsed: number;
  readonly buildings: readonly BattleBuilding[];
  readonly buildingOccupancy: BuildingOccupancy;
  readonly deploymentCounts: DeploymentCounts;
  readonly nextDeploymentSequence: number;
  readonly nextEventSequence: number;
  readonly elapsed: number;
  readonly winner: Faction | "draw" | null;
  readonly resolvedAt: number | null;
  readonly revision: number;
  readonly factionRaces: FactionRaces;
  /** @deprecated Read factionRaces instead. Retained for saved-state compatibility. */
  readonly undeadOpponent: boolean;
}

export interface CreateBattleUnitInput {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly position: WorldPoint;
  readonly squadId?: string;
  readonly combatProfile?: UnitCombatProfile;
}

export interface CreateBattleStateOptions {
  readonly modeId?: BattleModeId;
  readonly mapId?: string;
  readonly factionRaces?: Partial<FactionRaces>;
  readonly undeadOpponent?: boolean;
  readonly matchPolicy?: MatchPolicy;
}

type EmitBattleEvent = (input: BattleEventInput) => BattleEvent;

const ARRIVAL_DISTANCE = 0.12;
const WAYPOINT_ARRIVAL_EPSILON = 1e-6;
const MOVEMENT_EPSILON = 1e-9;
const MAX_STEP_SECONDS = 0.1;
const EVENT_WINDOW_SECONDS = 2;
const POST_BATTLE_PRESENTATION_SECONDS = 8;
const MAX_MINING_LEDGER_EVENTS = 512;
const ATTACK_LINE_SAMPLE_DISTANCE = 0.35;
const BUILDING_ATTACK_LINE_CLEARANCE = 1.1;
const MANUAL_SELF_DEFENSE_PADDING = 0.2;
const MANUAL_HOLD_LEASH_DISTANCE = 4;

export function createBattleUnit(input: CreateBattleUnitInput): BattleUnit {
  const combatProfile = input.combatProfile ?? "human";
  const spec = unitSpecFor(input.role, combatProfile);
  return {
    ...input,
    targetType: "unit",
    combatProfile,
    squadId: input.squadId ?? `${input.faction}-independent-${input.id}`,
    position: { ...input.position },
    formationSlot: { ...input.position },
    waypoints: [],
    navigationKey: null,
    maxHealth: spec.maxHealth,
    health: spec.maxHealth,
    behavior: "charging",
    status: "idle",
    statusEffects: [],
    cooldownRemaining: 0,
    facing: input.faction === "verdant" ? Math.PI : 0,
    currentTarget: null,
    engagementSlot: null,
    diedAt: null,
  };
}

export function createBattleState(
  units: readonly BattleUnit[],
  options: CreateBattleStateOptions = {},
): BattleState {
  const modeId = resolveModeId(options.modeId, options.matchPolicy);
  const mode = battleModeDefinitionFor(modeId);
  const mapId = options.mapId ?? mode.defaultMapId;
  const battlefield = battlefieldDefinitionFor(mapId);
  const clonedUnits = units.map(cloneUnit);
  const factionRaces = options.factionRaces
    ? createFactionRaces(options.factionRaces)
    : legacyUndeadOpponentRaces(options.undeadOpponent);
  return {
    modeId,
    mapId,
    units: clonedUnits,
    squads: buildSquads(clonedUnits),
    projectiles: [],
    events: [],
    economy: createEconomyState(mode.economyPolicy),
    mining: modeId === "sandbox"
      ? createSandboxMiningState(battlefield.minePits ?? [])
      : null,
    miningLedger: [],
    production: modeId === "sandbox" ? createSandboxProductionState() : null,
    squadOrders: modeId === "sandbox" ? createSandboxSquadOrderState() : null,
    sandboxAi: null,
    matchPolicy: options.matchPolicy ?? mode.clockPolicy,
    matchElapsed: 0,
    buildings: createInitialDefensiveBuildings(
      battlefield.battleStructures,
      mode.buildingLifecyclePolicy,
    ),
    buildingOccupancy: createBuildingOccupancy(),
    deploymentCounts: createDeploymentCounts(),
    nextDeploymentSequence: 0,
    nextEventSequence: 0,
    elapsed: 0,
    winner: null,
    resolvedAt: null,
    revision: 0,
    factionRaces,
    undeadOpponent: factionRaces.crimson === "undead",
  };
}

export function createInitialBattle(options: CreateBattleStateOptions = {}): BattleState {
  return createBattleState([], options);
}

export function getBattleMatchClock(state: BattleState): MatchClock {
  return getMatchClock(state.matchElapsed, state.matchPolicy);
}

export function stepBattle(state: BattleState, requestedDeltaSeconds: number): BattleState {
  if (!Number.isFinite(requestedDeltaSeconds) || requestedDeltaSeconds <= 0) {
    return state;
  }
  const runtime = resolveBattleRuntimeContext(state);
  const { map, mode } = runtime;
  const miningAtStart = state.mining ?? null;
  const miningLedgerAtStart = state.miningLedger ?? [];
  const productionAtStart = state.production
    ?? (state.modeId === "sandbox" ? createSandboxProductionState() : null);
  const squadOrdersAtStart = state.squadOrders
    ?? (state.modeId === "sandbox" ? createSandboxSquadOrderState() : null);
  const requestedStepSeconds = Math.min(MAX_STEP_SECONDS, requestedDeltaSeconds);
  if (state.resolvedAt !== null) {
    if (state.elapsed - state.resolvedAt >= POST_BATTLE_PRESENTATION_SECONDS) return state;
    const elapsed = Math.min(
      state.resolvedAt + POST_BATTLE_PRESENTATION_SECONDS,
      state.elapsed + requestedStepSeconds,
    );
    const cleanup = removeDestroyedBuildingsAt(
      state.buildings,
      state.buildingOccupancy,
      elapsed,
    );
    const mining = state.mining
      ? synchronizeSandboxMineOccupancy(state.mining, cleanup.buildings)
      : null;
    const production = productionAtStart
      ? synchronizeSandboxProductionBuildings(productionAtStart, cleanup.buildings)
      : null;
    const squadOrders = squadOrdersAtStart
      ? pruneSandboxSquadOrders(
          squadOrdersAtStart,
          livingSquadIds(state.units),
        )
      : null;
    return {
      ...state,
      units: state.units.map((unit) => ({
        ...unit,
        statusEffects: pruneUnitStatusEffects(unit.statusEffects, elapsed),
      })),
      buildings: cleanup.buildings,
      buildingOccupancy: cleanup.occupancy,
      mining,
      production,
      squadOrders,
      projectiles: [],
      events: pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      elapsed,
      revision: state.revision + 1,
    };
  }
  const clockAtStart = getBattleMatchClock(state);
  if (state.winner === null && clockAtStart.timedOut) {
    const winner = state.matchPolicy.timeoutResolution === "castle-health"
      ? resolveTimeoutWinner(state.buildings)
      : null;
    if (winner === null) return state;
    return {
      ...state,
      projectiles: [],
      winner,
      resolvedAt: state.elapsed,
      revision: state.revision + 1,
    };
  }
  const deltaSeconds = state.winner === null && clockAtStart.remainingSeconds !== null
    ? Math.min(requestedStepSeconds, clockAtStart.remainingSeconds)
    : requestedStepSeconds;
  const elapsed = state.elapsed + deltaSeconds;
  const unitsAtStart = state.units.map((unit) => ({
    ...unit,
    statusEffects: pruneUnitStatusEffects(unit.statusEffects, state.elapsed),
  }));
  const livingAtStart = unitsAtStart.filter((unit) => unit.health > 0);
  const damage: CombatDamageIntent[] = [];
  const statusEffectIntents: CombatStatusEffectIntent[] = [];
  const emitted: BattleEvent[] = [];
  let nextEventSequence = state.nextEventSequence;
  const emit: EmitBattleEvent = (input) => {
    const event = stampBattleEvent(input, nextEventSequence, elapsed);
    nextEventSequence += 1;
    emitted.push(event);
    return event;
  };
  const matchIsActive = state.winner === null && !clockAtStart.timedOut;
  const matchElapsed = matchIsActive
    ? getMatchClock(state.matchElapsed + deltaSeconds, state.matchPolicy).elapsedSeconds
    : state.matchElapsed;
  const activeMatchDeltaSeconds = matchElapsed - state.matchElapsed;
  const activeBuildingsAtStart = state.buildings.filter((building) => (
    building.health > 0 && building.status === "active"
  ));
  const combatTargetsAtStart: CombatTarget[] = [
    ...livingAtStart,
    ...activeBuildingsAtStart,
  ];
  const projectileStep = advanceProjectiles(
    state.projectiles,
    combatTargetsAtStart,
    deltaSeconds,
  );
  for (const impact of projectileStep.impacts) {
    resolveProjectileImpact(
      impact,
      livingAtStart,
      activeBuildingsAtStart,
      damage,
      statusEffectIntents,
      emit,
    );
  }
  const spawnedProjectiles: BattleProjectile[] = [];
  const combatantsAtStart = livingAtStart;
  const spatialIndex = new BattleSpatialIndex(combatantsAtStart);
  const automaticControl = mode.controlAuthority.kind === "automatic";
  const targetsByUnitId = new Map<string, AutomaticCombatTarget | null>(
    automaticControl
      ? combatantsAtStart.map((unit) => [unit.id, selectAutomaticTarget({
          unit,
          units: nearbyEnemyUnits(unit, spatialIndex),
          buildings: activeBuildingsAtStart,
          map,
        })] as const)
      : combatantsAtStart.map((unit) => [
          unit.id,
          selectManualOrderTarget(
            unit,
            squadOrdersAtStart
              ? sandboxSquadOrderFor(squadOrdersAtStart, unit.squadId)
              : null,
            spatialIndex,
            activeBuildingsAtStart,
          ),
        ] as const),
  );
  const squadNavigationPlans = automaticControl
    ? buildSquadNavigationPlans(
        map,
        combatantsAtStart.flatMap((unit) => {
          if (
            targetsByUnitId.get(unit.id)
            || unit.behavior === "castle-locked"
            || unitSpecFor(unit.role, unit.combatProfile).movementMode !== "ground"
          ) return [];
          const targetFaction = oppositeFaction(unit.faction);
          const navigationKey = castleChargeNavigationKey(targetFaction);
          return [{
            id: unit.id,
            squadId: unit.squadId,
            faction: unit.faction,
            position: unit.position,
            destination: map.castleApproaches[targetFaction],
            navigationKey,
            needsRoute: unit.navigationKey !== navigationKey || unit.waypoints.length === 0,
          }];
        }),
      )
    : new Map<string, SquadNavigationPlan>();
  const engagementSlots = assignMeleeEngagementSlots(
    combatantsAtStart
      .filter((unit) => unitSpecFor(unit.role, unit.combatProfile).attackMode === "melee")
      .map((attacker) => {
        const target = targetsByUnitId.get(attacker.id);
        if (!target) return null;
        return {
          attacker,
          target,
          previousSlotIndex: attacker.engagementSlot?.targetType === target.targetType
            && attacker.engagementSlot.targetId === target.id
            ? attacker.engagementSlot.index
            : undefined,
        };
      })
      .filter((request): request is NonNullable<typeof request> => request !== null),
    (position, request) => (
      Boolean(getMapCell(map, worldToAxial(position))?.walkable)
      && areWorldPointsConnected(map, request.attacker.position, position)
    ),
  );
  const engagementByAttackerId = new Map(
    engagementSlots.map((slot) => [slot.attackerId, slot] as const),
  );
  const advancedUnits = unitsAtStart.map((unit) => {
    const target = targetsByUnitId.get(unit.id) ?? null;
    if (automaticControl || target) {
      return advanceUnit(
        unit,
        target,
        combatTargetsAtStart,
        engagementByAttackerId.get(unit.id) ?? null,
        deltaSeconds,
        damage,
        statusEffectIntents,
        spawnedProjectiles,
        emit,
        map,
        squadNavigationPlans.get(unit.id) ?? null,
        automaticControl,
      );
    }
    return advanceManualOrder(
      unit,
      squadOrdersAtStart
        ? sandboxSquadOrderFor(squadOrdersAtStart, unit.squadId)
        : null,
      deltaSeconds,
      map,
    );
  });
  const separatedUnits = separateLivingAllies(advancedUnits, 0.65, map).map((unit, index) => {
    const position = automaticControl
      ? clampToForwardProgress(
          unit.faction,
          advancedUnits[index]!.position,
          unit.position,
          map,
        )
      : unit.position;
    return {
      ...unit,
      position: unitSpecFor(unit.role, unit.combatProfile).movementMode === "flying"
        || getMapCell(map, worldToAxial(position))?.walkable
        ? position
        : advancedUnits[index]!.position,
    };
  });
  const periodicStatusDamage = periodicStatusDamageIntents(
    unitsAtStart,
    state.elapsed,
    elapsed,
  );
  const damagedUnits = applyDamageIntents(
    separatedUnits,
    [...damage, ...periodicStatusDamage],
    elapsed,
    emit,
    state.buildings,
  );
  const castleActivationStep = matchIsActive && activeMatchDeltaSeconds > 0
    ? activateCastlesFromDamage(state.buildings, damage, elapsed)
    : { buildings: state.buildings, events: [] };
  for (const event of castleActivationStep.events) emit(event);
  const buildingHealthSettlement = matchIsActive && activeMatchDeltaSeconds > 0
    ? settleBuildingHealth({
        buildings: castleActivationStep.buildings,
        occupancy: state.buildingOccupancy,
        elapsedSeconds: state.matchElapsed,
        deltaSeconds: activeMatchDeltaSeconds,
        damageIntents: damage,
        productionPolicy: mode.productionPolicy,
        factionRaces: state.factionRaces,
        undeadOpponent: state.undeadOpponent,
      })
    : {
        buildings: castleActivationStep.buildings,
        occupancy: state.buildingOccupancy,
        pendingProduction: [],
        destructionEvents: [],
      };
  const castleWinnerAfterBuildingHealth = resolveCastleWinner(
    buildingHealthSettlement.buildings,
  );
  const economyStep = castleWinnerAfterBuildingHealth === null && matchIsActive
    ? advanceEconomy(
        state.economy,
        state.matchElapsed,
        activeMatchDeltaSeconds,
        state.matchPolicy,
        mode.economyPolicy,
      )
    : { state: state.economy, newlyFullFactions: [] };
  const buildingStep = castleWinnerAfterBuildingHealth === null
    ? advanceBuildingProduction({
        settlement: buildingHealthSettlement,
        economy: economyStep.state,
        map,
        units: damagedUnits,
        economyPolicy: mode.economyPolicy,
        productionPolicy: mode.productionPolicy,
        factionRaces: state.factionRaces,
        undeadOpponent: state.undeadOpponent,
      })
    : {
        buildings: buildingHealthSettlement.buildings,
        economy: state.economy,
        occupancy: buildingHealthSettlement.occupancy,
        unitSpawns: [],
        events: buildingHealthSettlement.destructionEvents,
        newlyFullFactions: [],
      };
  for (const event of buildingStep.events) emit(event);
  const arrowTowerAttackStep = castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
      ? advanceArrowTowerAttacks(
        buildingStep.buildings,
        damagedUnits,
        activeMatchDeltaSeconds,
        matchElapsed,
      )
    : { buildings: buildingStep.buildings, attacks: [] };
  for (const attack of arrowTowerAttackStep.attacks) {
    const visualKind = state.factionRaces[attack.faction] === "undead"
      ? "poison-cloud" as const
      : undefined;
    const visual = visualKind ? { visualKind } : {};
    const attackEvent = emit({
      type: "attack-started",
      attackerId: attack.towerId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "arrow-tower",
      ...visual,
      origin: attack.origin,
      targetPosition: attack.targetPosition,
    });
    const projectileId = `projectile-${attackEvent.sequence}`;
    spawnedProjectiles.push({
      id: projectileId,
      attackerId: attack.towerId,
      sourceType: "building",
      targetId: attack.targetId,
      targetType: "unit",
      role: "ranger",
      ...visual,
      origin: { ...attack.origin },
      position: { ...attack.origin },
      destination: { ...attack.targetPosition },
      speed: attack.projectileSpeed,
      damage: attack.damage,
      splashRadius: 0,
    });
    emit({
      type: "projectile-spawned",
      projectileId,
      attackerId: attack.towerId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "ranger",
      ...visual,
      origin: attack.origin,
      destination: attack.targetPosition,
    });
  }
  const castleAttackStep = castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
    ? advanceCastleAttacks(
        arrowTowerAttackStep.buildings,
        damagedUnits,
        activeMatchDeltaSeconds,
      )
    : { buildings: arrowTowerAttackStep.buildings, attacks: [], damageIntents: [] };
  for (const attack of castleAttackStep.attacks) {
    emit({
      type: "attack-started",
      attackerId: attack.castleId,
      targetId: attack.targetId,
      targetType: "unit",
      role: "castle",
      origin: attack.origin,
      targetPosition: attack.targetPosition,
    });
  }
  const unitsAfterCastleAttacks = applyDamageIntents(
    damagedUnits,
    castleAttackStep.damageIntents,
    elapsed,
    emit,
    castleAttackStep.buildings,
  );
  const statusSettledUnits = settleUnitStatusEffects(
    unitsAfterCastleAttacks,
    statusEffectIntents,
    elapsed,
  );
  const productionAfterBuildingHealth = productionAtStart === null
    ? null
    : synchronizeSandboxProductionBuildings(
        productionAtStart,
        castleAttackStep.buildings,
      );
  const productionPopulationBefore = productionAfterBuildingHealth
    ? sandboxProductionPopulationByFaction(productionAfterBuildingHealth)
    : null;
  const resolvedProductionExits = new Map<
    string,
    ReturnType<typeof sandboxProductionExitForSpawn>
  >();
  const productionExitUnits: Array<Pick<
    BattleUnit,
    "position" | "health" | "status"
  >> = [...statusSettledUnits];
  const sandboxProductionStep = productionAfterBuildingHealth !== null
    && castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
    ? advanceSandboxProduction(productionAfterBuildingHealth, {
        elapsedSeconds: state.matchElapsed,
        deltaSeconds: activeMatchDeltaSeconds,
        isExitBlocked: (spawn: SandboxProductionSpawn) => {
          const exit = sandboxProductionExitForSpawn(
            map,
            runtime.battlefield.roadReserve ?? [],
            castleAttackStep.buildings,
            productionExitUnits,
            spawn,
          );
          resolvedProductionExits.set(spawn.entryId, exit);
          if (exit.status === "available") {
            productionExitUnits.push(...exit.positions.map((position) => ({
              position,
              health: 1,
              status: "idle" as const,
            })));
          }
          return exit.status === "ready-blocked";
        },
      })
    : {
        state: productionAfterBuildingHealth,
        spawns: [] as readonly SandboxProductionSpawn[],
        populationBefore: productionPopulationBefore,
        populationAfter: productionPopulationBefore,
      };
  const legacyProducedUnits = buildingStep.unitSpawns.map((spawn) => createBattleUnit({
    id: spawn.unitId,
    faction: spawn.faction,
    role: spawn.role,
    combatProfile: spawn.race,
    squadId: `${spawn.buildingId}-spawned`,
    position: spawn.position,
  }));
  const sandboxProducedUnits = sandboxProductionStep.spawns.flatMap((spawn) => {
    const exit = resolvedProductionExits.get(spawn.entryId);
    if (!exit || exit.status !== "available") {
      throw new Error(`Sandbox production ${spawn.entryId} spawned without an open exit.`);
    }
    const race = state.factionRaces[spawn.faction];
    const spec = sandboxTroopSpec(spawn.troopKind);
    return spawn.unitIds.map((unitId, index) => {
      const position = exit.positions[index]!;
      const rallyWaypoints = spawn.rallyPoint === null
        ? []
        : findWorldPath(map, position, axialToWorld(spawn.rallyPoint));
      const unit = createBattleUnit({
        id: unitId,
        faction: spawn.faction,
        role: spec.roleByRace[race],
        combatProfile: race,
        squadId: spawn.squadId,
        position,
      });
      return rallyWaypoints.length === 0
        ? unit
        : {
            ...unit,
            status: "moving" as const,
            waypoints: rallyWaypoints,
            navigationKey: `rally:${spawn.entryId}`,
          };
    });
  });
  for (const spawn of sandboxProductionStep.spawns) {
    const exit = resolvedProductionExits.get(spawn.entryId);
    if (!exit || exit.status !== "available") continue;
    const race = state.factionRaces[spawn.faction];
    const role = sandboxTroopSpec(spawn.troopKind).roleByRace[race];
    spawn.unitIds.forEach((unitId, index) => emit({
      type: "building-unit-spawned",
      buildingId: spawn.buildingId,
      faction: spawn.faction,
      unitId,
      race,
      role,
      position: exit.positions[index]!,
      scheduledAt: spawn.scheduledAtSeconds,
      spawnSequence: spawn.entrySequence * 10 + index,
    }));
  }
  const producedUnits = [...legacyProducedUnits, ...sandboxProducedUnits];
  const unitsAfterProduction = [...statusSettledUnits, ...producedUnits];
  const miningAfterBuildingHealth = miningAtStart === null
    ? null
    : synchronizeSandboxMineOccupancy(miningAtStart, castleAttackStep.buildings);
  const sandboxMiningStep = miningAfterBuildingHealth !== null
    && castleWinnerAfterBuildingHealth === null
    && matchIsActive
    && activeMatchDeltaSeconds > 0
    ? advanceSandboxMiningSystems({
        mining: miningAfterBuildingHealth,
        economy: buildingStep.economy,
        buildings: castleAttackStep.buildings,
        units: unitsAfterProduction,
        elapsedSeconds: state.matchElapsed,
        deltaSeconds: activeMatchDeltaSeconds,
        reservedPopulationByFaction: sandboxProductionStep.populationAfter
          ? {
              verdant: sandboxProductionStep.populationAfter.verdant.reservedPopulation,
              crimson: sandboxProductionStep.populationAfter.crimson.reservedPopulation,
            }
          : undefined,
        readyBlockedPopulationByFaction: sandboxProductionStep.populationAfter
          ? {
              verdant: sandboxProductionStep.populationAfter.verdant.readyBlockedPopulation,
              crimson: sandboxProductionStep.populationAfter.crimson.readyBlockedPopulation,
            }
          : undefined,
      })
    : {
        mining: miningAfterBuildingHealth,
        economy: buildingStep.economy,
        ledgerEvents: [],
        captureEvents: [],
        newlyFullFactions: [],
      };
  for (const event of sandboxMiningStep.captureEvents) emit(event);
  const newlyFullFactions = new Set([
    ...economyStep.newlyFullFactions,
    ...buildingStep.newlyFullFactions,
    ...sandboxMiningStep.newlyFullFactions,
  ]);
  for (const faction of newlyFullFactions) {
    emit({
      type: "gold-full",
      faction,
      promptSequence: sandboxMiningStep.economy.accounts[faction].fullPromptSequence,
    });
  }
  const buildingCleanup = removeDestroyedBuildingsAt(
    castleAttackStep.buildings,
    buildingStep.occupancy,
    elapsed,
  );
  const units = unitsAfterProduction;
  const matchTimedOut = getMatchClock(matchElapsed, state.matchPolicy).timedOut;
  const winner = castleWinnerAfterBuildingHealth
    ?? (
      matchTimedOut && state.matchPolicy.timeoutResolution === "castle-health"
        ? resolveTimeoutWinner(buildingCleanup.buildings)
        : null
    );
  return {
    modeId: state.modeId,
    mapId: state.mapId,
    units,
    squads: appendUnitsToSquads(state.squads, producedUnits),
    projectiles: winner
      ? []
      : [...projectileStep.projectiles, ...spawnedProjectiles],
    events: [
      ...pruneBattleEvents(state.events, elapsed - EVENT_WINDOW_SECONDS),
      ...emitted,
    ],
    economy: sandboxMiningStep.economy,
    mining: sandboxMiningStep.mining,
    miningLedger: [
      ...miningLedgerAtStart,
      ...sandboxMiningStep.ledgerEvents,
    ].slice(-MAX_MINING_LEDGER_EVENTS),
    production: sandboxProductionStep.state,
    squadOrders: squadOrdersAtStart
      ? pruneSandboxSquadOrders(
          squadOrdersAtStart,
          livingSquadIds(unitsAfterProduction),
        )
      : null,
    sandboxAi: state.sandboxAi ?? null,
    matchPolicy: state.matchPolicy,
    matchElapsed,
    buildings: buildingCleanup.buildings,
    buildingOccupancy: buildingCleanup.occupancy,
    deploymentCounts: state.deploymentCounts,
    nextDeploymentSequence: state.nextDeploymentSequence,
    nextEventSequence,
    elapsed,
    winner,
    resolvedAt: state.resolvedAt ?? (winner ? elapsed : null),
    revision: state.revision + 1,
    factionRaces: state.factionRaces,
    undeadOpponent: state.undeadOpponent,
  };
}

function advanceUnit(
  unit: BattleUnit,
  target: AutomaticCombatTarget | null,
  combatTargets: readonly CombatTarget[],
  engagementSlot: MeleeEngagementSlot | null,
  deltaSeconds: number,
  damage: CombatDamageIntent[],
  statusEffectIntents: CombatStatusEffectIntent[],
  spawnedProjectiles: BattleProjectile[],
  emit: EmitBattleEvent,
  map: BattlefieldMap,
  squadNavigationPlan: SquadNavigationPlan | null,
  enforceForwardProgress = true,
): BattleUnit {
  if (unit.health <= 0 || unit.status === "dead") {
    return {
      ...unit,
      health: 0,
      status: "dead",
      statusEffects: [],
      waypoints: [],
      currentTarget: null,
      engagementSlot: null,
    };
  }
  let next: BattleUnit = {
    ...unit,
    cooldownRemaining: Math.max(
      0,
      unit.cooldownRemaining
        - deltaSeconds * unitStatusModifiers(unit.statusEffects).attackSpeedMultiplier,
    ),
    currentTarget: target
      ? { targetType: target.targetType, targetId: target.id }
      : null,
    engagementSlot: unitSpecFor(unit.role, unit.combatProfile).attackMode === "melee"
      ? engagementSlot
      : null,
  };
  if (!target) {
    const destination = axialToWorld(
      map.castleApproaches[oppositeFaction(next.faction)],
    );
    return advanceTowardDestination({
      ...next,
      behavior: next.behavior === "castle-locked" ? "castle-locked" : "charging",
      engagementSlot: null,
    }, destination, deltaSeconds, map, squadNavigationPlan);
  }
  next = {
    ...next,
    behavior: next.behavior === "castle-locked" ? "castle-locked" : "engaging",
  };
  const spec = unitSpecFor(next.role, next.combatProfile);
  const targetDistance = distance(next.position, target.position);
  const facing = Math.atan2(target.position.x - next.position.x, target.position.z - next.position.z);
  const requiresCenteredPath = spec.attackMode === "cone"
    && spec.movementMode === "ground";
  const attackLineClear = !requiresCenteredPath
    || hasWalkableAttackLine(next.position, target, map);
  if (
    spec.attackMode === "melee"
    && targetDistance > spec.attackRange
  ) {
    if (!engagementSlot) return { ...next, facing, status: "idle" };
    if (distance(next.position, engagementSlot.position) > ARRIVAL_DISTANCE) {
      return advanceTowardCombatPosition(
        next,
        engagementSlot.position,
        `slot:${engagementSlot.targetType}:${engagementSlot.targetId}:${engagementSlot.index}`,
        facing,
        deltaSeconds,
        map,
        enforceForwardProgress,
      );
    }
  }
  if (targetDistance > spec.attackRange || !attackLineClear) {
    return advanceTowardTarget(
      next,
      target,
      facing,
      deltaSeconds,
      map,
      requiresCenteredPath,
      enforceForwardProgress,
    );
  }
  if (next.cooldownRemaining > 0) return { ...next, facing, status: "attacking" };

  const attackEvent = emit({
    type: "attack-started",
    attackerId: next.id,
    targetId: target.id,
    targetType: target.targetType,
    role: next.role,
    ...(spec.attackVisualKind ? { visualKind: spec.attackVisualKind } : {}),
    origin: { ...next.position },
    targetPosition: { ...target.position },
  });
  if (spec.attackMode === "melee") {
    damage.push({
      sourceId: next.id,
      sourceType: "unit",
      targetId: target.id,
      targetType: target.targetType,
      amount: spec.damage,
    });
    queueStatusEffectIntents(
      next.id,
      "unit",
      target,
      spec.onHitStatusEffects,
      statusEffectIntents,
    );
  } else if (spec.attackMode === "cone") {
    const coneTargets = combatTargetsInCone(
      next,
      target,
      combatTargets,
      spec.attackRange,
      spec.coneAngleDegrees ?? 0,
      map,
    );
    for (const coneTarget of coneTargets) {
      damage.push({
        sourceId: next.id,
        sourceType: "unit",
        targetId: coneTarget.id,
        targetType: coneTarget.targetType,
        amount: spec.damage,
      });
      queueStatusEffectIntents(
        next.id,
        "unit",
        coneTarget,
        spec.onHitStatusEffects,
        statusEffectIntents,
      );
    }
  } else {
    const projectileId = `projectile-${attackEvent.sequence}`;
    const projectile: BattleProjectile = {
      id: projectileId,
      attackerId: next.id,
      sourceType: "unit",
      targetId: target.id,
      targetType: target.targetType,
      role: next.role,
      ...(spec.attackVisualKind ? { visualKind: spec.attackVisualKind } : {}),
      ...(spec.onHitStatusEffects
        ? { onHitStatusEffects: spec.onHitStatusEffects.map((effect) => ({ ...effect })) }
        : {}),
      origin: { ...next.position },
      position: { ...next.position },
      destination: { ...target.position },
      speed: spec.projectileSpeed,
      damage: spec.damage,
      splashRadius: spec.splashRadius,
    };
    spawnedProjectiles.push(projectile);
    emit({
      type: "projectile-spawned",
      projectileId,
      attackerId: next.id,
      targetId: target.id,
      targetType: target.targetType,
      role: next.role,
      ...(spec.attackVisualKind ? { visualKind: spec.attackVisualKind } : {}),
      origin: { ...next.position },
      destination: { ...target.position },
    });
  }
  return {
    ...next,
    behavior: target.targetType === "building" && target.kind === "castle"
      ? "castle-locked"
      : next.behavior,
    facing,
    status: "attacking",
    cooldownRemaining: spec.attackCooldown,
  };
}

function selectManualOrderTarget(
  unit: BattleUnit,
  order: SandboxSquadOrder | null,
  spatialIndex: BattleSpatialIndex,
  buildings: readonly BattleBuilding[],
): AutomaticCombatTarget | null {
  if (order?.kind === "attack" && order.target) {
    const target = order.target.targetType === "unit"
      ? spatialIndex.unitById(order.target.targetId)
      : buildings.find((building) => building.id === order.target!.targetId);
    return target
      && target.health > 0
      && target.faction !== unit.faction
      && (target.targetType !== "building" || target.status === "active")
      ? target
      : null;
  }

  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const acquisitionRange = order?.kind === "attack-move" || order?.kind === "hold"
    ? spec.aggroRange
    : spec.attackRange + MANUAL_SELF_DEFENSE_PADDING;
  const withinHoldLeash = (target: AutomaticCombatTarget) => (
    order?.kind !== "hold"
    || !order.holdPosition
    || distance(order.holdPosition, target.position) <= MANUAL_HOLD_LEASH_DISTANCE
  );
  const candidates: AutomaticCombatTarget[] = [
    ...spatialIndex.enemiesWithin(unit, acquisitionRange),
    ...buildings.filter((building) => (
      building.faction !== unit.faction
      && building.status === "active"
      && building.health > 0
      && distance(unit.position, building.position) <= acquisitionRange
    )),
  ].filter(withinHoldLeash);
  const current = unit.currentTarget
    ? candidates.find((candidate) => (
        candidate.targetType === unit.currentTarget?.targetType
        && candidate.id === unit.currentTarget.targetId
      ))
    : null;
  return current ?? [...candidates].sort((first, second) => (
    distance(unit.position, first.position) - distance(unit.position, second.position)
    || first.id.localeCompare(second.id)
  ))[0] ?? null;
}

function advanceManualOrder(
  unit: BattleUnit,
  order: SandboxSquadOrder | null,
  deltaSeconds: number,
  map: BattlefieldMap,
): BattleUnit {
  if (unit.health <= 0 || unit.status === "dead") {
    return {
      ...unit,
      health: 0,
      status: "dead",
      waypoints: [],
      currentTarget: null,
      engagementSlot: null,
    };
  }
  const next: BattleUnit = {
    ...unit,
    behavior: "charging",
    cooldownRemaining: Math.max(
      0,
      unit.cooldownRemaining
        - deltaSeconds * unitStatusModifiers(unit.statusEffects).attackSpeedMultiplier,
    ),
    currentTarget: null,
    engagementSlot: null,
  };
  if (!order) return advanceIssuedWaypoints(next, deltaSeconds, map);
  if (order.kind === "stop" || order.kind === "attack") {
    return { ...next, status: "idle", waypoints: [], navigationKey: null };
  }
  if (order.kind === "hold") {
    if (
      !order.holdPosition
      || distance(next.position, order.holdPosition) <= ARRIVAL_DISTANCE
    ) {
      return { ...next, status: "idle", waypoints: [], navigationKey: null };
    }
    return advanceManualDestination(
      next,
      order.holdPosition,
      `order:${order.sequence}:hold`,
      deltaSeconds,
      map,
    );
  }
  if (!order.destination) {
    return { ...next, status: "idle", waypoints: [], navigationKey: null };
  }
  return advanceManualDestination(
    next,
    unit.formationSlot,
    `order:${order.sequence}:${order.kind}`,
    deltaSeconds,
    map,
  );
}

function advanceManualDestination(
  unit: BattleUnit,
  destination: WorldPoint,
  navigationKey: string,
  deltaSeconds: number,
  map: BattlefieldMap,
): BattleUnit {
  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const maximumDistance = spec.moveSpeed
    * unitStatusModifiers(unit.statusEffects).moveSpeedMultiplier
    * deltaSeconds;
  if (spec.movementMode === "flying") {
    const position = moveToward(unit.position, destination, maximumDistance);
    const arrived = distance(position, destination) <= ARRIVAL_DISTANCE;
    return {
      ...unit,
      position,
      facing: Math.atan2(
        destination.x - unit.position.x,
        destination.z - unit.position.z,
      ),
      status: arrived ? "idle" : "moving",
      waypoints: [],
      navigationKey: arrived ? null : navigationKey,
    };
  }
  if (distance(unit.position, destination) <= ARRIVAL_DISTANCE) {
    return { ...unit, status: "idle", waypoints: [], navigationKey: null };
  }
  const waypoints = unit.navigationKey === navigationKey && unit.waypoints.length > 0
    ? unit.waypoints
    : findWorldPath(map, unit.position, destination);
  if (waypoints.length === 0) {
    return { ...unit, status: "idle", waypoints: [], navigationKey: null };
  }
  const movement = advanceAlongWaypoints(
    unit,
    waypoints,
    maximumDistance,
    map,
    false,
  );
  const arrived = movement.waypoints.length === 0;
  return {
    ...unit,
    position: movement.position,
    facing: movement.facing,
    waypoints: movement.waypoints,
    status: arrived ? "idle" : "moving",
    navigationKey: arrived ? null : navigationKey,
  };
}

function combatTargetsInCone(
  attacker: BattleUnit,
  primaryTarget: CombatTarget,
  candidates: readonly CombatTarget[],
  range: number,
  coneAngleDegrees: number,
  map: BattlefieldMap,
): CombatTarget[] {
  const aimX = primaryTarget.position.x - attacker.position.x;
  const aimZ = primaryTarget.position.z - attacker.position.z;
  const aimLength = Math.hypot(aimX, aimZ);
  if (aimLength <= 1e-9 || coneAngleDegrees <= 0) return [primaryTarget];
  const directionX = aimX / aimLength;
  const directionZ = aimZ / aimLength;
  const minimumDot = Math.cos(coneAngleDegrees * Math.PI / 360);
  return candidates.filter((candidate) => {
    if (candidate.faction === attacker.faction || candidate.health <= 0) return false;
    const offsetX = candidate.position.x - attacker.position.x;
    const offsetZ = candidate.position.z - attacker.position.z;
    const candidateDistance = Math.hypot(offsetX, offsetZ);
    if (candidateDistance > range + 1e-9) return false;
    if (!hasWalkableAttackLine(attacker.position, candidate, map)) return false;
    if (candidateDistance <= 1e-9) return true;
    return (
      offsetX / candidateDistance * directionX
      + offsetZ / candidateDistance * directionZ
    ) >= minimumDot;
  });
}

function advanceTowardDestination(
  unit: BattleUnit,
  destination: WorldPoint,
  deltaSeconds: number,
  map: BattlefieldMap,
  squadNavigationPlan: SquadNavigationPlan | null = null,
): BattleUnit {
  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const moveSpeed = spec.moveSpeed * unitStatusModifiers(unit.statusEffects).moveSpeedMultiplier;
  if (spec.movementMode === "flying") {
    const facing = Math.atan2(
      destination.x - unit.position.x,
      destination.z - unit.position.z,
    );
    const position = clampToForwardProgress(
      unit.faction,
      unit.position,
      moveToward(unit.position, destination, moveSpeed * deltaSeconds),
      map,
    );
    return {
      ...unit,
      position,
      facing,
      status: distance(position, destination) <= ARRIVAL_DISTANCE ? "idle" : "moving",
      waypoints: [],
      navigationKey: null,
    };
  }
  const navigationKey = castleChargeNavigationKey(oppositeFaction(unit.faction));
  const plannedWaypoints = squadNavigationPlan?.navigationKey === navigationKey
    ? squadNavigationWaypointsFor(squadNavigationPlan, unit.id)
    : null;
  const waypoints = unit.navigationKey === navigationKey && unit.waypoints.length > 0
    ? unit.waypoints
    : plannedWaypoints ?? findWorldPath(map, unit.position, destination);
  if (waypoints.length === 0) {
    return {
      ...unit,
      status: "idle",
      waypoints: [],
      navigationKey: null,
    };
  }
  const movement = advanceAlongWaypoints(
    unit,
    waypoints,
    moveSpeed * deltaSeconds,
    map,
  );
  if (movement.blocked && movement.traveledDistance <= MOVEMENT_EPSILON) {
    const recovery = recoverBlockedGroundPosition(
      unit.position,
      moveSpeed * deltaSeconds,
      map,
    );
    if (recovery) {
      return {
        ...unit,
        position: recovery.position,
        waypoints: recovery.resetNavigation ? [] : waypoints,
        facing: movement.facing,
        status: "moving",
        navigationKey: recovery.resetNavigation ? null : navigationKey,
      };
    }
    return { ...unit, status: "idle", waypoints: [], navigationKey: null };
  }
  const arrived = movement.waypoints.length === 0;
  return {
    ...unit,
    position: movement.position,
    waypoints: movement.waypoints,
    facing: movement.facing,
    status: arrived ? "idle" : "moving",
    navigationKey: arrived ? null : navigationKey,
  };
}

/** Advances explicit sandbox/rally waypoints without automatic targeting. */
function advanceIssuedWaypoints(
  unit: BattleUnit,
  deltaSeconds: number,
  map: BattlefieldMap,
): BattleUnit {
  if (
    unit.health <= 0
    || unit.status === "dead"
    || unit.status !== "moving"
    || unit.waypoints.length === 0
  ) return unit;
  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const moveSpeed = spec.moveSpeed
    * unitStatusModifiers(unit.statusEffects).moveSpeedMultiplier;
  const movement = advanceAlongWaypoints(
    unit,
    unit.waypoints,
    moveSpeed * deltaSeconds,
    map,
    false,
  );
  if (movement.blocked && movement.traveledDistance <= MOVEMENT_EPSILON) {
    return { ...unit, status: "idle", waypoints: [], navigationKey: null };
  }
  const arrived = movement.waypoints.length === 0;
  return {
    ...unit,
    position: movement.position,
    waypoints: movement.waypoints,
    facing: movement.facing,
    status: arrived ? "idle" : "moving",
    navigationKey: arrived ? null : unit.navigationKey,
  };
}

interface WaypointMovement {
  readonly position: WorldPoint;
  readonly waypoints: readonly WorldPoint[];
  readonly facing: number;
  readonly traveledDistance: number;
  readonly blocked: boolean;
}

function advanceAlongWaypoints(
  unit: BattleUnit,
  waypoints: readonly WorldPoint[],
  maximumDistance: number,
  map: BattlefieldMap,
  enforceForwardProgress = true,
): WaypointMovement {
  let position = unit.position;
  let facing = unit.facing;
  let remainingDistance = Math.max(0, maximumDistance);
  let traveledDistance = 0;
  let waypointIndex = 0;
  let blocked = false;

  while (waypointIndex < waypoints.length) {
    const waypoint = waypoints[waypointIndex]!;
    const waypointDistance = distance(position, waypoint);
    if (waypointDistance <= MOVEMENT_EPSILON) {
      position = { ...waypoint };
      waypointIndex += 1;
      continue;
    }
    if (remainingDistance <= MOVEMENT_EPSILON) break;

    facing = Math.atan2(waypoint.x - position.x, waypoint.z - position.z);
    const requested = moveToward(
      position,
      waypoint,
      Math.min(remainingDistance, waypointDistance),
    );
    const moved = enforceForwardProgress
      ? walkableForwardPosition(unit.faction, position, requested, map)
      : walkablePosition(requested, map);
    if (!moved) {
      blocked = true;
      break;
    }
    const stepDistance = distance(position, moved);
    if (stepDistance <= MOVEMENT_EPSILON) {
      blocked = true;
      break;
    }
    position = moved;
    traveledDistance += stepDistance;
    remainingDistance = Math.max(0, remainingDistance - stepDistance);
    if (distance(position, waypoint) <= MOVEMENT_EPSILON) {
      position = { ...waypoint };
      waypointIndex += 1;
      continue;
    }
    break;
  }

  return {
    position,
    waypoints: waypoints.slice(waypointIndex),
    facing,
    traveledDistance,
    blocked,
  };
}

function resolveProjectileImpact(
  impact: ProjectileImpact,
  units: readonly BattleUnit[],
  buildings: readonly BattleBuilding[],
  damage: CombatDamageIntent[],
  statusEffectIntents: CombatStatusEffectIntent[],
  emit: EmitBattleEvent,
): void {
  const { projectile, position } = impact;
  emit({
    type: "projectile-hit",
    projectileId: projectile.id,
    attackerId: projectile.attackerId,
    targetId: projectile.targetId,
    targetType: projectile.targetType,
    role: projectile.role,
    ...(projectile.visualKind ? { visualKind: projectile.visualKind } : {}),
    position: { ...position },
    splashRadius: projectile.splashRadius,
  });
  const target = projectile.targetType === "unit"
    ? units.find((unit) => unit.id === projectile.targetId && unit.health > 0)
    : buildings.find((building) => (
        building.id === projectile.targetId
        && building.health > 0
        && building.status === "active"
      ));
  if (!target) return;

  damage.push({
    sourceId: projectile.attackerId,
    sourceType: projectile.sourceType,
    targetId: target.id,
    targetType: projectile.targetType,
    amount: projectile.damage,
  });
  queueStatusEffectIntents(
    projectile.attackerId,
    projectile.sourceType,
    target,
    projectile.onHitStatusEffects,
    statusEffectIntents,
  );
  if (projectile.splashRadius <= 0 || projectile.targetType !== "unit") return;
  for (const candidate of units) {
    if (
      candidate.id === target.id
      || candidate.health <= 0
      || candidate.faction !== target.faction
      || distance(candidate.position, position) > projectile.splashRadius
    ) continue;
    damage.push({
      sourceId: projectile.attackerId,
      sourceType: "unit",
      targetId: candidate.id,
      targetType: "unit",
      amount: projectile.damage * 0.55,
    });
    queueStatusEffectIntents(
      projectile.attackerId,
      projectile.sourceType,
      candidate,
      projectile.onHitStatusEffects,
      statusEffectIntents,
    );
  }
}

function queueStatusEffectIntents(
  sourceId: string,
  sourceType: CombatStatusEffectIntent["sourceType"],
  target: CombatTarget,
  applications: readonly UnitStatusEffectApplication[] | undefined,
  intents: CombatStatusEffectIntent[],
): void {
  if (target.targetType !== "unit" || !applications || applications.length === 0) return;
  for (const application of applications) {
    intents.push({
      sourceId,
      sourceType,
      targetId: target.id,
      application,
    });
  }
}

function periodicStatusDamageIntents(
  units: readonly BattleUnit[],
  fromTime: number,
  toTime: number,
): CombatDamageIntent[] {
  const intents: CombatDamageIntent[] = [];
  for (const unit of units) {
    if (unit.health <= 0) continue;
    for (const effect of unit.statusEffects) {
      const amount = periodicStatusDamageForInterval(effect, fromTime, toTime);
      if (amount <= 0) continue;
      intents.push({
        sourceId: effect.sourceId,
        sourceType: effect.sourceType,
        targetId: unit.id,
        targetType: "unit",
        amount,
      });
    }
  }
  return intents;
}

function settleUnitStatusEffects(
  units: readonly BattleUnit[],
  intents: readonly CombatStatusEffectIntent[],
  elapsed: number,
): BattleUnit[] {
  const intentsByTargetId = new Map<string, CombatStatusEffectIntent[]>();
  for (const intent of intents) {
    const targetIntents = intentsByTargetId.get(intent.targetId);
    if (targetIntents) targetIntents.push(intent);
    else intentsByTargetId.set(intent.targetId, [intent]);
  }
  return units.map((unit) => {
    if (unit.health <= 0 || unit.status === "dead") {
      return unit.statusEffects.length === 0 ? unit : { ...unit, statusEffects: [] };
    }
    let statusEffects = pruneUnitStatusEffects(unit.statusEffects, elapsed);
    for (const intent of intentsByTargetId.get(unit.id) ?? []) {
      statusEffects = applyUnitStatusEffect(
        statusEffects,
        intent.application,
        { id: intent.sourceId, targetType: intent.sourceType },
        elapsed,
      );
    }
    return statusEffects === unit.statusEffects ? unit : { ...unit, statusEffects };
  });
}

function applyDamageIntents(
  units: readonly BattleUnit[],
  intents: readonly CombatDamageIntent[],
  elapsed: number,
  emit: EmitBattleEvent,
  buildingSources: readonly BattleBuilding[] = [],
): BattleUnit[] {
  const livingIds = new Set(
    units.filter((unit) => unit.health > 0).map((unit) => unit.id),
  );
  const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));
  const buildingsById = new Map(buildingSources.map((building) => [building.id, building] as const));
  const remainingHealthById = new Map(units.map((unit) => [unit.id, unit.health] as const));
  const totals = new Map<string, { amount: number; killerId: string }>();

  for (const intent of intents) {
    if (intent.targetType !== "unit") continue;
    if (intent.amount <= 0 || !livingIds.has(intent.targetId)) continue;
    const source = intent.sourceType === "unit"
      ? unitsById.get(intent.sourceId)
      : buildingsById.get(intent.sourceId);
    const target = unitsById.get(intent.targetId);
    if (!source || !target) continue;
    const targetSpec = unitSpecFor(target.role, target.combatProfile);
    const mitigatedAmount = intent.amount * (1 - targetSpec.damageReduction);
    const remainingHealth = remainingHealthById.get(target.id) ?? 0;
    const appliedAmount = Math.min(mitigatedAmount, remainingHealth);
    if (appliedAmount <= 0) continue;
    remainingHealthById.set(target.id, remainingHealth - appliedAmount);
    emit({
      type: "damage-applied",
      sourceId: intent.sourceId,
      sourceRole: source.targetType === "unit"
        ? source.role
        : source.kind === "arrow-tower" || source.kind === "guard-tower"
          ? "arrow-tower"
          : "castle",
      sourcePosition: { ...source.position },
      targetId: intent.targetId,
      targetType: "unit",
      targetPosition: { ...target.position },
      amount: appliedAmount,
    });
    const current = totals.get(intent.targetId);
    totals.set(intent.targetId, {
      amount: (current?.amount ?? 0) + appliedAmount,
      killerId: current?.killerId ?? intent.sourceId,
    });
  }

  return units.map((unit) => {
    const total = totals.get(unit.id);
    if (!total) return unit;
    const damaged = applyDamage(unit, total.amount, elapsed);
    if (unit.health > 0 && damaged.health === 0) {
      emit({ type: "unit-died", unitId: unit.id, killerId: total.killerId });
    }
    return damaged;
  });
}

function resolveCastleWinner(
  buildings: readonly BattleBuilding[],
): Faction | "draw" | null {
  const verdant = buildings.find((building) => (
    building.kind === "castle" && building.faction === "verdant"
  ));
  const crimson = buildings.find((building) => (
    building.kind === "castle" && building.faction === "crimson"
  ));
  if (!verdant || !crimson) return null;
  const verdantDestroyed = verdant.health <= 0 || verdant.status === "destroyed";
  const crimsonDestroyed = crimson.health <= 0 || crimson.status === "destroyed";
  if (verdantDestroyed && crimsonDestroyed) return "draw";
  if (verdantDestroyed) return "crimson";
  if (crimsonDestroyed) return "verdant";
  return null;
}

function resolveTimeoutWinner(
  buildings: readonly BattleBuilding[],
): Faction | "draw" {
  const verdantHealth = buildings.find((building) => (
    building.kind === "castle" && building.faction === "verdant"
  ))?.health;
  const crimsonHealth = buildings.find((building) => (
    building.kind === "castle" && building.faction === "crimson"
  ))?.health;
  if (verdantHealth === undefined || crimsonHealth === undefined) return "draw";
  if (verdantHealth > crimsonHealth) return "verdant";
  if (crimsonHealth > verdantHealth) return "crimson";
  return "draw";
}

function applyDamage(unit: BattleUnit, amount: number, elapsed: number): BattleUnit {
  if (amount <= 0 || unit.health <= 0) return unit;
  const health = Math.max(0, unit.health - amount);
  return health === 0
    ? {
        ...unit,
        health,
        status: "dead",
        statusEffects: [],
        diedAt: elapsed,
        waypoints: [],
        currentTarget: null,
      }
    : { ...unit, health };
}

function advanceTowardTarget(
  unit: BattleUnit,
  target: CombatTarget,
  facing: number,
  deltaSeconds: number,
  map: BattlefieldMap,
  forcePath = false,
  enforceForwardProgress = true,
): BattleUnit {
  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const moveSpeed = spec.moveSpeed * unitStatusModifiers(unit.statusEffects).moveSpeedMultiplier;
  const maximumDistance = forcePath
    ? moveSpeed * deltaSeconds
    : Math.min(
        moveSpeed * deltaSeconds,
        Math.max(0, distance(unit.position, target.position) - spec.attackRange),
      );
  const navigationKey = `target:${target.targetType}:${target.id}`;
  if (spec.movementMode === "flying") {
    return {
      ...unit,
      position: enforceForwardProgress
        ? clampToForwardProgress(
            unit.faction,
            unit.position,
            moveToward(unit.position, target.position, maximumDistance),
            map,
          )
        : moveToward(unit.position, target.position, maximumDistance),
      facing,
      status: "moving",
      waypoints: [],
      navigationKey,
    };
  }
  let waypoints = unit.navigationKey === navigationKey ? unit.waypoints : [];
  if (waypoints.length === 0) {
    if (!forcePath) {
      const proposed = moveToward(unit.position, target.position, maximumDistance);
      const position = enforceForwardProgress
        ? walkableForwardPosition(unit.faction, unit.position, proposed, map)
        : walkablePosition(proposed, map);
      if (position) {
        return {
          ...unit,
          position,
          facing,
          status: "moving",
          waypoints: [],
          navigationKey,
        };
      }
    }
    const route = findWorldPath(map, unit.position, target.position);
    const waypoint = route[0];
    if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
    waypoints = route;
  }
  const waypoint = waypoints[0] ?? target.position;
  const requested = moveToward(unit.position, waypoint, maximumDistance);
  const moved = enforceForwardProgress
    ? walkableForwardPosition(unit.faction, unit.position, requested, map)
    : walkablePosition(requested, map);
  if (!moved) {
    const recovery = recoverBlockedGroundPosition(unit.position, maximumDistance, map);
    if (recovery) {
      return {
        ...unit,
        position: recovery.position,
        facing,
        status: "moving",
        waypoints: recovery.resetNavigation ? [] : waypoints,
        navigationKey: recovery.resetNavigation ? null : navigationKey,
      };
    }
    return { ...unit, facing, status: "idle", waypoints: [], navigationKey: null };
  }
  const arrivalDistance = waypoints.length > 1
    ? WAYPOINT_ARRIVAL_EPSILON
    : ARRIVAL_DISTANCE;
  if (distance(moved, waypoint) <= arrivalDistance) waypoints = waypoints.slice(1);
  return {
    ...unit,
    position: enforceForwardProgress
      ? clampToForwardProgress(unit.faction, unit.position, moved, map)
      : moved,
    waypoints,
    navigationKey,
    facing,
    status: "moving",
  };
}

function advanceTowardCombatPosition(
  unit: BattleUnit,
  destination: WorldPoint,
  navigationKey: string,
  facing: number,
  deltaSeconds: number,
  map: BattlefieldMap,
  enforceForwardProgress = true,
): BattleUnit {
  const spec = unitSpecFor(unit.role, unit.combatProfile);
  const maximumDistance = spec.moveSpeed
    * unitStatusModifiers(unit.statusEffects).moveSpeedMultiplier
    * deltaSeconds;
  if (unit.navigationKey === navigationKey && unit.waypoints.length > 0) {
    let waypoints = unit.waypoints;
    const waypoint = waypoints[0]!;
    const requested = moveToward(unit.position, waypoint, maximumDistance);
    const position = enforceForwardProgress
      ? walkableForwardPosition(unit.faction, unit.position, requested, map)
      : walkablePosition(requested, map);
    if (position) {
      if (distance(position, waypoint) <= WAYPOINT_ARRIVAL_EPSILON) {
        waypoints = waypoints.slice(1);
      }
      return {
        ...unit,
        position,
        facing,
        status: "moving",
        waypoints,
        navigationKey,
      };
    }
  }
  const requestedDirect = moveToward(unit.position, destination, maximumDistance);
  const direct = enforceForwardProgress
    ? walkableForwardPosition(unit.faction, unit.position, requestedDirect, map)
    : walkablePosition(requestedDirect, map);
  if (direct) {
    return {
      ...unit,
      position: direct,
      facing,
      status: "moving",
      waypoints: [],
      navigationKey,
    };
  }
  const route = findWorldPath(map, unit.position, destination);
  const waypoint = route[0];
  if (!waypoint) return { ...unit, facing, status: "idle", waypoints: [] };
  const requested = moveToward(unit.position, waypoint, maximumDistance);
  const position = enforceForwardProgress
    ? walkableForwardPosition(unit.faction, unit.position, requested, map)
    : walkablePosition(requested, map);
  if (!position) {
    const recovery = recoverBlockedGroundPosition(unit.position, maximumDistance, map);
    if (recovery) {
      return {
        ...unit,
        position: recovery.position,
        facing,
        status: "moving",
        waypoints: recovery.resetNavigation ? [] : route,
        navigationKey: recovery.resetNavigation ? null : navigationKey,
      };
    }
    return { ...unit, facing, status: "idle", waypoints: route, navigationKey };
  }
  return {
    ...unit,
    position,
    facing,
    status: "moving",
    waypoints: distance(position, waypoint) <= WAYPOINT_ARRIVAL_EPSILON
      ? route.slice(1)
      : route,
    navigationKey,
  };
}

export function appendUnitsToSquads(
  squads: readonly BattleSquad[],
  units: readonly BattleUnit[],
): readonly BattleSquad[] {
  if (units.length === 0) return squads;
  const next = new Map(squads.map((squad) => [squad.id, squad] as const));
  for (const unit of units) {
    const existing = next.get(unit.squadId);
    next.set(unit.squadId, existing
      ? {
          ...existing,
          memberIds: [...existing.memberIds, unit.id],
          initialSize: existing.initialSize + 1,
        }
      : {
          id: unit.squadId,
          faction: unit.faction,
          role: unit.role,
          memberIds: [unit.id],
          initialSize: 1,
        });
  }
  return [...next.values()];
}

function livingSquadIds(units: readonly BattleUnit[]): ReadonlySet<string> {
  return new Set(units.flatMap((unit) => (
    unit.health > 0 && unit.status !== "dead" ? [unit.squadId] : []
  )));
}

function createInitialDefensiveBuildings(
  structures: readonly BattlefieldStructure[],
  lifecyclePolicy: Parameters<typeof createBattleBuilding>[1],
): BattleBuilding[] {
  return structures.flatMap((structure) => {
    if (
      (structure.kind !== "castle" && structure.kind !== "arrow-tower")
      || structure.faction === null
    ) return [];
    return [createBattleBuilding({
      id: structure.id,
      kind: structure.kind,
      faction: structure.faction,
      coordinate: structure.coordinate,
      createdAt: 0,
    }, lifecyclePolicy)];
  });
}

function resolveModeId(
  requestedModeId: BattleModeId | undefined,
  matchPolicy: MatchPolicy | undefined,
): BattleModeId {
  const modeId = requestedModeId ?? matchPolicy?.mode ?? "normal";
  if (requestedModeId && matchPolicy && requestedModeId !== matchPolicy.mode) {
    throw new Error(
      `Battle mode ${requestedModeId} conflicts with match policy ${matchPolicy.mode}.`,
    );
  }
  return modeId;
}

function moveToward(origin: WorldPoint, destination: WorldPoint, maximumDistance: number): WorldPoint {
  const dx = destination.x - origin.x;
  const dz = destination.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (length <= maximumDistance || length === 0) return { ...destination };
  const ratio = maximumDistance / length;
  return { x: origin.x + dx * ratio, z: origin.z + dz * ratio };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function walkableForwardPosition(
  faction: Faction,
  origin: WorldPoint,
  requested: WorldPoint,
  map: BattlefieldMap,
): WorldPoint | null {
  const position = clampToForwardProgress(faction, origin, requested, map);
  return getMapCell(map, worldToAxial(position))?.walkable ? position : null;
}

function walkablePosition(
  requested: WorldPoint,
  map: BattlefieldMap,
): WorldPoint | null {
  return getMapCell(map, worldToAxial(requested))?.walkable
    ? requested
    : null;
}

function moveTowardWalkableCellCenter(
  origin: WorldPoint,
  maximumDistance: number,
  map: BattlefieldMap,
): WorldPoint | null {
  const coordinate = worldToAxial(origin);
  if (!getMapCell(map, coordinate)?.walkable) return null;
  const center = axialToWorld(coordinate);
  if (distance(origin, center) <= 1e-9) return null;
  const position = moveToward(origin, center, maximumDistance);
  return getMapCell(map, worldToAxial(position))?.walkable ? position : null;
}

function recoverBlockedGroundPosition(
  origin: WorldPoint,
  maximumDistance: number,
  map: BattlefieldMap,
): { readonly position: WorldPoint; readonly resetNavigation: boolean } | null {
  const recentered = moveTowardWalkableCellCenter(origin, maximumDistance, map);
  if (recentered) return { position: recentered, resetNavigation: false };
  const resolved = resolveWalkableWorldPoint(map, origin);
  return resolved && distance(resolved, origin) > 1e-9
    ? { position: resolved, resetNavigation: true }
    : null;
}

function hasWalkableAttackLine(
  origin: WorldPoint,
  target: CombatTarget,
  map: BattlefieldMap,
): boolean {
  const dx = target.position.x - origin.x;
  const dz = target.position.z - origin.z;
  const length = Math.hypot(dx, dz);
  const clearance = target.targetType === "building"
    ? BUILDING_ATTACK_LINE_CLEARANCE
    : 0;
  const sampledLength = Math.max(0, length - clearance);
  const sampleCount = Math.max(1, Math.ceil(sampledLength / ATTACK_LINE_SAMPLE_DISTANCE));
  for (let index = 0; index <= sampleCount; index += 1) {
    const distanceAlongLine = sampledLength * index / sampleCount;
    const ratio = length > 1e-9 ? distanceAlongLine / length : 0;
    const point = {
      x: origin.x + dx * ratio,
      z: origin.z + dz * ratio,
    };
    if (!getMapCell(map, worldToAxial(point))?.walkable) return false;
  }
  return true;
}

function cloneUnit(unit: BattleUnit): BattleUnit {
  return {
    ...unit,
    position: { ...unit.position },
    formationSlot: { ...unit.formationSlot },
    waypoints: unit.waypoints.map((waypoint) => ({ ...waypoint })),
    statusEffects: unit.statusEffects.map((effect) => ({ ...effect })),
    engagementSlot: unit.engagementSlot
      ? { ...unit.engagementSlot, position: { ...unit.engagementSlot.position } }
      : null,
  };
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function nearbyEnemyUnits(
  unit: BattleUnit,
  spatialIndex: BattleSpatialIndex,
): BattleUnit[] {
  const nearby = spatialIndex.enemiesWithin(
    unit,
    unitSpecFor(unit.role, unit.combatProfile).aggroRange,
  );
  if (
    !unit.currentTarget
    || unit.currentTarget.targetType !== "unit"
    || nearby.some((candidate) => candidate.id === unit.currentTarget?.targetId)
  ) {
    return nearby;
  }
  const current = spatialIndex.unitById(unit.currentTarget.targetId);
  return current && current.health > 0 && current.faction !== unit.faction
    ? [...nearby, current]
    : nearby;
}
