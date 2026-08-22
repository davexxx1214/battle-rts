import type { CombatBattleUnit } from "./battle";

interface EnemyQueryOptions {
  readonly include?: (unit: CombatBattleUnit) => boolean;
}

const DEFAULT_CELL_SIZE = 4;

export class BattleSpatialIndex {
  readonly #cellSize: number;
  readonly #livingByCell = new Map<string, CombatBattleUnit[]>();
  readonly #unitsById = new Map<string, CombatBattleUnit>();

  constructor(units: readonly CombatBattleUnit[], cellSize = DEFAULT_CELL_SIZE) {
    this.#cellSize = cellSize;
    for (const unit of units) {
      this.#unitsById.set(unit.id, unit);
      if (unit.health <= 0) continue;
      const key = this.#key(unit.position.x, unit.position.z);
      const occupants = this.#livingByCell.get(key) ?? [];
      occupants.push(unit);
      this.#livingByCell.set(key, occupants);
    }
    for (const occupants of this.#livingByCell.values()) {
      occupants.sort((first, second) => first.id.localeCompare(second.id));
    }
  }

  unitById(id: string): CombatBattleUnit | undefined {
    return this.#unitsById.get(id);
  }

  enemiesWithin(
    unit: CombatBattleUnit,
    radius: number,
    options: EnemyQueryOptions = {},
  ): CombatBattleUnit[] {
    const minimumX = Math.floor((unit.position.x - radius) / this.#cellSize);
    const maximumX = Math.floor((unit.position.x + radius) / this.#cellSize);
    const minimumZ = Math.floor((unit.position.z - radius) / this.#cellSize);
    const maximumZ = Math.floor((unit.position.z + radius) / this.#cellSize);
    const matches: Array<{ unit: CombatBattleUnit; distance: number }> = [];
    for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
      for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ += 1) {
        for (const candidate of this.#livingByCell.get(`${cellX}:${cellZ}`) ?? []) {
          if (candidate.faction === unit.faction) continue;
          if (options.include && !options.include(candidate)) continue;
          const distance = Math.hypot(
            candidate.position.x - unit.position.x,
            candidate.position.z - unit.position.z,
          );
          if (distance <= radius) matches.push({ unit: candidate, distance });
        }
      }
    }
    matches.sort((first, second) => (
      first.distance - second.distance || first.unit.id.localeCompare(second.unit.id)
    ));
    return matches.map((match) => match.unit);
  }

  #key(x: number, z: number): string {
    return `${Math.floor(x / this.#cellSize)}:${Math.floor(z / this.#cellSize)}`;
  }
}
