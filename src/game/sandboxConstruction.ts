import {
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import { battleModeDefinitionFor } from "./battleMode";
import {
  battleBuildingConstructionPhaseAt,
  createBattleBuilding,
  type BattleBuilding,
} from "./buildings";
import {
  resolveWorldHex,
  type BuildingOccupancy,
  type BuildingPlacementUnit,
} from "./deployment";
import { trySpendGold, type EconomyState } from "./economy";
import {
  isSandboxOrdinaryBuildingSlot,
  sandboxBuildingSpec,
  type SandboxBuildingCatalogEntry,
  type SandboxBuildingSlot,
} from "./sandboxCatalog";
import type { Faction, WorldPoint } from "./types";

const SANDBOX_MODE = battleModeDefinitionFor("sandbox");

export type SandboxOrdinaryConstructionFailureReason =
  | "invalid-request"
  | "invalid-building-slot"
  | "outside-battlefield"
  | "invalid-zone"
  | "duplicate-building-id"
  | "occupied-hex"
  | "missing-prerequisite"
  | "building-limit-reached"
  | "insufficient-gold";

export interface CanStartSandboxOrdinaryConstructionInput {
  readonly map: BattlefieldMap;
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
  readonly units: readonly BuildingPlacementUnit[];
  readonly economy: EconomyState;
  readonly faction: Faction;
  readonly slot: SandboxBuildingSlot;
  readonly buildingId: string;
  readonly worldPosition: WorldPoint;
  /** Authoritative active-match time; also becomes the building creation time. */
  readonly elapsedSeconds: number;
}

export type CanStartSandboxOrdinaryConstructionResult =
  | {
      readonly ok: true;
      readonly coordinate: HexCoordinate;
      readonly spec: SandboxBuildingCatalogEntry;
    }
  | {
      readonly ok: false;
      readonly reason: SandboxOrdinaryConstructionFailureReason;
    };

export type StartSandboxOrdinaryConstructionResult =
  | {
      readonly ok: true;
      readonly building: BattleBuilding;
      readonly buildings: readonly BattleBuilding[];
      readonly occupancy: BuildingOccupancy;
      readonly economy: EconomyState;
      readonly costCharged: number;
    }
  | {
      readonly ok: false;
      readonly reason: SandboxOrdinaryConstructionFailureReason;
      readonly buildings: readonly BattleBuilding[];
      readonly occupancy: BuildingOccupancy;
      readonly economy: EconomyState;
    };

export function canStartSandboxOrdinaryConstruction(
  input: CanStartSandboxOrdinaryConstructionInput,
): CanStartSandboxOrdinaryConstructionResult {
  if (
    input.buildingId.trim().length === 0
    || !Number.isFinite(input.elapsedSeconds)
    || input.elapsedSeconds < 0
  ) {
    return { ok: false, reason: "invalid-request" };
  }
  if (!isSandboxOrdinaryBuildingSlot(input.slot)) {
    return { ok: false, reason: "invalid-building-slot" };
  }
  if (
    input.buildings.some((building) => building.id === input.buildingId)
    || Object.values(input.occupancy).some((occupied) => (
      occupied.buildingId === input.buildingId
    ))
  ) {
    return { ok: false, reason: "duplicate-building-id" };
  }

  const coordinate = resolveWorldHex(input.map, input.worldPosition);
  if (!coordinate) return { ok: false, reason: "outside-battlefield" };
  const cell = getMapCell(input.map, coordinate);
  if (
    !cell
    || cell.buildPolicy !== "ordinary"
    || !cell.buildable
    || cell.territory !== input.faction
  ) {
    return { ok: false, reason: "invalid-zone" };
  }

  const coordinateId = coordinateKey(coordinate);
  if (
    input.occupancy[coordinateId]
    || input.buildings.some((building) => (
      building.status === "active"
      && building.health > 0
      && coordinateKey(building.coordinate) === coordinateId
    ))
    || input.units.some((unit) => (
      unit.health > 0
      && Number.isFinite(unit.position.x)
      && Number.isFinite(unit.position.z)
      && coordinateKey(worldToAxial(unit.position)) === coordinateId
    ))
  ) {
    return { ok: false, reason: "occupied-hex" };
  }

  const spec = sandboxBuildingSpec(input.slot);
  if (!spec.prerequisites.every((prerequisite) => (
    hasCompletedLivingSandboxBuilding(
      input.buildings,
      input.faction,
      prerequisite,
      input.elapsedSeconds,
    )
  ))) {
    return { ok: false, reason: "missing-prerequisite" };
  }
  if (
    spec.maximumActivePerFaction !== null
    && countCommittedBuildings(input.buildings, input.faction, spec.kind)
      >= spec.maximumActivePerFaction
  ) {
    return { ok: false, reason: "building-limit-reached" };
  }
  if (input.economy.accounts[input.faction].gold < spec.cost) {
    return { ok: false, reason: "insufficient-gold" };
  }
  return { ok: true, coordinate, spec };
}

export function startSandboxOrdinaryConstruction(
  input: CanStartSandboxOrdinaryConstructionInput,
): StartSandboxOrdinaryConstructionResult {
  const decision = canStartSandboxOrdinaryConstruction(input);
  if (!decision.ok) return unchanged(input, decision.reason);

  const spend = trySpendGold(
    input.economy,
    input.faction,
    decision.spec.cost,
    SANDBOX_MODE.economyPolicy,
  );
  if (!spend.spent) return unchanged(input, "insufficient-gold");

  const building = createBattleBuilding({
    id: input.buildingId,
    kind: decision.spec.kind,
    faction: input.faction,
    coordinate: decision.coordinate,
    createdAt: input.elapsedSeconds,
    constructionSeconds: decision.spec.constructionSeconds,
  }, SANDBOX_MODE.buildingLifecyclePolicy);
  const key = coordinateKey(decision.coordinate);
  return {
    ok: true,
    building,
    buildings: [...input.buildings, building],
    occupancy: {
      ...input.occupancy,
      [key]: {
        buildingId: building.id,
        kind: decision.spec.kind,
        faction: building.faction,
        coordinate: building.coordinate,
      },
    },
    economy: spend.state,
    costCharged: decision.spec.cost,
  };
}

export function hasCompletedLivingSandboxBarracks(
  buildings: readonly BattleBuilding[],
  faction: Faction,
  elapsedSeconds: number,
): boolean {
  return hasCompletedLivingSandboxBuilding(
    buildings,
    faction,
    "barracks",
    elapsedSeconds,
  );
}

export function hasCompletedLivingSandboxBuilding(
  buildings: readonly BattleBuilding[],
  faction: Faction,
  slot: SandboxBuildingSlot,
  elapsedSeconds: number,
): boolean {
  const kind = sandboxBuildingSpec(slot).kind;
  return buildings.some((building) => (
    building.kind === kind
    && building.faction === faction
    && building.status === "active"
    && building.health > 0
    && battleBuildingConstructionPhaseAt(building, elapsedSeconds) === "operational"
  ));
}

function countCommittedBuildings(
  buildings: readonly BattleBuilding[],
  faction: Faction,
  kind: SandboxBuildingCatalogEntry["kind"],
): number {
  return buildings.filter((building) => (
    building.kind === kind
    && building.faction === faction
    && building.status === "active"
    && building.health > 0
  )).length;
}

function unchanged(
  input: CanStartSandboxOrdinaryConstructionInput,
  reason: SandboxOrdinaryConstructionFailureReason,
): StartSandboxOrdinaryConstructionResult {
  return {
    ok: false,
    reason,
    buildings: input.buildings,
    occupancy: input.occupancy,
    economy: input.economy,
  };
}
