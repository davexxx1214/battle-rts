import type { BattleState } from "./battle";
import { battleBuildingConstructionPhaseAt } from "./buildings";
import { sandboxTroopSpec, type SandboxTroopSlot } from "./sandboxCatalog";
import { SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH } from "./sandboxProductionQueue";

/** Picks the least-loaded operational producer so duplicate buildings train in parallel. */
export function sandboxQuickProductionBuildingId(
  battle: BattleState,
  troopKind: SandboxTroopSlot,
): string | null {
  const producer = sandboxTroopSpec(troopKind).producer;
  if (!battle.production) return null;
  const candidates = Object.values(battle.production.queuesByBuildingId)
    .filter((queue) => {
      if (
        queue.faction !== "verdant"
        || queue.producer !== producer
        || queue.entries.length >= SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH
      ) return false;
      const building = battle.buildings.find(({ id }) => id === queue.buildingId);
      return building !== undefined
        && building.faction === "verdant"
        && building.status === "active"
        && building.health > 0
        && battleBuildingConstructionPhaseAt(building, battle.matchElapsed) === "operational";
    })
    .sort((left, right) => (
      left.entries.length - right.entries.length
      || left.buildingId.localeCompare(right.buildingId)
    ));
  return candidates[0]?.buildingId ?? null;
}
