import { describe, expect, it } from "vitest";

import {
  UNIT_SPECS,
  createBattleState,
  createBattleUnit,
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { GAME_RULES, unitSpecFor } from "../../src/game/rules";
import {
  BONE_DRAGON_FROST_SLOW,
  HUMAN_MAGE_BURNING,
  applyUnitStatusEffect,
} from "../../src/game/unitStatusEffects";
import {
  axialToWorld,
} from "../../src/map/battlefield";

function runSteps(initial: BattleState, count: number, delta = 0.1): BattleState {
  let state = initial;
  for (let index = 0; index < count; index += 1) state = stepBattle(state, delta);
  return state;
}

describe("automatic battle simulation", () => {
  it("starts with castles, defensive arrow towers, and no pre-deployed troops", () => {
    const initial = createInitialBattle();

    expect(initial.units).toEqual([]);
    expect(initial.squads).toEqual([]);
    expect(initial.buildings.filter((building) => building.kind === "castle"))
      .toHaveLength(2);
    expect(initial.buildings.filter((building) => building.kind === "arrow-tower"))
      .toHaveLength(4);
  });

  it("applies the defender's configured damage reduction to incoming attacks", () => {
    const attacker = createBattleUnit({
      id: "v-armorer", faction: "verdant", role: "knight", position: { x: 0, z: 1 },
    });
    const defender = createBattleUnit({
      id: "c-armored", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });

    const next = stepBattle(createBattleState([attacker, defender]), 0.1);
    const expectedDamage = UNIT_SPECS.knight.damage
      * (1 - UNIT_SPECS.knight.damageReduction);

    expect(next.units.find((unit) => unit.id === defender.id)?.health)
      .toBeCloseTo(defender.health - expectedDamage);
  });

  it("keeps the grounded bone dragon reachable by human melee units", () => {
    const knight = createBattleUnit({
      id: "v-dragon-hunter",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 1.2 },
    });
    const dragon = createBattleUnit({
      id: "c-grounded-dragon",
      faction: "crimson",
      role: "bone-dragon",
      combatProfile: "undead",
      position: { x: 0, z: 0 },
    });

    const next = stepBattle(createBattleState([knight, dragon], {
      undeadOpponent: true,
    }), 0.1);
    const expectedDamage = UNIT_SPECS.knight.damage
      * (1 - unitSpecFor("bone-dragon", "undead").damageReduction);
    expect(next.units.find((unit) => unit.id === dragon.id)?.health)
      .toBeCloseTo(dragon.health - expectedDamage);
  });

  it("damages enemies inside the bone dragon breath cone but not beside or behind it", () => {
    const origin = axialToWorld({ q: 0, r: 2 });
    const dragon = createBattleUnit({
      id: "c-cone-dragon",
      faction: "crimson",
      role: "bone-dragon",
      combatProfile: "undead",
      position: origin,
    });
    const primary = createBattleUnit({
      id: "v-cone-primary",
      faction: "verdant",
      role: "knight",
      position: { x: origin.x, z: origin.z + 4 },
    });
    const inside = createBattleUnit({
      id: "v-cone-inside",
      faction: "verdant",
      role: "knight",
      position: { x: origin.x + 1, z: origin.z + 4 },
    });
    const outside = createBattleUnit({
      id: "v-cone-outside",
      faction: "verdant",
      role: "knight",
      position: { x: origin.x + 4, z: origin.z + 2 },
    });
    const behind = createBattleUnit({
      id: "v-cone-behind",
      faction: "verdant",
      role: "knight",
      position: { x: origin.x, z: origin.z - 2 },
    });

    const next = stepBattle(createBattleState([
      dragon,
      primary,
      inside,
      outside,
      behind,
    ], { undeadOpponent: true }), 0.1);
    const health = (id: string) => next.units.find((unit) => unit.id === id)!.health;

    expect(health(primary.id)).toBeLessThan(primary.health);
    expect(health(inside.id)).toBeLessThan(inside.health);
    expect(health(outside.id)).toBe(outside.health);
    expect(health(behind.id)).toBe(behind.health);
    expect(next.units.find((unit) => unit.id === primary.id)?.statusEffects)
      .toEqual([expect.objectContaining({ kind: "frost-slow", expiresAt: 1.1 })]);
    expect(next.units.find((unit) => unit.id === inside.id)?.statusEffects)
      .toEqual([expect.objectContaining({ kind: "frost-slow", expiresAt: 1.1 })]);
    expect(next.units.find((unit) => unit.id === outside.id)?.statusEffects).toEqual([]);
    expect(next.units.find((unit) => unit.id === behind.id)?.statusEffects).toEqual([]);
    expect(next.projectiles).toHaveLength(0);
    expect(next.events).toContainEqual(expect.objectContaining({
      type: "attack-started",
      attackerId: dragon.id,
      role: "bone-dragon",
    }));
  });

  it("records only health actually removed so arena metrics exclude overkill", () => {
    const attacker = createBattleUnit({
      id: "v-overkill", faction: "verdant", role: "catapult", position: { x: 0, z: 4 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-fragile", faction: "crimson", role: "ranger", position: { x: 0, z: 0 },
      }),
      health: 1,
    };
    let state = createBattleState([attacker, target]);
    for (let index = 0; index < 20; index += 1) state = stepBattle(state, 0.1);
    const damage = state.events.find((event) => (
      event.type === "damage-applied" && event.targetId === target.id
    ));

    expect(damage).toMatchObject({ amount: 1 });
  });

  it("lets a knight close to melee range before dealing damage", () => {
    const knight = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: axialToWorld({ q: 2, r: 2 }),
    });
    const target = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: axialToWorld({ q: 2, r: 0 }),
    });
    const early = stepBattle(createBattleState([knight, target]), 0.1);

    expect(early.units.find((unit) => unit.id === target.id)?.health).toBe(target.health);
    expect(early.units.find((unit) => unit.id === knight.id)?.position.z)
      .toBeLessThan(knight.position.z);

    const resolved = runSteps(early, 20);
    expect(resolved.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
  });

  it("lets a ranger fire at range and applies its projectile once", () => {
    const ranger = createBattleUnit({
      id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 5 },
    });
    const target = createBattleUnit({
      id: "c-k", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });
    const fired = stepBattle(createBattleState([ranger, target]), 0.1);

    expect(fired.projectiles).toHaveLength(1);
    expect(fired.projectiles[0]).toMatchObject({ targetId: target.id, targetType: "unit" });
    expect(fired.events.map((event) => event.type)).toEqual([
      "attack-started",
      "projectile-spawned",
    ]);

    const impacted = runSteps(fired, 8);
    expect(impacted.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
    expect(impacted.events.some((event) => event.type === "projectile-hit")).toBe(true);
  });

  it("does not damage a projectile target that died in flight", () => {
    const ranger = createBattleUnit({
      id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 5 },
    });
    const target = createBattleUnit({
      id: "c-k", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });
    const fired = stepBattle(createBattleState([ranger, target]), 0.1);
    const dead: BattleState = {
      ...fired,
      units: fired.units.map((unit) => unit.id === target.id
        ? { ...unit, health: 0, status: "dead" as const }
        : unit),
      events: [],
    };

    const impacted = runSteps(dead, 8);
    expect(impacted.units.find((unit) => unit.id === target.id)?.health).toBe(0);
    expect(impacted.events.some((event) => (
      event.type === "damage-applied" && event.targetId === target.id
    ))).toBe(false);
  });

  it("keeps a deterministic two-second event window", () => {
    const knight = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 1 },
    });
    const target = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });
    const first = stepBattle(createBattleState([knight, target]), 0.1);
    const firstSequence = first.events[0]?.sequence;
    const state = runSteps(first, 22);

    expect(firstSequence).toBe(0);
    expect(state.events.every((event) => event.time >= state.elapsed - 2)).toBe(true);
    expect(state.events.every((event, index, events) => (
      index === 0 || event.sequence > events[index - 1]!.sequence
    ))).toBe(true);
    expect(state.events.some((event) => event.sequence === firstSequence)).toBe(false);
  });

  it("produces identical state and events for identical input", () => {
    const run = () => runSteps(createBattleState([
      createBattleUnit({
        id: "v-r", faction: "verdant", role: "ranger", position: { x: 0, z: 5 },
      }),
      createBattleUnit({
        id: "c-k", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
      }),
    ]), 18);

    expect(run()).toEqual(run());
  });

  it("emits a unit death event only once when damage overlaps", () => {
    const first = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: -0.4, z: 1 },
    });
    const second = createBattleUnit({
      id: "v-2", faction: "verdant", role: "knight", position: { x: 0.4, z: 1 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
      }),
      health: 1,
    };
    const state = runSteps(createBattleState([first, second, target]), 10);

    expect(state.events.filter((event) => (
      event.type === "unit-died" && event.unitId === target.id
    ))).toHaveLength(1);
  });

  it("applies mage splash only to nearby enemy units", () => {
    const mage = createBattleUnit({
      id: "v-m", faction: "verdant", role: "mage", position: { x: 0, z: 5 },
    });
    const primary = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });
    const nearby = createBattleUnit({
      id: "c-2", faction: "crimson", role: "ranger", position: { x: 1.5, z: 0 },
    });
    const distant = createBattleUnit({
      id: "c-3", faction: "crimson", role: "mage", position: { x: 4, z: 0 },
    });
    const fired = stepBattle(createBattleState([mage, primary, nearby, distant]), 0.1);
    const state = runSteps(fired, 9);

    expect(fired.projectiles[0]).toMatchObject({
      visualKind: "fireball",
      onHitStatusEffects: [expect.objectContaining({ kind: "burning" })],
    });
    expect(state.units.find((unit) => unit.id === primary.id)?.health).toBeLessThan(primary.health);
    expect(state.units.find((unit) => unit.id === nearby.id)?.health).toBeLessThan(nearby.health);
    expect(state.units.find((unit) => unit.id === distant.id)?.health).toBe(distant.health);
    expect(state.units.find((unit) => unit.id === primary.id)?.statusEffects)
      .toEqual([expect.objectContaining({ kind: "burning" })]);
    expect(state.units.find((unit) => unit.id === nearby.id)?.statusEffects)
      .toEqual([expect.objectContaining({ kind: "burning" })]);
    expect(state.units.find((unit) => unit.id === distant.id)?.statusEffects).toEqual([]);
    expect(UNIT_SPECS.mage.splashRadius).toBeGreaterThan(0);
  });

  it("slows both movement and attack recovery by thirty percent for one second", () => {
    const origin = axialToWorld({ q: 2, r: 2 });
    const mover = {
      ...createBattleUnit({
        id: "v-slow-probe",
        faction: "verdant",
        role: "knight",
        position: origin,
      }),
      cooldownRemaining: 1,
    };
    const enemy = createBattleUnit({
      id: "c-slow-probe-target",
      faction: "crimson",
      role: "knight",
      position: axialToWorld({ q: 2, r: 0 }),
    });
    const slowedMover = {
      ...mover,
      statusEffects: applyUnitStatusEffect(
        [],
        BONE_DRAGON_FROST_SLOW,
        { id: "c-slow-source", targetType: "unit" },
        0,
      ),
    };
    const normal = stepBattle(createBattleState([mover, enemy]), 0.1)
      .units.find(({ id }) => id === mover.id)!;
    const slowed = stepBattle(createBattleState([slowedMover, enemy]), 0.1)
      .units.find(({ id }) => id === mover.id)!;
    const normalDistance = Math.hypot(
      normal.position.x - origin.x,
      normal.position.z - origin.z,
    );
    const slowedDistance = Math.hypot(
      slowed.position.x - origin.x,
      slowed.position.z - origin.z,
    );

    expect(slowedDistance).toBeCloseTo(normalDistance * 0.7);
    expect(normal.cooldownRemaining).toBeCloseTo(0.9);
    expect(slowed.cooldownRemaining).toBeCloseTo(0.93);
    expect(slowed.statusEffects).toHaveLength(1);
  });

  it("applies two burn damage ticks over half a second and then removes burning", () => {
    const mage = createBattleUnit({
      id: "v-burn-source",
      faction: "verdant",
      role: "mage",
      position: { x: 0, z: 1 },
    });
    const deadMage = { ...mage, health: 0, status: "dead" as const, diedAt: 0 };
    const target = createBattleUnit({
      id: "c-burn-target",
      faction: "crimson",
      role: "spearman",
      position: { x: 0, z: 0 },
    });
    const burningTarget = {
      ...target,
      statusEffects: applyUnitStatusEffect(
        [],
        HUMAN_MAGE_BURNING,
        { id: mage.id, targetType: "unit" },
        0,
      ),
    };
    const burned = runSteps(createBattleState([deadMage, burningTarget]), 5);
    const resolvedTarget = burned.units.find(({ id }) => id === target.id)!;
    const burnDamageEvents = burned.events.filter((event) => (
      event.type === "damage-applied"
      && event.sourceId === mage.id
      && event.targetId === target.id
    ));

    expect(resolvedTarget.health).toBeCloseTo(target.health - 2);
    expect(resolvedTarget.statusEffects).toEqual([]);
    expect(burnDamageEvents).toHaveLength(2);
    expect(burnDamageEvents.every((event) => (
      event.type === "damage-applied" && event.amount === 1
    ))).toBe(true);
  });

  it("does not give the undead mage fireball burning", () => {
    const mage = createBattleUnit({
      id: "c-undead-mage",
      faction: "crimson",
      role: "mage",
      combatProfile: "undead",
      position: { x: 0, z: 0 },
    });
    const target = createBattleUnit({
      id: "v-undead-mage-target",
      faction: "verdant",
      role: "spearman",
      position: { x: 0, z: 5 },
    });
    const state = runSteps(createBattleState([mage, target], { undeadOpponent: true }), 16);
    const resolvedTarget = state.units.find(({ id }) => id === target.id)!;

    expect(resolvedTarget.health).toBeLessThan(target.health);
    expect(resolvedTarget.statusEffects).toEqual([]);
    expect(unitSpecFor("mage", "undead").onHitStatusEffects).toBeUndefined();
  });

  it("does not resolve on army elimination and draws at five minutes when castle health is tied", () => {
    const survivor = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 5 },
    });
    const deadEnemy = {
      ...createBattleUnit({
        id: "c-1", faction: "crimson", role: "mage", position: { x: 0, z: 0 },
      }),
      health: 0,
      status: "dead" as const,
    };
    const active = stepBattle(createBattleState([survivor, deadEnemy]), 0.1);
    expect(active.winner).toBeNull();

    const drawn = stepBattle({
      ...active,
      matchElapsed: GAME_RULES.match.durationSeconds - 0.05,
    }, 0.1);
    expect(drawn.winner).toBe("draw");
    expect(drawn.resolvedAt).toBe(drawn.elapsed);
  });
});
