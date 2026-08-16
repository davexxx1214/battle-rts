import type { BattleBuilding } from "./buildings";
import type { CombatTarget } from "./combat";
import { GAME_RULES } from "./rules";
import type { Faction, WorldPoint } from "./types";

export interface ArrowTowerAttack {
  readonly towerId: string;
  readonly faction: Faction;
  readonly targetId: string;
  readonly origin: WorldPoint;
  readonly targetPosition: WorldPoint;
}

export interface ArrowTowerAttackStep {
  readonly buildings: readonly BattleBuilding[];
  readonly attacks: readonly ArrowTowerAttack[];
}

export function advanceArrowTowerAttacks(
  buildings: readonly BattleBuilding[],
  targets: readonly CombatTarget[],
  deltaSeconds: number,
): ArrowTowerAttackStep {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { buildings, attacks: [] };
  }
  const attacks: ArrowTowerAttack[] = [];
  const next = buildings.map((building) => {
    if (building.kind !== "arrow-tower" || !building.arrowTowerCombat) return building;
    const cooldownRemaining = Math.max(
      0,
      building.arrowTowerCombat.cooldownRemaining - deltaSeconds,
    );
    const arrowTowerCombat = { cooldownRemaining };
    if (
      building.status !== "active"
      || building.health <= 0
      || cooldownRemaining > 0
    ) return { ...building, arrowTowerCombat };
    const target = targets
      .filter((candidate) => (
        candidate.targetType === "unit"
        && candidate.health > 0
        && candidate.faction !== building.faction
        && distance(building.position, candidate.position)
          <= GAME_RULES.buildings.arrowTower.attackRange
      ))
      .sort((first, second) => (
        distance(building.position, first.position)
        - distance(building.position, second.position)
        || first.id.localeCompare(second.id)
      ))[0];
    if (!target) return { ...building, arrowTowerCombat };
    attacks.push({
      towerId: building.id,
      faction: building.faction,
      targetId: target.id,
      origin: { ...building.position },
      targetPosition: { ...target.position },
    });
    return {
      ...building,
      arrowTowerCombat: {
        cooldownRemaining: GAME_RULES.buildings.arrowTower.attackCooldown,
      },
    };
  });
  return { buildings: next, attacks };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
