import type { CombatBattleUnit } from "./battle";
import type { WorldPoint } from "./types";
import {
  BATTLEFIELD_MAP,
  getMapCell,
  worldToAxial,
  type BattlefieldMap,
} from "../map/battlefield";

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

export function separateLivingAllies(
  units: readonly CombatBattleUnit[],
  minimumDistance = 0.65,
  map: BattlefieldMap = BATTLEFIELD_MAP,
): CombatBattleUnit[] {
  const positions = units.map((unit) => ({ ...unit.position }));

  for (let first = 0; first < units.length; first += 1) {
    const firstUnit = units[first]!;
    if (firstUnit.health <= 0) continue;
    for (let second = first + 1; second < units.length; second += 1) {
      const secondUnit = units[second]!;
      if (secondUnit.health <= 0 || secondUnit.faction !== firstUnit.faction) continue;
      if (
        firstUnit.squadId === secondUnit.squadId
        && firstUnit.status === "moving"
        && secondUnit.status === "moving"
        && firstUnit.navigationKey !== null
        && firstUnit.navigationKey === secondUnit.navigationKey
      ) continue;
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
      if (getMapCell(map, worldToAxial(firstCandidate))?.walkable) positions[first] = firstCandidate;
      if (getMapCell(map, worldToAxial(secondCandidate))?.walkable) positions[second] = secondCandidate;
    }
  }

  return units.map((unit, index) => ({ ...unit, position: positions[index]! }));
}

function stableDirection(firstId: string, secondId: string): WorldPoint {
  const value = [...`${firstId}:${secondId}`]
    .reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) | 0, 17);
  const angle = ((value >>> 0) % 360) * Math.PI / 180;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}
