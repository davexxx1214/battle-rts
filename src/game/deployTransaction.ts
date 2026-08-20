import {
  appendUnitsToSquads,
  createBattleUnit,
  getBattleMatchClock,
} from "./battle";
import { createFormationSlots } from "./formation";
import type { BattleSessionState } from "./battleSessionState";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import { createBattleBuilding } from "./buildings";
import {
  areWorldPointsConnected,
} from "./navigation";
import {
  hasBuildableHex,
  recordSuccessfulDeployment,
  requestBuildingPlacement,
  resolveWorldHex,
  validBuildingDeploymentCoordinates,
  type BuildingPlacementFailureReason,
} from "./deployment";
import { trySpendGold } from "./economy";
import { stampBattleEvent } from "./events";
import {
  BUILDING_ACTIVE_LIMITS,
  deploymentCostForRace,
  isBuildingDeployable,
  troopCountForRace,
  unitRoleForRace,
  type BuildingKind,
  type DeployableKind,
  type TroopKind,
} from "./rules";
import { resolveBattleRace } from "./factions";
import type { BattleRace } from "./types";
import type { Faction, WorldPoint } from "./types";
import {
  axialToWorld,
  coordinateKey,
  getMapCell,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";

export type DeploymentFailureReason =
  | BuildingPlacementFailureReason
  | "insufficient-gold"
  | "building-limit"
  | "direct-deployment-disabled"
  | "deployment-closed"
  | "match-over"
  | "unwalkable-hex";

export interface DeploymentRequest {
  readonly faction: Faction;
  readonly kind: DeployableKind;
  readonly worldPosition: WorldPoint;
}

export type DeployableAvailability =
  | { readonly enabled: true; readonly reason: null }
  | { readonly enabled: false; readonly reason: DeploymentFailureReason };

export type DeploymentPreview =
  | {
      readonly valid: true;
      readonly reason: null;
      readonly coordinate: HexCoordinate;
      readonly position: WorldPoint;
      readonly requestedPosition: WorldPoint;
      readonly unitPositions: readonly WorldPoint[];
    }
  | {
      readonly valid: false;
      readonly reason: DeploymentFailureReason;
      readonly coordinate: HexCoordinate | null;
      readonly position: WorldPoint | null;
      readonly requestedPosition: WorldPoint;
    };

type DeploymentSuccessDetails =
  | {
      readonly entityType: "building";
      readonly kind: BuildingKind;
      readonly buildingId: string;
      readonly quantity: 1;
    }
  | {
      readonly entityType: "squad";
      readonly kind: TroopKind;
      readonly squadId: string;
      readonly unitIds: readonly string[];
      readonly quantity: number;
    };

export type DeploymentResult =
  | ({
      readonly ok: true;
      readonly state: BattleSessionState;
      readonly deploymentId: string;
      readonly coordinate: HexCoordinate;
      readonly position: WorldPoint;
    } & DeploymentSuccessDetails)
  | {
      readonly ok: false;
      readonly state: BattleSessionState;
      readonly reason: DeploymentFailureReason;
    };

export function getDeployableAvailability(
  session: BattleSessionState,
  faction: Faction,
  kind: DeployableKind,
): DeployableAvailability {
  if (session.phase !== "engaged") {
    return { enabled: false, reason: "deployment-closed" };
  }
  const state = session.battle;
  const runtime = resolveBattleRuntimeContext(state);
  if (runtime.mode.acquisitionPolicy.kind !== "direct-deployment") {
    return { enabled: false, reason: "direct-deployment-disabled" };
  }
  if (state.winner !== null || getBattleMatchClock(state).timedOut) {
    return { enabled: false, reason: "match-over" };
  }
  const race = resolveBattleRace(state.factionRaces, faction, state.undeadOpponent);
  if (state.economy.accounts[faction].gold < deploymentCostForRace(kind, race)) {
    return { enabled: false, reason: "insufficient-gold" };
  }
  if (isBuildingDeployable(kind)) {
    const maximum = BUILDING_ACTIVE_LIMITS[kind];
    const existing = state.buildings.filter((building) => (
      building.faction === faction && building.kind === kind
    )).length;
    if (existing >= maximum) return { enabled: false, reason: "building-limit" };
    if (!hasBuildableHex(runtime.map, faction, state.buildingOccupancy, state.units)) {
      return { enabled: false, reason: "no-buildable-hex" };
    }
  }
  return { enabled: true, reason: null };
}

export function previewDeployment(
  session: BattleSessionState,
  request: DeploymentRequest,
): DeploymentPreview {
  const state = session.battle;
  const { map } = resolveBattleRuntimeContext(state);
  const availability = getDeployableAvailability(
    session,
    request.faction,
    request.kind,
  );
  if (!availability.enabled) {
    return invalidPreview(availability.reason, request.worldPosition, map);
  }

  const deploymentId = deploymentEntityId(
    request.faction,
    request.kind,
    state.nextDeploymentSequence + 1,
  );
  if (isBuildingDeployable(request.kind)) {
    const placement = requestBuildingPlacement(map, state.buildingOccupancy, {
      buildingId: deploymentId,
      kind: request.kind,
      faction: request.faction,
      worldPosition: request.worldPosition,
    }, state.units);
    if (!placement.ok) {
      return invalidPreview(placement.reason, request.worldPosition, map);
    }
    return validPreview(placement.coordinate, [], request.worldPosition);
  }

  const coordinate = resolveWorldHex(map, request.worldPosition);
  if (!coordinate) {
    return invalidPreview("outside-battlefield", request.worldPosition, map);
  }
  const cell = getMapCell(map, coordinate);
  if (!cell) return invalidPreview("outside-battlefield", request.worldPosition, map);
  if (cell.territory !== null && cell.territory !== request.faction) {
    return invalidPreview("enemy-territory", request.worldPosition, map);
  }
  if (cell.territory !== request.faction || !cell.walkable) {
    return invalidPreview("unwalkable-hex", request.worldPosition, map);
  }
  const occupiedBuildings = occupiedBuildingKeys(state);
  if (occupiedBuildings.has(coordinateKey(coordinate))) {
    return invalidPreview("occupied-hex", request.worldPosition, map);
  }
  const unitPositions = planTroopPositions(
    request.faction,
    request.kind,
    coordinate,
    occupiedBuildings,
    resolveBattleRace(state.factionRaces, request.faction, state.undeadOpponent),
    map,
  );
  if (!unitPositions.ok) {
    return invalidPreview(unitPositions.reason, request.worldPosition, map);
  }
  return validPreview(coordinate, unitPositions.positions, request.worldPosition);
}

export function validDeploymentCoordinates(
  session: BattleSessionState,
  faction: Faction,
  kind: DeployableKind,
): readonly HexCoordinate[] {
  const availability = getDeployableAvailability(session, faction, kind);
  if (!availability.enabled) return [];
  const state = session.battle;
  const { map } = resolveBattleRuntimeContext(state);
  if (isBuildingDeployable(kind)) {
    return validBuildingDeploymentCoordinates(
      map,
      faction,
      state.buildingOccupancy,
      state.units,
    );
  }
  const occupiedBuildings = occupiedBuildingKeys(state);
  return map.cells
    .filter((cell) => (
      cell.territory === faction
      && cell.walkable
      && planTroopPositions(
        faction,
        kind,
        cell,
        occupiedBuildings,
        resolveBattleRace(state.factionRaces, faction, state.undeadOpponent),
        map,
      ).ok
    ))
    .map(({ q, r }) => ({ q, r }));
}

export function deployBattleSessionEntity(
  session: BattleSessionState,
  request: DeploymentRequest,
): DeploymentResult {
  const state = session.battle;
  const runtime = resolveBattleRuntimeContext(state);
  const preview = previewDeployment(session, request);
  if (!preview.valid) return { ok: false, state: session, reason: preview.reason };

  const sequence = state.nextDeploymentSequence + 1;
  const deploymentId = deploymentEntityId(request.faction, request.kind, sequence);
  const race = resolveBattleRace(
    state.factionRaces,
    request.faction,
    state.undeadOpponent,
  );
  const spend = trySpendGold(
    state.economy,
    request.faction,
    deploymentCostForRace(request.kind, race),
    runtime.mode.economyPolicy,
  );
  // previewDeployment already checked this. Keeping the guard here makes the
  // transaction fail closed if economy validation ever becomes stricter.
  if (!spend.spent) {
    return { ok: false, state: session, reason: "insufficient-gold" };
  }

  let buildings = state.buildings;
  let occupancy = state.buildingOccupancy;
  let units = state.units;
  let squads = state.squads;
  let successDetails: DeploymentSuccessDetails;
  if (isBuildingDeployable(request.kind)) {
    const placement = requestBuildingPlacement(runtime.map, occupancy, {
      buildingId: deploymentId,
      kind: request.kind,
      faction: request.faction,
      worldPosition: request.worldPosition,
    }, units);
    // This is a deterministic replay of the validated preview and cannot fail
    // without a programming error. Do not commit a partial state if it does.
    if (!placement.ok) {
      return { ok: false, state: session, reason: placement.reason };
    }
    occupancy = placement.occupancy;
    buildings = [...buildings, createBattleBuilding({
      id: deploymentId,
      kind: request.kind,
      faction: request.faction,
      coordinate: preview.coordinate,
      createdAt: state.matchElapsed,
    }, runtime.mode.buildingLifecyclePolicy)];
    successDetails = {
      entityType: "building",
      kind: request.kind,
      buildingId: deploymentId,
      quantity: 1,
    };
  } else {
    const deployedUnits = createDeployedUnits(
      deploymentId,
      request.faction,
      request.kind,
      preview.unitPositions,
      race,
    );
    units = [...units, ...deployedUnits];
    squads = appendUnitsToSquads(squads, deployedUnits);
    successDetails = {
      entityType: "squad",
      kind: request.kind,
      squadId: `${deploymentId}-squad`,
      unitIds: deployedUnits.map((unit) => unit.id),
      quantity: deployedUnits.length,
    };
  }

  const deploymentEvent = stampBattleEvent({
    type: "deployment-succeeded",
    faction: request.faction,
    deploymentId,
    ...successDetails,
    coordinate: preview.coordinate,
    position: preview.position,
  }, state.nextEventSequence, state.elapsed);
  return {
    ok: true,
    deploymentId,
    ...successDetails,
    coordinate: preview.coordinate,
    position: preview.position,
    state: {
      ...session,
      battle: {
        ...state,
        units,
        squads,
        buildings,
        buildingOccupancy: occupancy,
        deploymentCounts: recordSuccessfulDeployment(
          state.deploymentCounts,
          request.faction,
          request.kind,
        ),
        economy: spend.state,
        events: [...state.events, deploymentEvent],
        nextDeploymentSequence: sequence,
        nextEventSequence: state.nextEventSequence + 1,
        revision: state.revision + 1,
      },
    },
  };
}

function createDeployedUnits(
  deploymentId: string,
  faction: Faction,
  kind: TroopKind,
  positions: readonly WorldPoint[],
  race: BattleRace,
) {
  const squadId = `${deploymentId}-squad`;
  return positions.map((memberPosition, index) => createBattleUnit({
    id: `${deploymentId}-member-${index + 1}`,
    squadId,
    faction,
    role: unitRoleForRace(kind, race),
    combatProfile: race,
    position: memberPosition,
  }));
}

function validPreview(
  coordinate: HexCoordinate,
  unitPositions: readonly WorldPoint[],
  requestedPosition: WorldPoint,
): DeploymentPreview {
  return {
    valid: true,
    reason: null,
    coordinate: { ...coordinate },
    position: axialToWorld(coordinate),
    requestedPosition: { ...requestedPosition },
    unitPositions,
  };
}

function planTroopPositions(
  faction: Faction,
  kind: TroopKind,
  coordinate: HexCoordinate,
  occupiedBuildings: ReadonlySet<string>,
  race: BattleRace,
  map: BattlefieldMap,
): { readonly ok: true; readonly positions: readonly WorldPoint[] }
  | { readonly ok: false; readonly reason: DeploymentFailureReason } {
  const center = axialToWorld(coordinate);
  const destination = axialToWorld(
    map.castleApproaches[faction === "verdant" ? "crimson" : "verdant"],
  );
  const facing = faction === "verdant" ? Math.PI : 0;
  const positions = createFormationSlots(
    troopCountForRace(kind, race),
    center,
    facing,
  );
  for (const position of positions) {
    const memberCoordinate = resolveWorldHex(map, position);
    if (!memberCoordinate) return { ok: false, reason: "outside-battlefield" };
    const cell = getMapCell(map, memberCoordinate);
    if (!cell) return { ok: false, reason: "outside-battlefield" };
    if (cell.territory !== null && cell.territory !== faction) {
      return { ok: false, reason: "enemy-territory" };
    }
    if (cell.territory !== faction || !cell.walkable) {
      return { ok: false, reason: "unwalkable-hex" };
    }
    if (!areWorldPointsConnected(map, position, destination)) {
      return { ok: false, reason: "unwalkable-hex" };
    }
    if (occupiedBuildings.has(coordinateKey(memberCoordinate))) {
      return { ok: false, reason: "occupied-hex" };
    }
  }
  return { ok: true, positions };
}

function occupiedBuildingKeys(
  state: BattleSessionState["battle"],
): ReadonlySet<string> {
  return new Set([
    ...Object.keys(state.buildingOccupancy),
    ...state.buildings
      .filter((building) => building.health > 0 && building.status === "active")
      .map((building) => coordinateKey(building.coordinate)),
  ]);
}

function invalidPreview(
  reason: DeploymentFailureReason,
  point: WorldPoint,
  map: BattlefieldMap,
): DeploymentPreview {
  const coordinate = resolveWorldHex(map, point);
  return {
    valid: false,
    reason,
    coordinate,
    position: coordinate ? axialToWorld(coordinate) : null,
    requestedPosition: { ...point },
  };
}

function deploymentEntityId(
  faction: Faction,
  kind: DeployableKind,
  sequence: number,
): string {
  return `${faction}-${kind}-${sequence}`;
}
