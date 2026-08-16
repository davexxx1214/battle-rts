import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import type { BattleBuilding } from "../../src/game/buildings";
import { GAME_RULES, UNIT_SPECS } from "../../src/game/rules";
import { BATTLEFIELD_MAP, getMapCell } from "../../src/map/battlefield";

function verdantTower(state: BattleState): BattleBuilding {
  const tower = state.buildings.find((building) => (
    building.kind === "arrow-tower" && building.faction === "verdant"
  ));
  if (!tower) throw new Error("Missing verdant arrow tower.");
  return tower;
}

describe("authoritative arrow tower combat", () => {
  it("keeps its reserved hex traversable for navigation but unavailable for construction", () => {
    const state = createBattleState([]);
    const tower = verdantTower(state);

    expect(getMapCell(BATTLEFIELD_MAP, tower.coordinate))
      .toMatchObject({ walkable: true, buildable: false });
  });

  it("fires an archer-range projectile at the nearest enemy from the start of battle", () => {
    const probe = createBattleState([]);
    const tower = verdantTower(probe);
    const farther = createBattleUnit({
      id: "crimson-farther",
      faction: "crimson",
      role: "ranger",
      position: { x: tower.position.x, z: tower.position.z - UNIT_SPECS.ranger.attackRange },
    });
    const nearer = createBattleUnit({
      id: "crimson-nearer",
      faction: "crimson",
      role: "ranger",
      position: { x: tower.position.x, z: tower.position.z - 5 },
    });
    const initial = createBattleState([farther, nearer]);
    let state: BattleState = { ...initial, buildings: [tower] };

    state = stepBattle(state, 0.1);

    expect(state.projectiles).toContainEqual(expect.objectContaining({
      attackerId: tower.id,
      sourceType: "building",
      targetId: nearer.id,
      targetType: "unit",
      role: "ranger",
      speed: GAME_RULES.buildings.arrowTower.projectileSpeed,
      damage: GAME_RULES.buildings.arrowTower.damage,
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: tower.id,
      targetId: nearer.id,
      role: "arrow-tower",
    }));
  });

  it("applies its projectile damage and respects its attack cooldown", () => {
    const probe = createBattleState([]);
    const tower = verdantTower(probe);
    const target = createBattleUnit({
      id: "crimson-tower-target",
      faction: "crimson",
      role: "ranger",
      position: { x: tower.position.x, z: tower.position.z - 5 },
    });
    const initial = createBattleState([target]);
    let state: BattleState = { ...initial, buildings: [tower] };

    for (let index = 0; index < 10; index += 1) state = stepBattle(state, 0.1);

    expect(state.units[0]?.health).toBe(target.health - GAME_RULES.buildings.arrowTower.damage);
    expect(state.events.filter((event) => (
      event.type === "attack-started" && event.attackerId === tower.id
    ))).toHaveLength(1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "projectile-hit",
      attackerId: tower.id,
      targetId: target.id,
    }));
  });

  it("can be automatically targeted and destroyed by an enemy unit", () => {
    const probe = createBattleState([]);
    const tower = { ...verdantTower(probe), health: 1 };
    const attacker = createBattleUnit({
      id: "crimson-tower-breaker",
      faction: "crimson",
      role: "ranger",
      position: { x: tower.position.x, z: tower.position.z - 5 },
    });
    const initial = createBattleState([attacker]);
    let state: BattleState = { ...initial, buildings: [tower] };

    for (let index = 0; index < 10; index += 1) state = stepBattle(state, 0.1);

    expect(state.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: attacker.id,
      targetId: tower.id,
      targetType: "building",
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "building-destroyed",
      buildingId: tower.id,
      cause: "damage",
    }));
  });
});
