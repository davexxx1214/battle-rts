import type { CombatTarget, CombatTargetType } from "./combat";
import type { AttackVisualKind, UnitRole, WorldPoint } from "./types";

export interface BattleProjectile {
  readonly id: string;
  readonly attackerId: string;
  readonly sourceType: CombatTargetType;
  readonly targetId: string;
  readonly targetType: CombatTargetType;
  readonly role: UnitRole;
  readonly visualKind?: AttackVisualKind;
  readonly origin: WorldPoint;
  readonly position: WorldPoint;
  readonly destination: WorldPoint;
  readonly speed: number;
  readonly damage: number;
  readonly splashRadius: number;
}

export interface ProjectileImpact {
  readonly projectile: BattleProjectile;
  readonly position: WorldPoint;
}

export interface ProjectileStep {
  readonly projectiles: readonly BattleProjectile[];
  readonly impacts: readonly ProjectileImpact[];
}

export function advanceProjectiles(
  projectiles: readonly BattleProjectile[],
  targets: readonly CombatTarget[],
  deltaSeconds: number,
): ProjectileStep {
  const remaining: BattleProjectile[] = [];
  const impacts: ProjectileImpact[] = [];
  const targetsByKey = new Map(targets.map((target) => [
    `${target.targetType}:${target.id}`,
    target,
  ] as const));

  for (const projectile of projectiles) {
    const target = targetsByKey.get(`${projectile.targetType}:${projectile.targetId}`);
    const destination = projectile.role === "catapult"
      ? projectile.destination
      : target && target.health > 0
        ? target.position
        : projectile.destination;
    const maximumDistance = projectile.speed * deltaSeconds;
    const distanceRemaining = distance(projectile.position, destination);

    if (distanceRemaining <= maximumDistance) {
      impacts.push({ projectile, position: { ...destination } });
      continue;
    }

    remaining.push({
      ...projectile,
      position: moveToward(projectile.position, destination, maximumDistance),
      destination: { ...destination },
    });
  }

  return { projectiles: remaining, impacts };
}

function moveToward(origin: WorldPoint, destination: WorldPoint, distanceToMove: number): WorldPoint {
  const dx = destination.x - origin.x;
  const dz = destination.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (length === 0 || length <= distanceToMove) return { ...destination };
  const ratio = distanceToMove / length;
  return { x: origin.x + dx * ratio, z: origin.z + dz * ratio };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
