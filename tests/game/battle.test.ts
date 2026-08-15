import { describe, expect, it } from "vitest";

import {
  UNIT_SPECS,
  createBattleState,
  createBattleUnit,
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { getBattlefieldCell, worldToAxial } from "../../src/map/battlefield";

function runSteps(initial: BattleState, count: number, delta = 0.1): BattleState {
  let state = initial;
  for (let index = 0; index < count; index += 1) state = stepBattle(state, delta);
  return state;
}

describe("automatic battle simulation", () => {
  it("starts both complete armies charging immediately", () => {
    const initial = createInitialBattle();

    for (const faction of ["verdant", "crimson"] as const) {
      const units = initial.units.filter((unit) => unit.faction === faction);
      expect(new Set(units.map((unit) => unit.role)))
        .toEqual(new Set(["knight", "ranger", "mage", "catapult"]));
      expect(units).toHaveLength(41);
      expect(units.filter((unit) => unit.role === "catapult")).toHaveLength(1);
      expect(units.every((unit) => unit.behavior === "charging")).toBe(true);
    }
    const next = stepBattle(initial, 0.1);
    expect(next.units.some((unit) => (
      unit.faction === "verdant"
      && unit.position.z < initial.units.find((candidate) => candidate.id === unit.id)!.position.z
    ))).toBe(true);
    expect(next.units.some((unit) => (
      unit.faction === "crimson"
      && unit.position.z > initial.units.find((candidate) => candidate.id === unit.id)!.position.z
    ))).toBe(true);
  });

  it("keeps every initial unit on walkable terrain", () => {
    expect(createInitialBattle().units.every((unit) => (
      getBattlefieldCell(worldToAxial(unit.position))?.walkable
    ))).toBe(true);
  });

  it("lets a knight close to melee range before dealing damage", () => {
    const knight = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 5 },
    });
    const target = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: 1 },
    });
    const early = stepBattle(createBattleState([knight, target]), 0.1);

    expect(early.units.find((unit) => unit.id === target.id)?.health).toBe(target.health);
    expect(early.units.find((unit) => unit.id === knight.id)?.position.z).toBeLessThan(5);

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
    const state = runSteps(createBattleState([mage, primary, nearby, distant]), 10);

    expect(state.units.find((unit) => unit.id === primary.id)?.health).toBeLessThan(primary.health);
    expect(state.units.find((unit) => unit.id === nearby.id)?.health).toBeLessThan(nearby.health);
    expect(state.units.find((unit) => unit.id === distant.id)?.health).toBe(distant.health);
    expect(UNIT_SPECS.mage.splashRadius).toBeGreaterThan(0);
  });

  it("does not resolve on army elimination and draws at three minutes", () => {
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

    const drawn = stepBattle({ ...active, matchElapsed: 179.95 }, 0.1);
    expect(drawn.winner).toBe("draw");
    expect(drawn.resolvedAt).toBe(drawn.elapsed);
  });
});
