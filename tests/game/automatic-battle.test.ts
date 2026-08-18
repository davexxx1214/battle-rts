import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { createBattleBuilding } from "../../src/game/buildings";
import { createBuildingOccupancy } from "../../src/game/deployment";
import { createFormationSlots } from "../../src/game/formation";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../../src/map/battlefield";

function withBuildings(
  state: BattleState,
  buildings: BattleState["buildings"],
): BattleState {
  return { ...state, buildings, buildingOccupancy: createBuildingOccupancy() };
}

describe("automatic battle behavior", () => {
  it("recovers bone dragons that enter the water gap between the bridges", () => {
    const bridgeKeys = new Set(BATTLEFIELD_MAP.bridges.flatMap((bridge) => (
      bridge.cells.map(({ q, r }) => `${q},${r}`)
    )));

    for (const gap of [{ q: 0, r: -1 }, { q: 0, r: 0 }, { q: 0, r: 1 }] as const) {
      expect(getBattlefieldCell(gap)).toMatchObject({ surface: "water", walkable: false });
      const defender = createBattleUnit({
        id: `verdant-defender-${gap.r}`,
        faction: "verdant",
        role: "catapult",
        position: axialToWorld(BATTLEFIELD_MAP.bridges[0]!.landings.verdant[0]),
      });
      const dragon = {
        ...createBattleUnit({
          id: `crimson-dragon-${gap.r}`,
          faction: "crimson",
          role: "bone-dragon",
          combatProfile: "undead" as const,
          position: axialToWorld(gap),
        }),
        currentTarget: { targetType: "unit" as const, targetId: defender.id },
      };

      const next = stepBattle(
        createBattleState([dragon, defender], { undeadOpponent: true }),
        0.1,
      );
      const recovered = next.units.find(({ id }) => id === dragon.id)!;
      const coordinate = worldToAxial(recovered.position);

      expect(
        getBattlefieldCell(coordinate)?.walkable,
        `gap=${gap.q},${gap.r} recovered=${coordinate.q},${coordinate.r}`,
      ).toBe(true);
      expect(bridgeKeys.has(`${coordinate.q},${coordinate.r}`)).toBe(true);
      expect(recovered.position).not.toEqual(dragon.position);
    }
  });

  it("recovers a water-bound bone dragon while it is charging without a nearby target", () => {
    const dragon = createBattleUnit({
      id: "crimson-charging-water-dragon",
      faction: "crimson",
      role: "bone-dragon",
      combatProfile: "undead",
      position: axialToWorld({ q: 0, r: 0 }),
    });
    const initial = withBuildings(
      createBattleState([dragon], { undeadOpponent: true }),
      [],
    );

    const next = stepBattle(initial, 0.1);
    const recovered = next.units.find(({ id }) => id === dragon.id)!;
    const coordinate = worldToAxial(recovered.position);

    expect(getBattlefieldCell(coordinate)?.walkable).toBe(true);
    expect(recovered.position).not.toEqual(dragon.position);
    expect(recovered.status).toBe("moving");
  });

  it("routes a bone dragon onto a bridge before breathing at a target across water", () => {
    const defender = createBattleUnit({
      id: "verdant-bridge-defender",
      faction: "verdant",
      role: "catapult",
      position: axialToWorld({ q: -1, r: 1 }),
    });
    const dragon = {
      ...createBattleUnit({
        id: "crimson-waterline-dragon",
        faction: "crimson",
        role: "bone-dragon",
        combatProfile: "undead" as const,
        position: axialToWorld({ q: 0, r: -2 }),
      }),
      currentTarget: { targetType: "unit" as const, targetId: defender.id },
    };
    let state = stepBattle(
      createBattleState([dragon, defender], { undeadOpponent: true }),
      0.1,
    );
    const firstMove = state.units.find(({ id }) => id === dragon.id)!;

    expect(firstMove.status).toBe("moving");
    expect(firstMove.waypoints.length).toBeGreaterThan(0);
    expect(state.events.some((event) => (
      event.type === "attack-started" && event.attackerId === dragon.id
    ))).toBe(false);

    let attacked = false;
    for (let step = 0; step < 80; step += 1) {
      state = stepBattle(state, 0.1);
      const current = state.units.find(({ id }) => id === dragon.id)!;
      expect(getBattlefieldCell(worldToAxial(current.position))?.walkable).toBe(true);
      attacked ||= state.events.some((event) => (
        event.type === "attack-started" && event.attackerId === dragon.id
      ));
    }
    expect(attacked).toBe(true);
  });

  it("keeps a bone dragon moving after it reroutes from a bridge edge", () => {
    const defender = createBattleUnit({
      id: "verdant-reroute-defender",
      faction: "verdant",
      role: "ranger",
      position: axialToWorld({ q: -2, r: 4 }),
    });
    const dragon = {
      ...createBattleUnit({
        id: "crimson-rerouting-dragon",
        faction: "crimson",
        role: "bone-dragon",
        combatProfile: "undead" as const,
        position: axialToWorld({ q: 0, r: -2 }),
      }),
      currentTarget: { targetType: "unit" as const, targetId: defender.id },
    };
    let state = createBattleState([dragon, defender], { undeadOpponent: true });

    for (let step = 0; step < 24; step += 1) {
      state = stepBattle(state, 0.1);
      const current = state.units.find(({ id }) => id === dragon.id)!;
      expect(getBattlefieldCell(worldToAxial(current.position))?.walkable).toBe(true);
    }

    const current = state.units.find(({ id }) => id === dragon.id)!;
    expect(current.position.z).toBeGreaterThan(-2);
    expect(current.status).not.toBe("idle");
  });

  it("keeps a three-swordsman charge on walkable terrain from every walkable formation start", () => {
    const starts = BATTLEFIELD_MAP.cells.filter((cell) => {
      if (cell.territory !== "verdant" || !cell.walkable) return false;
      return createFormationSlots(3, axialToWorld(cell), Math.PI).every((position) => {
        const memberCell = getBattlefieldCell(worldToAxial(position));
        return memberCell?.territory === "verdant" && memberCell.walkable;
      });
    });

    for (const start of starts) {
      const units = createFormationSlots(3, axialToWorld(start), Math.PI).map((position, index) => (
        createBattleUnit({
          id: `verdant-${start.q}-${start.r}-${index}`,
          faction: "verdant",
          role: "knight",
          position,
        })
      ));
      let state = createBattleState(units);

      for (let step = 0; step < 600; step += 1) {
        state = stepBattle(state, 0.1);
        for (const unit of state.units.filter((candidate) => candidate.health > 0)) {
          const cell = getBattlefieldCell(worldToAxial(unit.position));
          expect(
            cell?.walkable,
            `start=${start.q},${start.r} step=${step} unit=${unit.id} position=${unit.position.x},${unit.position.z}`,
          ).toBe(true);
        }
      }
    }
  });

  it("damages an attackable building encountered on the route", () => {
    const mine = createBattleBuilding({
      id: "crimson-route-mine",
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const attacker = createBattleUnit({
      id: "verdant-attacker",
      faction: "verdant",
      role: "knight",
      position: { x: mine.position.x, z: mine.position.z + 1 },
    });
    const distantEnemy = createBattleUnit({
      id: "crimson-distant",
      faction: "crimson",
      role: "knight",
      position: axialToWorld(BATTLEFIELD_MAP.castles.crimson),
    });
    const state = withBuildings(createBattleState([attacker, distantEnemy]), [mine]);

    const next = stepBattle(state, 0.1);

    const naturalDamage = (mine.maxHealth / mine.lifetimeSeconds!) * 0.1;
    expect(next.buildings[0]?.health).toBeLessThan(mine.health - naturalDamage);
    expect(next.units.find((unit) => unit.id === attacker.id)?.behavior).toBe("engaging");
    expect(next.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      targetId: mine.id,
      targetType: "building",
    }));
  });

  it("tracks a building target through projectile flight and applies the impact", () => {
    const mine = createBattleBuilding({
      id: "crimson-ranged-mine",
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const ranger = createBattleUnit({
      id: "verdant-ranger",
      faction: "verdant",
      role: "ranger",
      position: { x: mine.position.x, z: mine.position.z + 5 },
    });
    let state = withBuildings(createBattleState([ranger]), [mine]);

    state = stepBattle(state, 0.1);
    expect(state.projectiles[0]).toMatchObject({
      targetId: mine.id,
      targetType: "building",
    });
    for (let index = 0; index < 4; index += 1) state = stepBattle(state, 0.1);

    const naturalDamage = (mine.maxHealth / mine.lifetimeSeconds!) * 0.5;
    expect(state.buildings[0]?.health).toBeLessThan(mine.health - naturalDamage);
    expect(state.events.some((event) => (
      event.type === "projectile-hit" && event.targetId === mine.id
    ))).toBe(true);
  });

  it("does not reuse a same-id unit route when switching to a building", () => {
    const sharedId = "crimson-shared";
    const mine = createBattleBuilding({
      id: sharedId,
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const ranger = {
      ...createBattleUnit({
        id: "verdant-route-switcher",
        faction: "verdant" as const,
        role: "ranger" as const,
        position: { x: mine.position.x, z: mine.position.z + 8 },
      }),
      behavior: "engaging" as const,
      currentTarget: { targetType: "building" as const, targetId: sharedId },
      navigationKey: `target:unit:${sharedId}`,
      waypoints: [{ x: mine.position.x + 4, z: mine.position.z + 8 }],
    };
    const state = withBuildings(createBattleState([ranger]), [mine]);

    const next = stepBattle(state, 0.1);

    expect(next.units[0]?.navigationKey).toBe(`target:building:${sharedId}`);
  });

  it("never makes a rushed ranged unit retreat", () => {
    const ranger = createBattleUnit({
      id: "verdant-ranger",
      faction: "verdant",
      role: "ranger",
      position: { x: 0, z: 0 },
    });
    const pressure = createBattleUnit({
      id: "crimson-pressure",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -1 },
    });
    const initial = createBattleState([ranger, pressure]);

    const next = stepBattle(initial, 0.1);
    const moved = next.units.find((unit) => unit.id === ranger.id)!;

    expect(moved.position.z).toBeLessThanOrEqual(ranger.position.z);
    expect(moved.status).toBe("attacking");
  });

  it("locks permanently onto the castle when the first castle attack starts", () => {
    const castle = createBattleBuilding({
      id: "crimson-castle",
      kind: "castle",
      faction: "crimson",
      coordinate: BATTLEFIELD_MAP.castles.crimson,
      createdAt: 0,
    });
    const attacker = createBattleUnit({
      id: "verdant-locker",
      faction: "verdant",
      role: "knight",
      position: { x: castle.position.x, z: castle.position.z + 1 },
    });
    const first = withBuildings(createBattleState([attacker]), [castle]);
    const locked = stepBattle(first, 0.1);
    const distraction = createBattleUnit({
      id: "crimson-distraction",
      faction: "crimson",
      role: "knight",
      position: { x: attacker.position.x + 0.2, z: attacker.position.z },
    });
    const distracted: BattleState = {
      ...locked,
      units: [...locked.units, distraction],
    };

    const next = stepBattle(distracted, 0.1);
    const unit = next.units.find((candidate) => candidate.id === attacker.id)!;

    expect(unit.behavior).toBe("castle-locked");
    expect(unit.currentTarget).toEqual({ targetType: "building", targetId: castle.id });
  });
});
