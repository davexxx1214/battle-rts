import type { BattleBuilding } from "./buildings";
import type { CombatDamageIntent, CombatTarget } from "./combat";
import { GAME_RULES } from "./rules";
import type { Faction, WorldPoint } from "./types";

export interface CastleActivationEvent {
  readonly type: "castle-activated";
  readonly castleId: string;
  readonly faction: Faction;
  readonly position: WorldPoint;
}

export interface CastleAttack {
  readonly castleId: string;
  readonly faction: Faction;
  readonly targetId: string;
  readonly origin: WorldPoint;
  readonly targetPosition: WorldPoint;
}

export interface CastleActivationStep {
  readonly buildings: readonly BattleBuilding[];
  readonly events: readonly CastleActivationEvent[];
}

export interface CastleAttackStep {
  readonly buildings: readonly BattleBuilding[];
  readonly attacks: readonly CastleAttack[];
  readonly damageIntents: readonly CombatDamageIntent[];
}

export function activateCastlesFromDamage(
  buildings: readonly BattleBuilding[],
  damageIntents: readonly CombatDamageIntent[],
  elapsed: number,
): CastleActivationStep {
  const damagedIds = new Set(damageIntents
    .filter((intent) => (
      intent.targetType === "building"
      && Number.isFinite(intent.amount)
      && intent.amount > 0
    ))
    .map((intent) => intent.targetId));
  const events: CastleActivationEvent[] = [];
  const next = buildings.map((building) => {
    if (
      building.kind !== "castle"
      || building.status !== "active"
      || building.health <= 0
      || building.castleCombat?.activatedAt !== null
      || !damagedIds.has(building.id)
    ) return building;
    events.push({
      type: "castle-activated",
      castleId: building.id,
      faction: building.faction,
      position: { ...building.position },
    });
    return {
      ...building,
      castleCombat: {
        activatedAt: elapsed,
        cooldownRemaining: 0,
      },
    };
  });
  return { buildings: next, events };
}

export function advanceCastleAttacks(
  buildings: readonly BattleBuilding[],
  targets: readonly CombatTarget[],
  deltaSeconds: number,
): CastleAttackStep {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { buildings, attacks: [], damageIntents: [] };
  }
  const attacks: CastleAttack[] = [];
  const damageIntents: CombatDamageIntent[] = [];
  const next = buildings.map((building) => {
    if (building.kind !== "castle" || !building.castleCombat) return building;
    const cooldownRemaining = Math.max(
      0,
      building.castleCombat.cooldownRemaining - deltaSeconds,
    );
    const castleCombat = { ...building.castleCombat, cooldownRemaining };
    if (
      building.status !== "active"
      || building.health <= 0
      || castleCombat.activatedAt === null
      || cooldownRemaining > 0
    ) return { ...building, castleCombat };
    const target = targets
      .filter((candidate) => (
        candidate.targetType === "unit"
        && candidate.health > 0
        && candidate.faction !== building.faction
        && distance(building.position, candidate.position) <= GAME_RULES.castle.attackRange
      ))
      .sort((first, second) => (
        distance(building.position, first.position)
        - distance(building.position, second.position)
        || first.id.localeCompare(second.id)
      ))[0];
    if (!target) return { ...building, castleCombat };
    attacks.push({
      castleId: building.id,
      faction: building.faction,
      targetId: target.id,
      origin: { ...building.position },
      targetPosition: { ...target.position },
    });
    damageIntents.push({
      sourceId: building.id,
      sourceType: "building",
      targetId: target.id,
      targetType: "unit",
      amount: GAME_RULES.castle.damage,
    });
    return {
      ...building,
      castleCombat: {
        ...castleCombat,
        cooldownRemaining: GAME_RULES.castle.attackCooldown,
      },
    };
  });
  return { buildings: next, attacks, damageIntents };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
