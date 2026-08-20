import {
  axialToWorld,
  coordinateKey,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
  type HexCoordinate,
} from "../map/battlefield";
import type { BattleState } from "./battle";
import { battleBuildingConstructionPhaseAt } from "./buildings";
import { getBattleMatchClock } from "./battle";
import {
  consumeEmergencyMinePermit,
  emergencyMinePermitEligibility,
  type EmergencyMineBuildingSummary,
} from "./miningEconomy";
import {
  startSandboxGoldMineConstruction,
  type SandboxConstructionFailureReason,
} from "./sandboxBuildingPlacement";
import {
  canStartSandboxOrdinaryConstruction,
  startSandboxOrdinaryConstruction,
  type SandboxOrdinaryConstructionFailureReason,
} from "./sandboxConstruction";
import {
  isSandboxBuildingSlot,
  type SandboxBuildingSlot,
} from "./sandboxCatalog";
import { createSandboxProductionState } from "./sandboxProductionQueue";
import {
  registerSandboxProductionBuildingForConstruction,
  sandboxProductionBlockerKeys,
  sandboxProductionBuildingSlotFor,
} from "./sandboxProductionIntegration";
import {
  createSandboxProductionExitFan,
  resolveSandboxProductionExit,
} from "./sandboxProductionExit";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import type { Faction, WorldPoint } from "./types";

export type SandboxMineConstructionFailureReason =
  | SandboxConstructionFailureReason
  | "sandbox-mode-required"
  | "match-over"
  | "unknown-pit";

export interface StartSandboxMineConstructionRequest {
  readonly faction: Faction;
  readonly pitId: string;
  readonly buildingId?: string;
}

export type StartSandboxMineConstructionResult =
  | {
      readonly ok: true;
      readonly battle: BattleState;
      readonly buildingId: string;
      readonly pitId: string;
      readonly costCharged: number;
      readonly usedEmergencyPermit: boolean;
    }
  | {
      readonly ok: false;
      readonly battle: BattleState;
      readonly reason: SandboxMineConstructionFailureReason;
    };

export type SandboxBuildingConstructionFailureReason =
  | SandboxMineConstructionFailureReason
  | SandboxOrdinaryConstructionFailureReason
  | "unknown-building-slot"
  | "production-exit-unavailable"
  | "would-block-production-exit";

export interface StartSandboxBuildingConstructionRequest {
  readonly faction: Faction;
  /** Runtime callers may pass untrusted strings; the transaction fails closed. */
  readonly slot: string;
  readonly worldPosition: WorldPoint;
  readonly buildingId?: string;
}

export type StartSandboxBuildingConstructionResult =
  | {
      readonly ok: true;
      readonly battle: BattleState;
      readonly buildingId: string;
      readonly slot: SandboxBuildingSlot;
      readonly costCharged: number;
      readonly usedEmergencyPermit: boolean;
    }
  | {
      readonly ok: false;
      readonly battle: BattleState;
      readonly reason: SandboxBuildingConstructionFailureReason;
    };

export interface SandboxBuildingConstructionPreview {
  readonly valid: boolean;
  readonly reason: SandboxBuildingConstructionFailureReason | null;
  readonly requestedPosition: WorldPoint;
  readonly position: WorldPoint | null;
  readonly coordinate: HexCoordinate | null;
  readonly slot: SandboxBuildingSlot | null;
}

/** Unified authoritative construction entry point shared by sandbox UI and AI. */
export function startSandboxBuildingConstruction(
  battle: BattleState,
  request: StartSandboxBuildingConstructionRequest,
): StartSandboxBuildingConstructionResult {
  if (battle.modeId !== "sandbox" || !battle.mining) {
    return { ok: false, battle, reason: "sandbox-mode-required" };
  }
  if (battle.winner !== null || getBattleMatchClock(battle).timedOut) {
    return { ok: false, battle, reason: "match-over" };
  }
  if (!isSandboxBuildingSlot(request.slot)) {
    return { ok: false, battle, reason: "unknown-building-slot" };
  }

  const runtime = resolveBattleRuntimeContext(battle);
  if (request.slot === "mine") {
    if (
      !Number.isFinite(request.worldPosition.x)
      || !Number.isFinite(request.worldPosition.z)
    ) {
      return { ok: false, battle, reason: "outside-battlefield" };
    }
    const coordinate = worldToAxial(request.worldPosition);
    const cell = getMapCell(runtime.map, coordinate);
    if (!cell) return { ok: false, battle, reason: "outside-battlefield" };
    if (cell.buildPolicy !== "mine-only") {
      return { ok: false, battle, reason: "invalid-zone" };
    }
    const pit = Object.values(battle.mining.pitsById).find((candidate) => (
      coordinateKey(candidate.coordinate) === coordinateKey(coordinate)
    ));
    if (!pit) return { ok: false, battle, reason: "pit-state-unavailable" };
    const result = startSandboxMineConstruction(battle, {
      faction: request.faction,
      pitId: pit.id,
      buildingId: request.buildingId,
    });
    return result.ok
      ? {
          ok: true,
          battle: result.battle,
          buildingId: result.buildingId,
          slot: "mine",
          costCharged: result.costCharged,
          usedEmergencyPermit: result.usedEmergencyPermit,
        }
      : result;
  }

  const sequence = battle.nextDeploymentSequence + 1;
  const buildingId = request.buildingId
    ?? `${request.faction}-${request.slot}-${sequence}`;
  const constructionInput = {
    map: runtime.map,
    buildings: battle.buildings,
    occupancy: battle.buildingOccupancy,
    units: battle.units,
    economy: battle.economy,
    faction: request.faction,
    slot: request.slot,
    buildingId,
    worldPosition: request.worldPosition,
    elapsedSeconds: battle.matchElapsed,
  } as const;
  const decision = canStartSandboxOrdinaryConstruction(constructionInput);
  if (!decision.ok) return { ok: false, battle, reason: decision.reason };
  const exitFailure = permanentProductionExitFailure(
    battle,
    runtime.map,
    runtime.battlefield.roadReserve ?? [],
    request.slot,
    decision.coordinate,
  );
  if (exitFailure) return { ok: false, battle, reason: exitFailure };

  const result = startSandboxOrdinaryConstruction(constructionInput);
  if (!result.ok) return { ok: false, battle, reason: result.reason };
  const production = registerSandboxProductionBuildingForConstruction(
    battle.production ?? createSandboxProductionState(),
    result.building,
  );
  return {
    ok: true,
    buildingId,
    slot: request.slot,
    costCharged: result.costCharged,
    usedEmergencyPermit: false,
    battle: {
      ...battle,
      buildings: result.buildings,
      buildingOccupancy: result.occupancy,
      economy: result.economy,
      production,
      nextDeploymentSequence: sequence,
      revision: battle.revision + 1,
    },
  };
}

/** Pure preview: evaluates the exact commit transaction and discards its copy. */
export function previewSandboxBuildingConstruction(
  battle: BattleState,
  request: StartSandboxBuildingConstructionRequest,
): SandboxBuildingConstructionPreview {
  const result = startSandboxBuildingConstruction(battle, request);
  const runtime = battle.modeId === "sandbox"
    ? resolveBattleRuntimeContext(battle)
    : null;
  const coordinate = runtime
    && Number.isFinite(request.worldPosition.x)
    && Number.isFinite(request.worldPosition.z)
    && getMapCell(runtime.map, worldToAxial(request.worldPosition))
    ? worldToAxial(request.worldPosition)
    : null;
  return {
    valid: result.ok,
    reason: result.ok ? null : result.reason,
    requestedPosition: { ...request.worldPosition },
    position: coordinate ? axialToWorld(coordinate) : null,
    coordinate,
    slot: isSandboxBuildingSlot(request.slot) ? request.slot : null,
  };
}

function permanentProductionExitFailure(
  battle: BattleState,
  map: BattlefieldMap,
  roadReserve: readonly HexCoordinate[],
  requestedSlot: Exclude<SandboxBuildingSlot, "mine">,
  requestedCoordinate: HexCoordinate,
): "production-exit-unavailable" | "would-block-production-exit" | null {
  const permanentBlockers = new Set(sandboxProductionBlockerKeys(battle.buildings, []));
  permanentBlockers.add(coordinateKey(requestedCoordinate));
  for (const building of battle.buildings) {
    if (
      building.status !== "active"
      || building.health <= 0
      || sandboxProductionBuildingSlotFor(building) === null
    ) continue;
    const plan = createSandboxProductionExitFan(map, roadReserve, building.coordinate);
    if (!plan.ok || resolveSandboxProductionExit(
      map,
      roadReserve,
      plan.fan,
      permanentBlockers,
      1,
    ).status === "ready-blocked") {
      return "would-block-production-exit";
    }
  }
  if (!isProductionBuildingSlot(requestedSlot)) return null;
  const plan = createSandboxProductionExitFan(map, roadReserve, requestedCoordinate);
  if (!plan.ok || resolveSandboxProductionExit(
    map,
    roadReserve,
    plan.fan,
    permanentBlockers,
    1,
  ).status === "ready-blocked") {
    return "production-exit-unavailable";
  }
  return null;
}

function isProductionBuildingSlot(
  slot: Exclude<SandboxBuildingSlot, "mine">,
): boolean {
  return slot !== "guard-tower";
}

/** Shared authoritative construction entry point for the player and sandbox AI. */
export function startSandboxMineConstruction(
  battle: BattleState,
  request: StartSandboxMineConstructionRequest,
): StartSandboxMineConstructionResult {
  if (battle.modeId !== "sandbox" || !battle.mining) {
    return { ok: false, battle, reason: "sandbox-mode-required" };
  }
  if (battle.winner !== null || getBattleMatchClock(battle).timedOut) {
    return { ok: false, battle, reason: "match-over" };
  }
  const pit = Object.hasOwn(battle.mining.pitsById, request.pitId)
    ? battle.mining.pitsById[request.pitId]
    : undefined;
  if (!pit) return { ok: false, battle, reason: "unknown-pit" };

  const runtime = resolveBattleRuntimeContext(battle);
  const sequence = battle.nextDeploymentSequence + 1;
  const buildingId = request.buildingId
    ?? `${request.faction}-gold-mine-${sequence}`;
  const permit = emergencyMinePermitEligibility(battle.mining, {
    faction: request.faction,
    walletGold: battle.economy.accounts[request.faction].gold,
    mineBuildings: mineBuildingSummaries(battle),
  });
  const placement = startSandboxGoldMineConstruction({
    map: runtime.map,
    mining: battle.mining,
    buildings: battle.buildings,
    occupancy: battle.buildingOccupancy,
    units: battle.units,
    economy: battle.economy,
    faction: request.faction,
    buildingId,
    worldPosition: axialToWorld(pit.coordinate),
    createdAt: battle.matchElapsed,
    feeWaiver: ({ pit: candidate }) => (
      permit.eligible && permit.eligiblePitIds.includes(candidate.id)
    ),
  });
  if (!placement.ok) return { ok: false, battle, reason: placement.reason };

  let mining = placement.mining;
  if (placement.feeWaived) {
    const consumed = consumeEmergencyMinePermit(mining, request.faction);
    if (!consumed.consumed) {
      throw new Error("Eligible emergency mine permit could not be consumed.");
    }
    mining = consumed.state;
  }
  return {
    ok: true,
    buildingId,
    pitId: request.pitId,
    costCharged: placement.costCharged,
    usedEmergencyPermit: placement.feeWaived,
    battle: {
      ...battle,
      buildings: placement.buildings,
      buildingOccupancy: placement.occupancy,
      economy: placement.economy,
      mining,
      nextDeploymentSequence: sequence,
      revision: battle.revision + 1,
    },
  };
}

function mineBuildingSummaries(
  battle: BattleState,
): readonly EmergencyMineBuildingSummary[] {
  return battle.buildings.flatMap((building) => {
    if (building.kind !== "gold-mine") return [];
    const phase = battleBuildingConstructionPhaseAt(building, battle.matchElapsed);
    return [{
      id: building.id,
      faction: building.faction,
      status: phase === "operational" ? "active" : phase,
    }];
  });
}
