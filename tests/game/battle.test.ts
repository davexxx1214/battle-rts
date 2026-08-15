import { describe, expect, it } from "vitest";

import {
  UNIT_SPECS,
  createBattleState,
  createBattleUnit,
  createInitialBattle,
  issueAttackCommand,
  issueAttackMoveCommand,
  issueHoldCommand,
  issueMoveCommand,
  stepBattle,
} from "../../src/game/battle";
import { getBattlefieldCell, worldToAxial } from "../../src/map/battlefield";

describe("RTS battle simulation", () => {
  it("starts both armies with infantry, ranged troops, mages, and one mobile catapult", () => {
    const state = createInitialBattle();

    for (const faction of ["verdant", "crimson"] as const) {
      const roles = new Set(
        state.units.filter((unit) => unit.faction === faction).map((unit) => unit.role),
      );
      expect(roles).toEqual(new Set(["knight", "ranger", "mage", "catapult"]));
      expect(state.units.filter((unit) => unit.faction === faction)).toHaveLength(41);
      expect(state.units.filter((unit) => (
        unit.faction === faction && unit.role === "catapult"
      ))).toHaveLength(1);
      expect(state.squads.filter((squad) => squad.faction === faction)).toHaveLength(6);
    }
    expect(UNIT_SPECS.catapult).toMatchObject({
      attackMode: "projectile",
      rangeResponse: "stand",
    });
  });

  it("keeps every initial unit on walkable terrain in front of the fortified camps", () => {
    const state = createInitialBattle();

    expect(state.units.every((unit) => (
      getBattlefieldCell(worldToAxial(unit.position))?.walkable
    ))).toBe(true);
  });

  it("fans selected units into a formation around a move destination", () => {
    const units = [
      createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 0 } }),
      createBattleUnit({ id: "v-2", faction: "verdant", role: "ranger", position: { x: 1, z: 0 } }),
      createBattleUnit({ id: "v-3", faction: "verdant", role: "mage", position: { x: 2, z: 0 } }),
      createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 8, z: 0 } }),
    ];

    const moved = issueMoveCommand(
      createBattleState(units),
      ["v-1", "v-2", "v-3"],
      { x: 5, z: 4 },
    );
    const destinations = moved.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.order.type === "move" ? unit.order.destination : null);

    expect(destinations.every(Boolean)).toBe(true);
    expect(new Set(destinations.map((point) => `${point?.x},${point?.z}`)).size).toBe(3);
    expect(moved.units.find((unit) => unit.id === "c-1")?.order).toEqual({ type: "idle" });
  });

  it("lets a knight close to melee range before dealing damage", () => {
    const knight = createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 0 } });
    const target = createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 5, z: 0 } });
    const commanded = issueAttackCommand(createBattleState([knight, target]), [knight.id], target.id);

    const early = stepBattle(commanded, 0.1);
    expect(early.units.find((unit) => unit.id === target.id)?.health).toBe(target.health);
    expect(early.units.find((unit) => unit.id === knight.id)?.position.x).toBeGreaterThan(0);

    let resolved = early;
    for (let index = 0; index < 20; index += 1) resolved = stepBattle(resolved, 0.1);
    expect(resolved.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
  });

  it("gives the player a short deployment window before enemy AI advances", () => {
    const friendly = createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 5 } });
    const enemy = createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: -5 } });
    let state = issueAttackMoveCommand(
      createBattleState([friendly, enemy]),
      [enemy.id],
      { x: 0, z: 0 },
      2,
    );

    for (let index = 0; index < 15; index += 1) state = stepBattle(state, 0.1);
    expect(state.units.find((unit) => unit.id === enemy.id)?.position).toEqual(enemy.position);

    for (let index = 0; index < 15; index += 1) state = stepBattle(state, 0.1);
    expect(state.units.find((unit) => unit.id === enemy.id)?.position.z).toBeGreaterThan(enemy.position.z);
  });

  it("advances the initial enemy army as attack-move squads after deployment", () => {
    const initial = createInitialBattle();
    const initialEnemies = initial.units.filter((unit) => unit.faction === "crimson");
    expect(initialEnemies.every((unit) => unit.order.type === "attack-move")).toBe(true);

    let state = initial;
    for (let index = 0; index < 15; index += 1) state = stepBattle(state, 0.1);
    expect(state.units.filter((unit) => unit.faction === "crimson").map((unit) => unit.position))
      .toEqual(initialEnemies.map((unit) => unit.position));

    for (let index = 0; index < 10; index += 1) state = stepBattle(state, 0.1);
    expect(state.units.some((unit) => (
      unit.faction === "crimson"
      && unit.position.z > initialEnemies.find((enemy) => enemy.id === unit.id)!.position.z
    ))).toBe(true);
  });

  it("lets a ranger fire without walking into melee", () => {
    const ranger = createBattleUnit({ id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 0 } });
    const target = createBattleUnit({ id: "c-k", faction: "crimson", role: "knight", position: { x: 5, z: 0 } });
    const commanded = issueAttackCommand(
      issueHoldCommand(createBattleState([ranger, target]), [target.id]),
      [ranger.id],
      target.id,
    );

    let fired = commanded;
    for (let index = 0; index < 6; index += 1) {
      fired = stepBattle(fired, 0.1);
      if (fired.events.some((event) => event.type === "attack-started")) break;
    }
    const firedRanger = fired.units.find((unit) => unit.id === ranger.id);

    expect(fired.units.find((unit) => unit.id === target.id)?.health).toBe(target.health);
    expect(Math.hypot(
      target.position.x - firedRanger!.position.x,
      target.position.z - firedRanger!.position.z,
    )).toBeGreaterThanOrEqual(Math.hypot(
      target.position.x - ranger.position.x,
      target.position.z - ranger.position.z,
    ));
    expect(fired.events.some((event) => (
      event.type === "attack-started" && event.targetId === target.id
    ))).toBe(true);
    expect(fired.projectiles).toHaveLength(1);
    expect(fired.events.map((event) => event.type)).toEqual([
      "attack-started",
      "projectile-spawned",
    ]);

    let impacted = fired;
    for (let index = 0; index < 8; index += 1) impacted = stepBattle(impacted, 0.1);
    expect(impacted.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
    expect(impacted.events.some((event) => event.type === "projectile-hit")).toBe(true);
    expect(impacted.events.some((event) => event.type === "damage-applied")).toBe(true);
  });

  it("does not apply a projectile again when its recorded target dies in flight", () => {
    const ranger = createBattleUnit({ id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 0 } });
    const target = createBattleUnit({ id: "c-k", faction: "crimson", role: "knight", position: { x: 5, z: 0 } });
    let state = stepBattle(
      issueAttackCommand(createBattleState([ranger, target]), [ranger.id], target.id),
      0.1,
    );
    state = {
      ...state,
      units: state.units.map((unit) => unit.id === target.id
        ? { ...unit, health: 0, status: "dead", order: { type: "idle" } }
        : unit),
    };
    for (let index = 0; index < 8; index += 1) state = stepBattle(state, 0.1);

    if (state.units.find((unit) => unit.id === target.id)?.health !== 0) {
      throw new Error(JSON.stringify(state.units.map(({
        id, health, position, status, engagementSlot,
      }) => ({ id, health, position, status, engagementSlot }))));
    }
    expect(state.events.some((event) => (
      event.type === "damage-applied" && event.targetId === target.id
    ))).toBe(false);
  });

  it("keeps a deterministic two-second combat event window", () => {
    const knight = createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 0 } });
    const target = createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 1, z: 0 } });
    let state = issueAttackCommand(createBattleState([knight, target]), [knight.id], target.id);

    state = stepBattle(state, 0.1);
    const firstSequence = state.events[0]?.sequence;
    expect(firstSequence).toBe(0);

    for (let index = 0; index < 22; index += 1) state = stepBattle(state, 0.1);
    expect(state.events.every((event) => event.time >= state.elapsed - 2)).toBe(true);
    expect(state.events.every((event, index, events) => (
      index === 0 || event.sequence > events[index - 1]!.sequence
    ))).toBe(true);
    expect(state.events.some((event) => event.sequence === firstSequence)).toBe(false);
  });

  it("produces identical state and events for identical input", () => {
    const makeBattle = () => issueAttackCommand(
      createBattleState([
        createBattleUnit({ id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 0 } }),
        createBattleUnit({ id: "c-k", faction: "crimson", role: "knight", position: { x: 5, z: 0 } }),
      ]),
      ["v-r"],
      "c-k",
    );
    const run = () => {
      let state = makeBattle();
      for (let index = 0; index < 18; index += 1) state = stepBattle(state, 0.1);
      return state;
    };

    expect(run()).toEqual(run());
  });

  it("emits a unit death event only once when damage overlaps", () => {
    const first = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: { x: -0.4, z: 0 },
    });
    const second = createBattleUnit({
      id: "v-2",
      faction: "verdant",
      role: "knight",
      position: { x: 0.4, z: 0 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-1",
        faction: "crimson",
        role: "knight",
        position: { x: 0, z: 0.8 },
      }),
      health: 1,
    };
    let state = issueHoldCommand(createBattleState([first, second, target]), [target.id]);
    state = issueAttackCommand(state, [first.id, second.id], target.id);
    for (let index = 0; index < 120; index += 1) {
      state = stepBattle(state, 0.1);
      if (state.units.find((unit) => unit.id === target.id)?.health === 0) break;
    }

    expect(state.events.filter((event) => (
      event.type === "unit-died" && event.unitId === target.id
    ))).toHaveLength(1);
  });

  it("applies mage splash damage only to nearby enemies", () => {
    const mage = createBattleUnit({ id: "v-m", faction: "verdant", role: "mage", position: { x: 0, z: 0 } });
    const primary = createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 5, z: 0 } });
    const nearby = createBattleUnit({ id: "c-2", faction: "crimson", role: "ranger", position: { x: 6.5, z: 0 } });
    const distant = createBattleUnit({ id: "c-3", faction: "crimson", role: "mage", position: { x: 9, z: 0 } });
    const held = issueHoldCommand(
      createBattleState([mage, primary, nearby, distant]),
      [primary.id, nearby.id, distant.id],
    );
    const commanded = issueAttackCommand(
      held,
      [mage.id],
      primary.id,
    );

    let next = stepBattle(commanded, 0.1);
    expect(next.units.find((unit) => unit.id === primary.id)?.health).toBe(primary.health);
    for (let index = 0; index < 8; index += 1) next = stepBattle(next, 0.1);

    expect(next.units.find((unit) => unit.id === primary.id)?.health).toBeLessThan(primary.health);
    expect(next.units.find((unit) => unit.id === nearby.id)?.health).toBeLessThan(nearby.health);
    expect(next.units.find((unit) => unit.id === distant.id)?.health).toBe(distant.health);
  });

  it("stops dead units from acting and declares a winner", () => {
    const survivor = createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 0 } });
    const deadEnemy = {
      ...createBattleUnit({ id: "c-1", faction: "crimson", role: "mage", position: { x: 0.5, z: 0 } }),
      health: 0,
      status: "dead" as const,
    };

    const next = stepBattle(createBattleState([survivor, deadEnemy]), 0.1);

    expect(next.winner).toBe("verdant");
    expect(next.units.find((unit) => unit.id === survivor.id)?.health).toBe(survivor.health);
    expect(next.units.find((unit) => unit.id === deadEnemy.id)?.position).toEqual(deadEnemy.position);
  });
});
