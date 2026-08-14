import type { BattleUnit } from "./battle";
import type { UnitRole, WorldPoint } from "./types";
import { getBattlefieldCell, worldToAxial } from "../map/battlefield";

const ROLE_DEPTH: Readonly<Record<UnitRole, number>> = {
  knight: 2.4,
  ranger: -1.1,
  mage: -3.8,
  catapult: -6.4,
};

export function createFormationSlots(
  count: number,
  center: WorldPoint,
  facing: number,
  spacing = 0.78,
): WorldPoint[] {
  if (count <= 0) return [];
  const columns = Math.min(5, Math.ceil(count / 2));
  const rows = Math.ceil(count / columns);
  const cosine = Math.cos(facing);
  const sine = Math.sin(facing);

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const localX = (column - (columns - 1) / 2) * spacing;
    const localZ = (row - (rows - 1) / 2) * spacing;
    return {
      x: center.x + localX * cosine + localZ * sine,
      z: center.z - localX * sine + localZ * cosine,
    };
  });
}

export function assignSquadFormationDestinations(
  units: readonly BattleUnit[],
  destination: WorldPoint,
): Map<string, WorldPoint> {
  const grouped = new Map<string, BattleUnit[]>();
  for (const unit of [...units].sort((first, second) => first.id.localeCompare(second.id))) {
    const members = grouped.get(unit.squadId) ?? [];
    members.push(unit);
    grouped.set(unit.squadId, members);
  }
  const groups = [...grouped.entries()]
    .map(([squadId, members]) => ({ squadId, members, role: members[0]!.role }))
    .sort((first, second) => (
      roleOrder(first.role) - roleOrder(second.role)
      || first.squadId.localeCompare(second.squadId)
    ));
  const centroid = averagePoint(units.map((unit) => unit.position));
  const dx = destination.x - centroid.x;
  const dz = destination.z - centroid.z;
  const facing = Math.hypot(dx, dz) > 0.01
    ? Math.atan2(dx, dz)
    : averageFacing(units);
  const forward = { x: Math.sin(facing), z: Math.cos(facing) };
  const right = { x: Math.cos(facing), z: -Math.sin(facing) };
  const byRole = new Map<UnitRole, typeof groups>();
  for (const group of groups) {
    const sameRole = byRole.get(group.role) ?? [];
    sameRole.push(group);
    byRole.set(group.role, sameRole);
  }
  const destinations = new Map<string, WorldPoint>();

  for (const group of groups) {
    const peers = byRole.get(group.role)!;
    const peerIndex = peers.findIndex((candidate) => candidate.squadId === group.squadId);
    const lateral = (peerIndex - (peers.length - 1) / 2) * 4.6;
    const depth = ROLE_DEPTH[group.role];
    const squadCenter = {
      x: destination.x + right.x * lateral + forward.x * depth,
      z: destination.z + right.z * lateral + forward.z * depth,
    };
    const slots = createFormationSlots(group.members.length, squadCenter, facing);
    group.members.forEach((unit, index) => destinations.set(unit.id, slots[index]!));
  }

  return destinations;
}

export function separateLivingAllies(
  units: readonly BattleUnit[],
  minimumDistance = 0.65,
): BattleUnit[] {
  const positions = units.map((unit) => ({ ...unit.position }));

  for (let first = 0; first < units.length; first += 1) {
    const firstUnit = units[first]!;
    if (firstUnit.health <= 0) continue;
    for (let second = first + 1; second < units.length; second += 1) {
      const secondUnit = units[second]!;
      if (secondUnit.health <= 0 || secondUnit.faction !== firstUnit.faction) continue;
      let dx = positions[second]!.x - positions[first]!.x;
      let dz = positions[second]!.z - positions[first]!.z;
      let distance = Math.hypot(dx, dz);
      if (distance >= minimumDistance) continue;
      if (distance < 0.001) {
        const direction = stableDirection(firstUnit.id, secondUnit.id);
        dx = direction.x;
        dz = direction.z;
        distance = 1;
      }
      const correction = (minimumDistance - distance) / 2;
      const normalX = dx / distance;
      const normalZ = dz / distance;
      const firstCandidate = {
        x: positions[first]!.x - normalX * correction,
        z: positions[first]!.z - normalZ * correction,
      };
      const secondCandidate = {
        x: positions[second]!.x + normalX * correction,
        z: positions[second]!.z + normalZ * correction,
      };
      if (getBattlefieldCell(worldToAxial(firstCandidate))?.walkable) positions[first] = firstCandidate;
      if (getBattlefieldCell(worldToAxial(secondCandidate))?.walkable) positions[second] = secondCandidate;
    }
  }

  return units.map((unit, index) => ({ ...unit, position: positions[index]! }));
}

function averagePoint(points: readonly WorldPoint[]): WorldPoint {
  if (points.length === 0) return { x: 0, z: 0 };
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, z: total.z + point.z }),
    { x: 0, z: 0 },
  );
  return { x: sum.x / points.length, z: sum.z / points.length };
}

function averageFacing(units: readonly BattleUnit[]): number {
  if (units.length === 0) return 0;
  const direction = units.reduce(
    (sum, unit) => ({
      x: sum.x + Math.sin(unit.facing),
      z: sum.z + Math.cos(unit.facing),
    }),
    { x: 0, z: 0 },
  );
  return Math.atan2(direction.x, direction.z);
}

function stableDirection(firstId: string, secondId: string): WorldPoint {
  const value = [...`${firstId}:${secondId}`]
    .reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0, 17);
  const angle = ((value >>> 0) % 360) * Math.PI / 180;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function roleOrder(role: UnitRole): number {
  if (role === "knight") return 0;
  if (role === "ranger") return 1;
  if (role === "mage") return 2;
  return 3;
}
