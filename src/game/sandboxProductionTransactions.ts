import type { BattleState } from "./battle";
import { getBattleMatchClock } from "./battle";
import { battleBuildingConstructionPhaseAt } from "./buildings";
import {
  SANDBOX_TROOP_SLOTS,
  sandboxTroopSpec,
  type SandboxTroopSlot,
} from "./sandboxCatalog";
import {
  createSandboxProductionState,
  enqueueSandboxProduction,
  setSandboxProductionRallyPoint,
  type SandboxProductionEnqueueFailureReason,
  type SandboxProductionQueueEntry,
} from "./sandboxProductionQueue";
import { synchronizeSandboxProductionBuildings } from "./sandboxProductionIntegration";
import { validateSandboxRallyPoint } from "./sandboxProductionExit";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import { sandboxUsedPopulation } from "./population";
import type { Faction, WorldPoint } from "./types";

export type SandboxBattleProductionFailureReason =
  | SandboxProductionEnqueueFailureReason
  | "sandbox-mode-required"
  | "match-over"
  | "invalid-troop"
  | "building-not-operational";

export interface EnqueueSandboxBattleProductionRequest {
  readonly faction: Faction;
  readonly buildingId: string;
  /** Untrusted UI/AI input is validated before entering the typed queue core. */
  readonly troopKind: string;
}

export type EnqueueSandboxBattleProductionResult =
  | {
      readonly ok: true;
      readonly battle: BattleState;
      readonly entry: SandboxProductionQueueEntry;
      readonly costCharged: number;
    }
  | {
      readonly ok: false;
      readonly battle: BattleState;
      readonly reason: SandboxBattleProductionFailureReason;
    };

export type SandboxRallyPointFailureReason =
  | "sandbox-mode-required"
  | "match-over"
  | "building-not-found"
  | "faction-mismatch"
  | "invalid-rally-point";

export interface SetSandboxBattleRallyPointRequest {
  readonly faction: Faction;
  readonly buildingId: string;
  readonly worldPosition: WorldPoint | null;
}

export type SetSandboxBattleRallyPointResult =
  | {
      readonly ok: true;
      readonly battle: BattleState;
    }
  | {
      readonly ok: false;
      readonly battle: BattleState;
      readonly reason: SandboxRallyPointFailureReason;
    };

/** Shared authoritative paid-production entry point for both player and AI. */
export function enqueueSandboxBattleProduction(
  battle: BattleState,
  request: EnqueueSandboxBattleProductionRequest,
): EnqueueSandboxBattleProductionResult {
  if (battle.modeId !== "sandbox") {
    return { ok: false, battle, reason: "sandbox-mode-required" };
  }
  if (battle.winner !== null || getBattleMatchClock(battle).timedOut) {
    return { ok: false, battle, reason: "match-over" };
  }
  if (!isSandboxTroopSlot(request.troopKind)) {
    return { ok: false, battle, reason: "invalid-troop" };
  }
  const building = battle.buildings.find((candidate) => candidate.id === request.buildingId);
  if (!building || building.status !== "active" || building.health <= 0) {
    return { ok: false, battle, reason: "building-not-found" };
  }
  if (building.faction !== request.faction) {
    return { ok: false, battle, reason: "faction-mismatch" };
  }
  if (battleBuildingConstructionPhaseAt(building, battle.matchElapsed) !== "operational") {
    return { ok: false, battle, reason: "building-not-operational" };
  }

  const production = synchronizeSandboxProductionBuildings(
    battle.production ?? createSandboxProductionState(),
    battle.buildings,
  );
  const result = enqueueSandboxProduction({
    state: production,
    economy: battle.economy,
    livingPopulationByFaction: {
      verdant: sandboxUsedPopulation(battle.units, "verdant"),
      crimson: sandboxUsedPopulation(battle.units, "crimson"),
    },
    request: {
      buildingId: request.buildingId,
      faction: request.faction,
      troopKind: request.troopKind,
    },
  });
  if (!result.accepted) {
    return { ok: false, battle, reason: result.reason };
  }
  return {
    ok: true,
    entry: result.entry,
    costCharged: sandboxTroopSpec(request.troopKind).cost,
    battle: {
      ...battle,
      production: result.state,
      economy: result.economy,
      revision: battle.revision + 1,
    },
  };
}

export function setSandboxBattleRallyPoint(
  battle: BattleState,
  request: SetSandboxBattleRallyPointRequest,
): SetSandboxBattleRallyPointResult {
  if (battle.modeId !== "sandbox") {
    return { ok: false, battle, reason: "sandbox-mode-required" };
  }
  if (battle.winner !== null || getBattleMatchClock(battle).timedOut) {
    return { ok: false, battle, reason: "match-over" };
  }
  const building = battle.buildings.find((candidate) => candidate.id === request.buildingId);
  if (!building || building.status !== "active" || building.health <= 0) {
    return { ok: false, battle, reason: "building-not-found" };
  }
  if (building.faction !== request.faction) {
    return { ok: false, battle, reason: "faction-mismatch" };
  }
  const production = synchronizeSandboxProductionBuildings(
    battle.production ?? createSandboxProductionState(),
    battle.buildings,
  );
  const coordinate = request.worldPosition === null
    ? null
    : validateSandboxRallyPoint(
        resolveBattleRuntimeContext(battle).map,
        request.worldPosition,
      ).coordinate;
  if (request.worldPosition !== null && coordinate === null) {
    return { ok: false, battle, reason: "invalid-rally-point" };
  }
  const update = setSandboxProductionRallyPoint(
    production,
    request.buildingId,
    coordinate,
  );
  if (!update.updated) {
    return { ok: false, battle, reason: "building-not-found" };
  }
  return {
    ok: true,
    battle: {
      ...battle,
      production: update.state,
      revision: battle.revision + 1,
    },
  };
}

function isSandboxTroopSlot(value: string): value is SandboxTroopSlot {
  return (SANDBOX_TROOP_SLOTS as readonly string[]).includes(value);
}
