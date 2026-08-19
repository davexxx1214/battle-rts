import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import type { BattleBuilding } from "../../src/game/buildings";
import { createBattleBuilding } from "../../src/game/buildings";
import { GAME_RULES, UNIT_SPECS } from "../../src/game/rules";
import { BATTLEFIELD_MAP, axialToWorld, getMapCell } from "../../src/map/battlefield";

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
    expect(state.projectiles.find(({ attackerId }) => attackerId === tower.id)?.visualKind)
      .toBeUndefined();
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: tower.id,
      targetId: nearer.id,
      role: "arrow-tower",
    }));
  });

  it("marks an undead tower projectile and its impact as poison cloud visuals", () => {
    const factionRaces = { verdant: "undead" as const };
    const probe = createBattleState([], { factionRaces });
    const tower = verdantTower(probe);
    const target = createBattleUnit({
      id: "crimson-poison-tower-target",
      faction: "crimson",
      role: "ranger",
      position: { x: tower.position.x, z: tower.position.z - 5 },
    });
    const initial = createBattleState([target], { factionRaces });
    let state: BattleState = { ...initial, buildings: [tower] };

    state = stepBattle(state, 0.1);
    expect(state.projectiles).toContainEqual(expect.objectContaining({
      attackerId: tower.id,
      visualKind: "poison-cloud",
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: tower.id,
      visualKind: "poison-cloud",
    }));
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "projectile-spawned",
      attackerId: tower.id,
      visualKind: "poison-cloud",
    }));

    for (let index = 0; index < 6; index += 1) state = stepBattle(state, 0.1);
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "projectile-hit",
      attackerId: tower.id,
      visualKind: "poison-cloud",
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

  it("uses the cheaper deployable tower stats and expires after twenty seconds", () => {
    const coordinate = BATTLEFIELD_MAP.cells.find((cell) => (
      cell.territory === "verdant" && cell.buildable
    ));
    if (!coordinate) throw new Error("Missing guard tower coordinate.");
    const tower = createBattleBuilding({
      id: "verdant-guard-tower-test",
      kind: "guard-tower",
      faction: "verdant",
      coordinate,
      createdAt: 0,
    });
    const target = createBattleUnit({
      id: "crimson-guard-tower-target",
      faction: "crimson",
      role: "ranger",
      position: {
        x: axialToWorld(coordinate).x,
        z: axialToWorld(coordinate).z - 5,
      },
    });
    let state: BattleState = {
      ...createBattleState([target], { factionRaces: { verdant: "undead" } }),
      buildings: [tower],
    };

    state = stepBattle(state, 0.1);
    expect(state.projectiles).toContainEqual(expect.objectContaining({
      attackerId: tower.id,
      speed: GAME_RULES.buildings.guardTower.projectileSpeed,
      damage: GAME_RULES.buildings.guardTower.damage,
      visualKind: "poison-cloud",
    }));

    state = { ...createBattleState([]), buildings: [tower] };
    for (
      let elapsed = 0;
      elapsed < GAME_RULES.buildings.guardTower.lifetimeSeconds;
      elapsed += 0.1
    ) state = stepBattle(state, 0.1);
    expect(state.buildings.find(({ id }) => id === tower.id)).toMatchObject({
      status: "destroyed",
      health: 0,
    });
    expect(state.events).toContainEqual(expect.objectContaining({
      type: "building-destroyed",
      buildingId: tower.id,
      cause: "expired",
    }));
  });
});
