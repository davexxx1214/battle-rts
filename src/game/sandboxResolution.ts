import type { BattleBuilding } from "./buildings";
import type { EconomyState } from "./economy";
import type { SandboxMiningState } from "./miningEconomy";
import {
  SANDBOX_TROOP_SLOTS,
  sandboxBuildingSpec,
  sandboxTroopSpec,
} from "./sandboxCatalog";
import {
  sandboxProductionBuildingSlotFor,
} from "./sandboxProductionIntegration";
import type { SandboxProductionState } from "./sandboxProductionQueue";
import type { Faction } from "./types";

interface SandboxResolutionUnit {
  readonly faction: Faction;
  readonly health: number;
  readonly status: string;
}

interface SandboxResolutionProjectile {
  readonly id: string;
}

export interface SandboxResourceStalemateInput {
  readonly elapsedSeconds: number;
  readonly mining: SandboxMiningState | null;
  readonly economy: EconomyState;
  readonly units: readonly SandboxResolutionUnit[];
  readonly projectiles: readonly SandboxResolutionProjectile[];
  readonly buildings: readonly BattleBuilding[];
  readonly production: SandboxProductionState | null;
}

const FACTIONS: readonly Faction[] = ["verdant", "crimson"];
const MINIMUM_RECOVERY_GOLD = sandboxBuildingSpec("barracks").cost
  + sandboxTroopSpec("spearman").cost;

/**
 * A deliberately conservative sandbox draw check. Every remaining way to create
 * an attacking unit keeps the battle alive; uncertain future placement is also
 * treated as recoverable when the faction can afford barracks + spearmen.
 */
export function isSandboxResourceStalemate(
  input: SandboxResourceStalemateInput,
): boolean {
  if (input.mining === null || input.production === null) return false;
  if (Object.values(input.mining.pitsById).some((pit) => pit.remainingOre > 0)) {
    return false;
  }
  if (input.units.some((unit) => unit.health > 0 && unit.status !== "dead")) {
    return false;
  }
  if (input.projectiles.length > 0) return false;
  if (Object.values(input.production.queuesByBuildingId).some((queue) => (
    queue.entries.length > 0
  ))) {
    return false;
  }

  return FACTIONS.every((faction) => !factionCanRecover(input, faction));
}

function factionCanRecover(
  input: SandboxResourceStalemateInput,
  faction: Faction,
): boolean {
  const gold = input.economy.accounts[faction].gold;
  const producers = input.buildings.filter((building) => (
    building.faction === faction
    && building.health > 0
    && building.status === "active"
    && sandboxProductionBuildingSlotFor(building) !== null
  ));
  if (producers.some((building) => (
    building.constructionCompletedAt > input.elapsedSeconds
  ))) {
    return true;
  }
  if (producers.some((building) => {
    const producer = sandboxProductionBuildingSlotFor(building);
    if (producer === null) return false;
    const cheapestTroopCost = SANDBOX_TROOP_SLOTS
      .map((slot) => sandboxTroopSpec(slot))
      .filter((spec) => spec.producer === producer)
      .reduce((lowest, spec) => Math.min(lowest, spec.cost), Number.POSITIVE_INFINITY);
    return gold >= cheapestTroopCost;
  })) {
    return true;
  }

  return gold >= MINIMUM_RECOVERY_GOLD;
}
