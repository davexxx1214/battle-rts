import { axialToWorld } from "../map/battlefield";
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
import { resolveBattleRuntimeContext } from "./battleRuntime";
import type { Faction } from "./types";

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
