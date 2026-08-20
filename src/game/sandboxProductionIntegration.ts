import {
  coordinateKey,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import type { BattleBuilding } from "./buildings";
import {
  sandboxBuildingSlotForKind,
  type SandboxOrdinaryBuildingSlot,
} from "./sandboxCatalog";
import {
  createSandboxProductionExitFan,
  resolveSandboxProductionExit,
  type ResolveSandboxProductionExitResult,
} from "./sandboxProductionExit";
import {
  destroySandboxProductionBuilding,
  registerSandboxProductionBuilding,
  type SandboxProductionBuildingSlot,
  type SandboxProductionSpawn,
  type SandboxProductionState,
} from "./sandboxProductionQueue";
import type { WorldPoint } from "./types";

export interface SandboxProductionUnitBlocker {
  readonly position: WorldPoint;
  readonly health: number;
  readonly status?: string;
}

const PRODUCTION_BUILDING_SLOTS: readonly SandboxProductionBuildingSlot[] = [
  "barracks",
  "archery-range",
  "mage-tower",
  "siege-workshop",
];

/**
 * Reconciles serializable queues with the post-damage building snapshot.
 * Destroyed producers are removed exactly once, while older saves gain missing
 * empty queue registrations without relying on a mutable global registry.
 */
export function synchronizeSandboxProductionBuildings(
  state: SandboxProductionState,
  buildings: readonly BattleBuilding[],
): SandboxProductionState {
  const livingProducers = new Map(buildings.flatMap((building) => {
    const producer = sandboxProductionBuildingSlotFor(building);
    return producer === null
      || building.status !== "active"
      || building.health <= 0
      ? []
      : [[building.id, { building, producer }] as const];
  }));
  let next = state;

  for (const buildingId of Object.keys(next.queuesByBuildingId).sort()) {
    const queue = next.queuesByBuildingId[buildingId]!;
    const living = livingProducers.get(buildingId);
    if (
      !living
      || living.building.faction !== queue.faction
      || living.producer !== queue.producer
    ) {
      next = destroySandboxProductionBuilding(next, buildingId).state;
    }
  }
  for (const buildingId of [...livingProducers.keys()].sort()) {
    if (Object.hasOwn(next.queuesByBuildingId, buildingId)) continue;
    const { building, producer } = livingProducers.get(buildingId)!;
    const registration = registerSandboxProductionBuilding(next, {
      buildingId,
      faction: building.faction,
      producer,
    });
    if (!registration.registered) {
      throw new Error(`Could not register sandbox producer ${buildingId}: ${registration.reason}`);
    }
    next = registration.state;
  }
  return next;
}

export function registerSandboxProductionBuildingForConstruction(
  state: SandboxProductionState,
  building: BattleBuilding,
): SandboxProductionState {
  const producer = sandboxProductionBuildingSlotFor(building);
  if (producer === null || Object.hasOwn(state.queuesByBuildingId, building.id)) return state;
  const registration = registerSandboxProductionBuilding(state, {
    buildingId: building.id,
    faction: building.faction,
    producer,
  });
  if (!registration.registered) {
    throw new Error(`Could not register sandbox producer ${building.id}: ${registration.reason}`);
  }
  return registration.state;
}

export function sandboxProductionExitForSpawn(
  map: BattlefieldMap,
  roadReserve: readonly HexCoordinate[],
  buildings: readonly BattleBuilding[],
  units: readonly SandboxProductionUnitBlocker[],
  spawn: SandboxProductionSpawn,
): ResolveSandboxProductionExitResult {
  const building = buildings.find((candidate) => (
    candidate.id === spawn.buildingId
    && candidate.faction === spawn.faction
    && candidate.status === "active"
    && candidate.health > 0
  ));
  if (!building) return readyBlockedExit();
  const plan = createSandboxProductionExitFan(map, roadReserve, building.coordinate);
  if (!plan.ok) return readyBlockedExit();
  return resolveSandboxProductionExit(
    map,
    roadReserve,
    plan.fan,
    sandboxProductionBlockerKeys(buildings, units),
    spawn.entityCount,
  );
}

export function sandboxProductionBlockerKeys(
  buildings: readonly BattleBuilding[],
  units: readonly SandboxProductionUnitBlocker[],
): ReadonlySet<string> {
  return new Set([
    ...buildings.flatMap((building) => (
      building.status === "active" && building.health > 0
        ? [coordinateKey(building.coordinate)]
        : []
    )),
    ...units.flatMap((unit) => (
      unit.health > 0
      && unit.status !== "dead"
      && Number.isFinite(unit.position.x)
      && Number.isFinite(unit.position.z)
        ? [coordinateKey(worldToAxial(unit.position))]
        : []
    )),
  ]);
}

export function sandboxProductionBuildingSlotFor(
  building: BattleBuilding,
): SandboxProductionBuildingSlot | null {
  const slot = sandboxBuildingSlotForKind(building.kind);
  return slot !== null && isProductionBuildingSlot(slot) ? slot : null;
}

function isProductionBuildingSlot(
  slot: SandboxOrdinaryBuildingSlot | "mine",
): slot is SandboxProductionBuildingSlot {
  return (PRODUCTION_BUILDING_SLOTS as readonly string[]).includes(slot);
}

function readyBlockedExit(): ResolveSandboxProductionExitResult {
  return {
    status: "ready-blocked",
    coordinates: [] as const,
    positions: [] as const,
  };
}
