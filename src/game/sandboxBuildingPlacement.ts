import {
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import {
  createBattleBuilding,
  type BattleBuilding,
} from "./buildings";
import { battleModeDefinitionFor } from "./battleMode";
import {
  resolveWorldHex,
  type BuildingOccupancy,
  type BuildingPlacementUnit,
} from "./deployment";
import { trySpendGold, type EconomyState } from "./economy";
import {
  occupyMinePit,
  type MinePitState,
  type SandboxMiningState,
} from "./miningEconomy";
import type { BuildingKind } from "./rules";
import { sandboxBuildingSpec } from "./sandboxCatalog";
import type { Faction, WorldPoint } from "./types";

const SANDBOX_GOLD_MINE_SPEC = sandboxBuildingSpec("mine");
export const SANDBOX_GOLD_MINE_CONSTRUCTION_RULES = Object.freeze({
  cost: SANDBOX_GOLD_MINE_SPEC.cost,
  constructionSeconds: SANDBOX_GOLD_MINE_SPEC.constructionSeconds,
});

/**
 * Placement only reads this projection of the authoritative MinePitState.
 * Capture progress, production progress and reserve ownership stay in the
 * mining subsystem and are never copied onto BattleBuilding.
 */
export type MinePitPlacementView = Readonly<Pick<
  MinePitState,
  "id" | "coordinate" | "remainingOre" | "controller" | "occupyingMineId"
>>;

export type SandboxConstructionFailureReason =
  | "outside-battlefield"
  | "invalid-zone"
  | "pit-state-unavailable"
  | "pit-not-controlled"
  | "pit-depleted"
  | "pit-occupied"
  | "occupied-hex"
  | "duplicate-building-id"
  | "insufficient-gold"
  | "invalid-request";

export interface SandboxConstructionFeeWaiverRequest {
  readonly faction: Faction;
  readonly buildingId: string;
  readonly kind: "gold-mine";
  readonly pit: MinePitPlacementView;
  readonly cost: number;
}

export type SandboxConstructionFeeWaiver = (
  request: SandboxConstructionFeeWaiverRequest,
) => boolean;

export interface CanStartSandboxGoldMineConstructionInput {
  readonly map: BattlefieldMap;
  readonly mining: SandboxMiningState;
  readonly buildings: readonly BattleBuilding[];
  readonly occupancy: BuildingOccupancy;
  readonly units: readonly BuildingPlacementUnit[];
  readonly economy: EconomyState;
  readonly faction: Faction;
  readonly buildingId: string;
  readonly worldPosition: WorldPoint;
  readonly createdAt: number;
  readonly feeWaiver?: SandboxConstructionFeeWaiver;
}

export type CanStartSandboxGoldMineConstructionResult =
  | {
      readonly ok: true;
      readonly coordinate: HexCoordinate;
      readonly pit: MinePitPlacementView;
      readonly cost: number;
      readonly feeWaived: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: SandboxConstructionFailureReason;
    };

export type StartSandboxGoldMineConstructionResult =
  | {
      readonly ok: true;
      readonly building: BattleBuilding;
      readonly buildings: readonly BattleBuilding[];
      readonly occupancy: BuildingOccupancy;
      readonly economy: EconomyState;
      readonly mining: SandboxMiningState;
      readonly pitOccupation: Readonly<{
        pitId: string;
        occupyingMineId: string;
      }>;
      readonly costCharged: number;
      readonly feeWaived: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: SandboxConstructionFailureReason;
    };

export function validateSandboxBuildingZone(
  map: BattlefieldMap,
  faction: Faction,
  kind: BuildingKind,
  coordinate: HexCoordinate,
): SandboxConstructionFailureReason | null {
  const cell = getMapCell(map, coordinate);
  if (!cell) return "outside-battlefield";
  if (kind === "gold-mine") {
    return cell.buildPolicy === "mine-only" ? null : "invalid-zone";
  }
  return cell.buildPolicy === "ordinary"
    && cell.buildable
    && cell.territory === faction
    ? null
    : "invalid-zone";
}

export function canStartSandboxGoldMineConstruction(
  input: CanStartSandboxGoldMineConstructionInput,
): CanStartSandboxGoldMineConstructionResult {
  if (
    input.buildingId.trim().length === 0
    || !Number.isFinite(input.createdAt)
    || input.createdAt < 0
  ) {
    return { ok: false, reason: "invalid-request" };
  }
  if (
    input.buildings.some((building) => building.id === input.buildingId)
    || Object.values(input.occupancy).some((building) => (
      building.buildingId === input.buildingId
    ))
  ) {
    return { ok: false, reason: "duplicate-building-id" };
  }

  const coordinate = resolveWorldHex(input.map, input.worldPosition);
  if (!coordinate) return { ok: false, reason: "outside-battlefield" };
  const zoneFailure = validateSandboxBuildingZone(
    input.map,
    input.faction,
    "gold-mine",
    coordinate,
  );
  if (zoneFailure) return { ok: false, reason: zoneFailure };

  const pit = Object.values(input.mining.pitsById).find((candidate) => (
    coordinateKey(candidate.coordinate) === coordinateKey(coordinate)
  ));
  if (!pit) return { ok: false, reason: "pit-state-unavailable" };
  if (pit.controller !== input.faction) {
    return { ok: false, reason: "pit-not-controlled" };
  }
  if (!Number.isFinite(pit.remainingOre) || pit.remainingOre <= 0) {
    return { ok: false, reason: "pit-depleted" };
  }
  if (pit.occupyingMineId !== null) {
    return { ok: false, reason: "pit-occupied" };
  }

  const key = coordinateKey(coordinate);
  if (
    input.occupancy[key]
    || input.buildings.some((building) => (
      building.status === "active"
      && building.health > 0
      && coordinateKey(building.coordinate) === key
    ))
  ) {
    return { ok: false, reason: "pit-occupied" };
  }
  if (occupiedUnitKeys(input.units).has(key)) {
    return { ok: false, reason: "occupied-hex" };
  }

  const cost = SANDBOX_GOLD_MINE_CONSTRUCTION_RULES.cost;
  const feeWaived = input.feeWaiver?.({
    faction: input.faction,
    buildingId: input.buildingId,
    kind: "gold-mine",
    pit,
    cost,
  }) === true;
  if (!feeWaived && input.economy.accounts[input.faction].gold < cost) {
    return { ok: false, reason: "insufficient-gold" };
  }

  return { ok: true, coordinate, pit, cost, feeWaived };
}

export function startSandboxGoldMineConstruction(
  input: CanStartSandboxGoldMineConstructionInput,
): StartSandboxGoldMineConstructionResult {
  const decision = canStartSandboxGoldMineConstruction(input);
  if (!decision.ok) return decision;

  const sandboxMode = battleModeDefinitionFor("sandbox");
  const spend = decision.feeWaived
    ? { state: input.economy, spent: true }
    : trySpendGold(
        input.economy,
        input.faction,
        decision.cost,
        sandboxMode.economyPolicy,
      );
  if (!spend.spent) return { ok: false, reason: "insufficient-gold" };

  const building = createBattleBuilding({
    id: input.buildingId,
    kind: "gold-mine",
    faction: input.faction,
    coordinate: decision.coordinate,
    createdAt: input.createdAt,
    constructionSeconds: SANDBOX_GOLD_MINE_CONSTRUCTION_RULES.constructionSeconds,
  }, sandboxMode.buildingLifecyclePolicy);
  const occupation = occupyMinePit(input.mining, decision.pit.id, building.id);
  if (!occupation.occupied) {
    return {
      ok: false,
      reason: occupation.reason === "unknown-pit"
        ? "pit-state-unavailable"
        : occupation.reason === "depleted" ? "pit-depleted" : "pit-occupied",
    };
  }
  const key = coordinateKey(decision.coordinate);
  return {
    ok: true,
    building,
    buildings: [...input.buildings, building],
    occupancy: {
      ...input.occupancy,
      [key]: {
        buildingId: building.id,
        kind: "gold-mine",
        faction: building.faction,
        coordinate: building.coordinate,
      },
    },
    economy: spend.state,
    mining: occupation.state,
    pitOccupation: {
      pitId: decision.pit.id,
      occupyingMineId: building.id,
    },
    costCharged: decision.feeWaived ? 0 : decision.cost,
    feeWaived: decision.feeWaived,
  };
}

function occupiedUnitKeys(
  units: readonly BuildingPlacementUnit[],
): ReadonlySet<string> {
  return new Set(units
    .filter((unit) => (
      unit.health > 0
      && Number.isFinite(unit.position.x)
      && Number.isFinite(unit.position.z)
    ))
    .map((unit) => coordinateKey(worldToAxial(unit.position))));
}
