import {
  appendUnitsToSquads,
  createBattleUnit,
} from "./battle";
import type { BattleSessionState } from "./battleSessionState";
import { createBattleBuilding } from "./buildings";
import {
  hasBuildableHex,
  recordSuccessfulDeployment,
  requestBuildingPlacement,
  resolveWorldHex,
  type BuildingPlacementFailureReason,
} from "./deployment";
import { trySpendGold } from "./economy";
import { stampBattleEvent } from "./events";
import {
  BUILDING_ACTIVE_LIMITS,
  GAME_RULES,
  TROOP_ROLE_BY_DEPLOYABLE,
  isBuildingDeployable,
  type DeployableKind,
  type TroopKind,
} from "./rules";
import type { Faction, WorldPoint } from "./types";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  coordinateKey,
  getMapCell,
  type HexCoordinate,
} from "../map/battlefield";

export type DeploymentFailureReason =
  | BuildingPlacementFailureReason
  | "insufficient-gold"
  | "building-limit"
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
    }
  | {
      readonly valid: false;
      readonly reason: DeploymentFailureReason;
      readonly coordinate: HexCoordinate | null;
      readonly position: WorldPoint | null;
    };

export type DeploymentResult =
  | {
      readonly ok: true;
      readonly state: BattleSessionState;
      readonly entityId: string;
      readonly coordinate: HexCoordinate;
      readonly position: WorldPoint;
    }
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
  if (state.winner !== null || state.matchElapsed >= GAME_RULES.match.durationSeconds) {
    return { enabled: false, reason: "match-over" };
  }
  if (state.economy.accounts[faction].gold < GAME_RULES.deployment.costs[kind]) {
    return { enabled: false, reason: "insufficient-gold" };
  }
  if (isBuildingDeployable(kind)) {
    const maximum = BUILDING_ACTIVE_LIMITS[kind];
    const existing = state.buildings.filter((building) => (
      building.faction === faction && building.kind === kind
    )).length;
    if (existing >= maximum) return { enabled: false, reason: "building-limit" };
    if (!hasBuildableHex(BATTLEFIELD_MAP, faction, state.buildingOccupancy)) {
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
  const availability = getDeployableAvailability(
    session,
    request.faction,
    request.kind,
  );
  if (!availability.enabled) {
    return invalidPreview(availability.reason, request.worldPosition);
  }

  const entityId = deploymentEntityId(
    request.faction,
    request.kind,
    state.nextDeploymentSequence + 1,
  );
  if (isBuildingDeployable(request.kind)) {
    const placement = requestBuildingPlacement(BATTLEFIELD_MAP, state.buildingOccupancy, {
      buildingId: entityId,
      kind: request.kind,
      faction: request.faction,
      worldPosition: request.worldPosition,
    });
    if (!placement.ok) {
      return invalidPreview(placement.reason, request.worldPosition);
    }
    return validPreview(placement.coordinate);
  }

  const coordinate = resolveWorldHex(BATTLEFIELD_MAP, request.worldPosition);
  if (!coordinate) {
    return invalidPreview("outside-battlefield", request.worldPosition);
  }
  const cell = getMapCell(BATTLEFIELD_MAP, coordinate);
  if (!cell) return invalidPreview("outside-battlefield", request.worldPosition);
  if (cell.territory !== null && cell.territory !== request.faction) {
    return invalidPreview("enemy-territory", request.worldPosition);
  }
  if (cell.territory !== request.faction || !cell.walkable) {
    return invalidPreview("unwalkable-hex", request.worldPosition);
  }
  if (state.buildingOccupancy[coordinateKey(coordinate)]) {
    return invalidPreview("occupied-hex", request.worldPosition);
  }
  return validPreview(coordinate);
}

export function deployBattleSessionEntity(
  session: BattleSessionState,
  request: DeploymentRequest,
): DeploymentResult {
  const state = session.battle;
  const preview = previewDeployment(session, request);
  if (!preview.valid) return { ok: false, state: session, reason: preview.reason };

  const sequence = state.nextDeploymentSequence + 1;
  const entityId = deploymentEntityId(request.faction, request.kind, sequence);
  const spend = trySpendGold(
    state.economy,
    request.faction,
    GAME_RULES.deployment.costs[request.kind],
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
  if (isBuildingDeployable(request.kind)) {
    const placement = requestBuildingPlacement(BATTLEFIELD_MAP, occupancy, {
      buildingId: entityId,
      kind: request.kind,
      faction: request.faction,
      worldPosition: request.worldPosition,
    });
    // This is a deterministic replay of the validated preview and cannot fail
    // without a programming error. Do not commit a partial state if it does.
    if (!placement.ok) {
      return { ok: false, state: session, reason: placement.reason };
    }
    occupancy = placement.occupancy;
    buildings = [...buildings, createBattleBuilding({
      id: entityId,
      kind: request.kind,
      faction: request.faction,
      coordinate: preview.coordinate,
      createdAt: state.matchElapsed,
    })];
  } else {
    const unit = createDeployedUnit(entityId, request.faction, request.kind, preview.position);
    units = [...units, unit];
    squads = appendUnitsToSquads(squads, [unit]);
  }

  const deploymentEvent = stampBattleEvent({
    type: "deployment-succeeded",
    faction: request.faction,
    entityId,
    kind: request.kind,
    coordinate: preview.coordinate,
    position: preview.position,
  }, state.nextEventSequence, state.elapsed);
  return {
    ok: true,
    entityId,
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

function createDeployedUnit(
  entityId: string,
  faction: Faction,
  kind: TroopKind,
  position: WorldPoint,
) {
  return createBattleUnit({
    id: entityId,
    squadId: `${entityId}-squad`,
    faction,
    role: TROOP_ROLE_BY_DEPLOYABLE[kind],
    position,
  });
}

function validPreview(coordinate: HexCoordinate): DeploymentPreview {
  return {
    valid: true,
    reason: null,
    coordinate: { ...coordinate },
    position: axialToWorld(coordinate),
  };
}

function invalidPreview(
  reason: DeploymentFailureReason,
  point: WorldPoint,
): DeploymentPreview {
  const coordinate = resolveWorldHex(BATTLEFIELD_MAP, point);
  return {
    valid: false,
    reason,
    coordinate,
    position: coordinate ? axialToWorld(coordinate) : null,
  };
}

function deploymentEntityId(
  faction: Faction,
  kind: DeployableKind,
  sequence: number,
): string {
  return `${faction}-${kind}-${sequence}`;
}
