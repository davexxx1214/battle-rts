import type { BattleState, BattleUnit } from "./battle";
import type { CombatTargetType } from "./combat";
import type { Faction, WorldPoint } from "./types";
import {
  HEX_NEIGHBOR_OFFSETS,
  axialToWorld,
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import { battlefieldDefinitionFor } from "../map/battlefieldDefinition";
import {
  areWorldPointsConnected,
  findWorldPath,
  resolveWalkableWorldPoint,
} from "./navigation";

export type SandboxSquadOrderKind =
  | "move"
  | "attack"
  | "attack-move"
  | "stop"
  | "hold";

export interface SandboxSquadOrderTarget {
  readonly targetType: CombatTargetType;
  readonly targetId: string;
}

export interface SandboxSquadOrder {
  readonly squadId: string;
  readonly faction: Faction;
  readonly sequence: number;
  readonly kind: SandboxSquadOrderKind;
  /** Per-squad formation destination for move and attack-move. */
  readonly destination: WorldPoint | null;
  readonly target: SandboxSquadOrderTarget | null;
  /** Stable leash anchor captured when hold is issued. */
  readonly holdPosition: WorldPoint | null;
}

export interface SandboxSquadOrderState {
  readonly ordersBySquadId: Readonly<Record<string, SandboxSquadOrder>>;
  readonly nextSequence: number;
}

export interface IssueSandboxSquadOrderRequest {
  readonly faction: Faction;
  readonly squadIds: readonly string[];
  readonly kind: SandboxSquadOrderKind;
  readonly destination?: WorldPoint;
  readonly target?: SandboxSquadOrderTarget;
}

export type SandboxSquadOrderFailureReason =
  | "sandbox-mode-required"
  | "match-over"
  | "empty-selection"
  | "squad-not-found"
  | "faction-mismatch"
  | "invalid-destination"
  | "no-path"
  | "target-not-found"
  | "friendly-target"
  | "invalid-order";

export type IssueSandboxSquadOrderResult =
  | {
      readonly ok: true;
      readonly battle: BattleState;
      readonly orders: readonly SandboxSquadOrder[];
      readonly markerPosition: WorldPoint | null;
    }
  | {
      readonly ok: false;
      readonly battle: BattleState;
      readonly reason: SandboxSquadOrderFailureReason;
    };

export function createSandboxSquadOrderState(): SandboxSquadOrderState {
  return freezeState({}, 1);
}

export function sandboxSquadOrderFor(
  state: SandboxSquadOrderState,
  squadId: string,
): SandboxSquadOrder | null {
  return Object.hasOwn(state.ordersBySquadId, squadId)
    ? state.ordersBySquadId[squadId] ?? null
    : null;
}

/**
 * Authoritative transaction shared by player controls and the future sandbox AI.
 * It validates the complete selection before changing any unit or order state.
 */
export function issueSandboxSquadOrder(
  battle: BattleState,
  request: IssueSandboxSquadOrderRequest,
): IssueSandboxSquadOrderResult {
  if (battle.modeId !== "sandbox") {
    return failure(battle, "sandbox-mode-required");
  }
  if (battle.winner !== null || battle.resolvedAt !== null) {
    return failure(battle, "match-over");
  }
  if (!isOrderKind(request.kind)) return failure(battle, "invalid-order");
  const squadIds = [...new Set(request.squadIds)].sort();
  if (squadIds.length === 0) return failure(battle, "empty-selection");

  const livingMembersBySquad = new Map<string, BattleUnit[]>();
  for (const unit of battle.units) {
    if (unit.health <= 0 || unit.status === "dead") continue;
    const members = livingMembersBySquad.get(unit.squadId) ?? [];
    members.push(unit);
    livingMembersBySquad.set(unit.squadId, members);
  }
  for (const squadId of squadIds) {
    const members = livingMembersBySquad.get(squadId);
    if (!members || members.length === 0) return failure(battle, "squad-not-found");
    if (members.some((unit) => unit.faction !== request.faction)) {
      return failure(battle, "faction-mismatch");
    }
  }

  const map = battlefieldDefinitionFor(battle.mapId).map;
  const state = battle.squadOrders ?? createSandboxSquadOrderState();
  const sequence = state.nextSequence;
  const centers = new Map(squadIds.map((squadId) => [
    squadId,
    squadCenter(livingMembersBySquad.get(squadId)!),
  ] as const));
  let destinations = new Map<string, WorldPoint>();
  let target: SandboxSquadOrderTarget | null = null;
  let markerPosition: WorldPoint | null = null;

  if (request.kind === "move" || request.kind === "attack-move") {
    const destination = validMapPoint(map, request.destination);
    if (!destination) return failure(battle, "invalid-destination");
    const formation = formationDestinations(map, destination, squadIds, centers);
    if (!formation) return failure(battle, "no-path");
    destinations = formation;
    markerPosition = destination;
  } else if (request.kind === "attack") {
    if (!request.target || !isCombatTargetType(request.target.targetType)) {
      return failure(battle, "invalid-order");
    }
    const combatTarget = request.target.targetType === "unit"
      ? battle.units.find((unit) => unit.id === request.target!.targetId)
      : battle.buildings.find((building) => building.id === request.target!.targetId);
    if (!combatTarget || combatTarget.health <= 0) return failure(battle, "target-not-found");
    if (combatTarget.faction === request.faction) return failure(battle, "friendly-target");
    const approach = resolveWalkableWorldPoint(map, combatTarget.position);
    if (!approach) return failure(battle, "no-path");
    for (const squadId of squadIds) {
      if (!areWorldPointsConnected(map, centers.get(squadId)!, approach)) {
        return failure(battle, "no-path");
      }
    }
    target = Object.freeze({ ...request.target });
    markerPosition = { ...combatTarget.position };
  }

  const orders = squadIds.map((squadId) => {
    const order = freezeOrder({
      squadId,
      faction: request.faction,
      sequence,
      kind: request.kind,
      destination: destinations.get(squadId) ?? null,
      target,
      holdPosition: request.kind === "hold" ? centers.get(squadId)! : null,
    });
    return order;
  });
  const orderEntries = new Map(Object.entries(state.ordersBySquadId));
  for (const order of orders) orderEntries.set(order.squadId, order);
  const ordersBySquadId = Object.fromEntries(orderEntries);

  const orderBySquadId = new Map(orders.map((order) => [order.squadId, order] as const));
  const units = battle.units.map((unit) => {
    const order = orderBySquadId.get(unit.squadId);
    if (!order || unit.health <= 0 || unit.status === "dead") return unit;
    if (order.kind === "move" || order.kind === "attack-move") {
      const waypoints = findWorldPath(map, unit.position, order.destination!);
      const arrived = waypoints.length === 0
        && distance(unit.position, order.destination!) <= 0.12;
      return {
        ...unit,
        behavior: "charging" as const,
        currentTarget: null,
        engagementSlot: null,
        formationSlot: { ...order.destination! },
        waypoints,
        navigationKey: arrived ? null : `order:${order.sequence}:${order.kind}`,
        status: arrived ? "idle" as const : "moving" as const,
      };
    }
    return {
      ...unit,
      behavior: "charging" as const,
      currentTarget: order.kind === "attack" ? order.target : null,
      engagementSlot: null,
      waypoints: [],
      navigationKey: null,
      status: "idle" as const,
    };
  });
  return Object.freeze({
    ok: true,
    orders,
    markerPosition,
    battle: {
      ...battle,
      units,
      squadOrders: freezeState(ordersBySquadId, sequence + 1),
      revision: battle.revision + 1,
    },
  });
}

export function pruneSandboxSquadOrders(
  state: SandboxSquadOrderState,
  livingSquadIds: ReadonlySet<string>,
): SandboxSquadOrderState {
  const entries = Object.entries(state.ordersBySquadId).filter(([squadId]) => (
    livingSquadIds.has(squadId)
  ));
  if (entries.length === Object.keys(state.ordersBySquadId).length) return state;
  return freezeState(Object.fromEntries(entries), state.nextSequence);
}

function formationDestinations(
  map: BattlefieldMap,
  destination: WorldPoint,
  squadIds: readonly string[],
  centers: ReadonlyMap<string, WorldPoint>,
): Map<string, WorldPoint> | null {
  const centerCoordinate = worldToAxial(destination);
  const candidates = formationCoordinates(centerCoordinate, Math.max(2, squadIds.length))
    .filter((coordinate) => getMapCell(map, coordinate)?.walkable === true);
  const used = new Set<string>();
  const result = new Map<string, WorldPoint>();
  for (const squadId of squadIds) {
    const origin = centers.get(squadId)!;
    const candidate = candidates.find((coordinate) => (
      !used.has(coordinateKey(coordinate))
      && areWorldPointsConnected(map, origin, axialToWorld(coordinate))
    ));
    if (!candidate) return null;
    used.add(coordinateKey(candidate));
    result.set(squadId, axialToWorld(candidate));
  }
  return result;
}

function formationCoordinates(
  center: HexCoordinate,
  required: number,
): HexCoordinate[] {
  const coordinates: HexCoordinate[] = [{ ...center }];
  for (let radius = 1; coordinates.length < required * 3 && radius <= 6; radius += 1) {
    let coordinate = addCoordinate(center, scaleCoordinate(HEX_NEIGHBOR_OFFSETS[4]!, radius));
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < radius; step += 1) {
        coordinates.push({ ...coordinate });
        coordinate = addCoordinate(coordinate, HEX_NEIGHBOR_OFFSETS[side]!);
      }
    }
  }
  return coordinates;
}

function validMapPoint(
  map: BattlefieldMap,
  requested: WorldPoint | undefined,
): WorldPoint | null {
  if (
    !requested
    || !Number.isFinite(requested.x)
    || !Number.isFinite(requested.z)
    || getMapCell(map, worldToAxial(requested))?.walkable !== true
  ) return null;
  return axialToWorld(worldToAxial(requested));
}

function squadCenter(units: readonly BattleUnit[]): WorldPoint {
  return {
    x: units.reduce((sum, unit) => sum + unit.position.x, 0) / units.length,
    z: units.reduce((sum, unit) => sum + unit.position.z, 0) / units.length,
  };
}

function freezeState(
  ordersBySquadId: Readonly<Record<string, SandboxSquadOrder>>,
  nextSequence: number,
): SandboxSquadOrderState {
  return Object.freeze({
    ordersBySquadId: Object.freeze({ ...ordersBySquadId }),
    nextSequence,
  });
}

function freezeOrder(order: SandboxSquadOrder): SandboxSquadOrder {
  return Object.freeze({
    ...order,
    destination: order.destination ? Object.freeze({ ...order.destination }) : null,
    target: order.target ? Object.freeze({ ...order.target }) : null,
    holdPosition: order.holdPosition ? Object.freeze({ ...order.holdPosition }) : null,
  });
}

function failure(
  battle: BattleState,
  reason: SandboxSquadOrderFailureReason,
): IssueSandboxSquadOrderResult {
  return Object.freeze({ ok: false, battle, reason });
}

function isOrderKind(value: string): value is SandboxSquadOrderKind {
  return value === "move"
    || value === "attack"
    || value === "attack-move"
    || value === "stop"
    || value === "hold";
}

function isCombatTargetType(value: string): value is CombatTargetType {
  return value === "unit" || value === "building";
}

function addCoordinate(first: HexCoordinate, second: HexCoordinate): HexCoordinate {
  return { q: first.q + second.q, r: first.r + second.r };
}

function scaleCoordinate(coordinate: HexCoordinate, scale: number): HexCoordinate {
  return { q: coordinate.q * scale, r: coordinate.r * scale };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
