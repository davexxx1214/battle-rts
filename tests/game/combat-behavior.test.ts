import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  createInitialBattle,
  issueAttackCommand,
  issueAttackMoveCommand,
  issueHoldCommand,
  stepBattle,
} from "../../src/game/battle";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../../src/map/battlefield";

describe("combat role behavior", () => {
  it("fires a slow catapult stone that damages nearby enemies", () => {
    const catapult = createBattleUnit({
      id: "v-catapult",
      faction: "verdant",
      role: "catapult",
      position: { x: 0, z: 8 },
    });
    const target = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const nearby = createBattleUnit({
      id: "c-nearby",
      faction: "crimson",
      role: "ranger",
      position: { x: 1.4, z: 0 },
    });
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([catapult, target, nearby]), [target.id, nearby.id]),
      [catapult.id],
      target.id,
    );

    state = stepBattle(state, 0.1);
    expect(state.projectiles).toMatchObject([{ role: "catapult", splashRadius: 2.8 }]);

    for (let index = 0; index < 18; index += 1) state = stepBattle(state, 0.1);
    expect(state.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
    expect(state.units.find((unit) => unit.id === nearby.id)?.health).toBeLessThan(nearby.health);
  });

  it("persists unique melee engagement slots while knights close in", () => {
    const attackers = [
      createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: -2, z: 0 } }),
      createBattleUnit({ id: "v-2", faction: "verdant", role: "knight", position: { x: 2, z: 0 } }),
    ];
    const target = createBattleUnit({
      id: "c-1",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -1 },
    });
    const commanded = issueAttackCommand(
      createBattleState([...attackers, target]),
      attackers.map(({ id }) => id),
      target.id,
    );

    const next = stepBattle(commanded, 0.1);
    const slots = next.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.engagementSlot);

    expect(slots.every(Boolean)).toBe(true);
    expect(new Set(slots.map((slot) => `${slot?.targetId}:${slot?.index}`)).size).toBe(2);
  });

  it("keeps a melee unit planted when its target is already in attack range", () => {
    const target = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 1.1 },
    });
    const attacker = {
      ...createBattleUnit({
        id: "v-attacker",
        faction: "verdant" as const,
        role: "knight" as const,
        position: { x: 0, z: 0 },
      }),
      engagementSlot: {
        attackerId: "v-attacker",
        targetId: target.id,
        index: 2,
        position: { x: 0, z: 2.12 },
      },
    };
    const state = issueAttackCommand(
      issueHoldCommand(createBattleState([attacker, target]), [target.id]),
      [attacker.id],
      target.id,
    );

    const next = stepBattle(state, 0.05);
    const advanced = next.units.find((unit) => unit.id === attacker.id)!;

    expect(advanced.position).toEqual(attacker.position);
    expect(advanced.status).toBe("attacking");
  });

  it.each([
    ["ranger", 5.5, 7],
    ["mage", 4.5, 6.2],
  ] as const)("keeps a %s inside its preferred firing band", (role, minimum, maximum) => {
    const ranged = createBattleUnit({
      id: `v-${role}`,
      faction: "verdant",
      role,
      position: { x: 0, z: 8 },
    });
    const target = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: 0 },
    });
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([ranged, target]), [target.id]),
      [ranged.id],
      target.id,
    );

    for (let index = 0; index < 35; index += 1) state = stepBattle(state, 0.1);
    const current = state.units.find((unit) => unit.id === ranged.id)!;
    const distance = Math.hypot(
      current.position.x - target.position.x,
      current.position.z - target.position.z,
    );

    expect(distance).toBeGreaterThanOrEqual(minimum - 0.12);
    expect(distance).toBeLessThanOrEqual(maximum + 0.12);
  });

  it("moves a pressured ranged unit toward its own rear", () => {
    const ranger = createBattleUnit({
      id: "v-ranger",
      faction: "verdant",
      role: "ranger",
      position: { x: 0, z: 0 },
    });
    const pressure = createBattleUnit({
      id: "c-knight",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -1.2 },
    });
    const state = issueAttackCommand(
      createBattleState([ranger, pressure]),
      [ranger.id],
      pressure.id,
    );

    const next = stepBattle(state, 0.1);
    const moved = next.units.find((unit) => unit.id === ranger.id)!;

    expect(moved.position.z).toBeGreaterThan(ranger.position.z);
    expect(moved.order).toEqual({ type: "attack", targetId: pressure.id });
  });

  it("does not alternate advance and evasion every combat tick", () => {
    const ranger = createBattleUnit({
      id: "v-ranger",
      faction: "verdant",
      role: "ranger",
      position: { x: 0, z: 0 },
    });
    const focus = createBattleUnit({
      id: "c-focus",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: -10 },
    });
    const pressure = createBattleUnit({
      id: "c-pressure",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -2.2 },
    });
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([ranger, focus, pressure]), [focus.id, pressure.id]),
      [ranger.id],
      focus.id,
    );
    const positions = [ranger.position.z];

    for (let index = 0; index < 20; index += 1) {
      state = stepBattle(state, 0.05);
      positions.push(state.units.find((unit) => unit.id === ranger.id)!.position.z);
    }
    const motions = positions.slice(1).map((position, index) => position - positions[index]!);
    const reversals = motions.slice(1).filter((motion, index) => (
      Math.abs(motion) > 0.005
      && Math.abs(motions[index]!) > 0.005
      && Math.sign(motion) !== Math.sign(motions[index]!)
    ));

    expect(reversals.length).toBeLessThanOrEqual(2);
  });

  it("keeps an explicit focus target ahead of a closer automatic target", () => {
    const ranger = createBattleUnit({
      id: "v-ranger",
      faction: "verdant",
      role: "ranger",
      position: { x: 0, z: 7 },
    });
    const focus = createBattleUnit({
      id: "c-focus",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: 1 },
    });
    const closer = createBattleUnit({
      id: "c-closer",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: 3 },
    });
    const state = issueAttackCommand(
      issueHoldCommand(createBattleState([ranger, focus, closer]), [focus.id, closer.id]),
      [ranger.id],
      focus.id,
    );

    const next = stepBattle(state, 0.1);
    const attack = next.events.find((event) => (
      event.type === "attack-started" && event.attackerId === ranger.id
    ));

    expect(attack).toMatchObject({ type: "attack-started", targetId: focus.id });
  });

  it("rebuilds a missing movement route instead of crossing blocked terrain", () => {
    const destination = axialToWorld({ q: 5, r: 2 });
    const mover = {
      ...createBattleUnit({
        id: "v-ranger",
        faction: "verdant" as const,
        role: "ranger" as const,
        position: axialToWorld({ q: 2, r: 0 }),
      }),
      order: { type: "move" as const, destination },
      waypoints: [],
    };
    const distantEnemy = createBattleUnit({
      id: "c-observer",
      faction: "crimson",
      role: "knight",
      position: { x: -100, z: -100 },
    });
    let state = issueHoldCommand(createBattleState([mover, distantEnemy]), [distantEnemy.id]);
    const visited = [mover.position];

    for (let index = 0; index < 120; index += 1) {
      state = stepBattle(state, 0.05);
      visited.push(state.units[0]!.position);
    }

    const blocked = visited.find((point) => !getBattlefieldCell(worldToAxial(point))?.walkable);
    expect(blocked, JSON.stringify({ blocked, axial: blocked && worldToAxial(blocked) })).toBeUndefined();
    expect(state.units[0]!.position).toEqual(destination);
    expect(state.units[0]!.position.x).not.toBeNaN();
    expect(state.units[0]!.position.z).not.toBeNaN();
  });

  it("keeps a squad fighting at thirty percent strength and delays victory until every unit dies", () => {
    const squad = Array.from({ length: 10 }, (_, index) => {
      const unit = createBattleUnit({
        id: `v-${index}`,
        squadId: "verdant-test-squad",
        faction: "verdant",
        role: "knight",
        position: { x: index * 0.1, z: 0 },
      });
      return index < 3
        ? unit
        : { ...unit, health: 0, status: "dead" as const };
    });
    const enemy = createBattleUnit({
      id: "c-survivor",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: -8 },
    });

    const next = stepBattle(createBattleState([...squad, enemy]), 0.1);
    const survivors = next.units.filter((unit) => unit.squadId === "verdant-test-squad" && unit.health > 0);

    expect(survivors.every((unit) => unit.health > 0 && unit.status !== "dead")).toBe(true);
    expect(next.events).toEqual([]);
    expect(next.winner).toBeNull();
  });

  it("resolves the default deterministic battle between sixty and one hundred seconds", () => {
    let state = createInitialBattle();
    const verdantIds = state.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.id);
    state = issueAttackMoveCommand(
      state,
      verdantIds,
      axialToWorld(BATTLEFIELD_MAP.crimsonCamp),
    );

    for (let index = 0; index < 2_400 && !state.winner; index += 1) {
      state = stepBattle(state, 0.05);
    }
    expect(state.winner, JSON.stringify(state.units.filter((unit) => unit.health > 0).map((unit) => ({
      id: unit.id,
      role: unit.role,
      health: unit.health,
      position: unit.position,
    })))).not.toBeNull();
    expect(state.elapsed).toBeGreaterThanOrEqual(60);
    expect(state.elapsed).toBeLessThanOrEqual(100);
    expect(state.units.every((unit) => (
      Number.isFinite(unit.position.x) && Number.isFinite(unit.position.z)
    ))).toBe(true);
  });

  it("freezes the simulation after the post-battle presentation window", () => {
    let state = createInitialBattle();
    const verdantIds = state.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.id);
    state = issueAttackMoveCommand(
      state,
      verdantIds,
      axialToWorld(BATTLEFIELD_MAP.crimsonCamp),
    );
    for (let index = 0; index < 2_400 && !state.winner; index += 1) {
      state = stepBattle(state, 0.05);
    }
    const resolvedAt = state.elapsed;
    for (let index = 0; index < 400; index += 1) state = stepBattle(state, 0.05);
    const frozen = state;

    expect(state.elapsed).toBeLessThanOrEqual(resolvedAt + 8.05);
    expect(stepBattle(state, 0.05)).toBe(frozen);
  });
});
