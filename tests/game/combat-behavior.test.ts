import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { UNIT_SPECS } from "../../src/game/rules";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  getBattlefieldCell,
  worldToAxial,
} from "../../src/map/battlefield";

function runSteps(initial: BattleState, count: number, delta = 0.1): BattleState {
  let state = initial;
  for (let index = 0; index < count; index += 1) state = stepBattle(state, delta);
  return state;
}

describe("automatic combat role behavior", () => {
  it("fires a slow catapult stone that damages nearby enemies", () => {
    const catapult = createBattleUnit({
      id: "v-catapult", faction: "verdant", role: "catapult",
      position: axialToWorld({ q: 2, r: 2 }),
    });
    const target = createBattleUnit({
      id: "c-target", faction: "crimson", role: "knight",
      position: axialToWorld({ q: 2, r: 0 }),
    });
    const nearby = createBattleUnit({
      id: "c-nearby", faction: "crimson", role: "ranger",
      position: axialToWorld({ q: 2, r: -1 }),
    });
    const fired = stepBattle(createBattleState([catapult, target, nearby]), 0.1);

    expect(fired.projectiles).toMatchObject([{
      role: "catapult",
      splashRadius: UNIT_SPECS.catapult.splashRadius,
    }]);
    const impacted = runSteps(fired, 18);
    expect(impacted.units.find((unit) => unit.id === target.id)?.health).toBeLessThan(target.health);
    expect(impacted.units.find((unit) => unit.id === nearby.id)?.health).toBeLessThan(nearby.health);
  });

  it("assigns persistent unique melee engagement slots", () => {
    const attackers = [
      createBattleUnit({
        id: "v-1", faction: "verdant", role: "knight", position: { x: -6.8, z: 6.4 },
      }),
      createBattleUnit({
        id: "v-2", faction: "verdant", role: "knight", position: { x: -5.2, z: 6.4 },
      }),
    ];
    const target = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: axialToWorld({ q: -4, r: 2 }),
    });
    const first = stepBattle(createBattleState([...attackers, target]), 0.1);
    const second = stepBattle(first, 0.1);
    const firstSlots = first.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.engagementSlot);
    const secondSlots = second.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.engagementSlot);

    expect(firstSlots.every(Boolean)).toBe(true);
    expect(new Set(firstSlots.map((slot) => `${slot?.targetId}:${slot?.index}`)).size).toBe(2);
    expect(secondSlots.map((slot) => slot?.index)).toEqual(firstSlots.map((slot) => slot?.index));
  });

  it("keeps a melee unit planted while its target is in range", () => {
    const attacker = createBattleUnit({
      id: "v-attacker", faction: "verdant", role: "knight", position: { x: 0, z: 1 },
    });
    const target = createBattleUnit({
      id: "c-target", faction: "crimson", role: "knight", position: { x: 0, z: 0 },
    });
    const next = stepBattle(createBattleState([attacker, target]), 0.05);
    const advanced = next.units.find((unit) => unit.id === attacker.id)!;

    expect(advanced.position).toEqual(attacker.position);
    expect(advanced.status).toBe("attacking");
  });

  it("resumes charging after an ordinary path target dies", () => {
    const attacker = createBattleUnit({
      id: "v-attacker", faction: "verdant", role: "knight", position: { x: -6, z: 3.4 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-target", faction: "crimson", role: "knight", position: { x: -6, z: 2.4 },
      }),
      health: 1,
    };
    const defeated = stepBattle(createBattleState([attacker, target]), 0.1);
    const afterAttack = defeated.units.find((unit) => unit.id === attacker.id)!;
    expect(defeated.units.find((unit) => unit.id === target.id)?.health).toBe(0);

    const resumed = stepBattle(defeated, 0.1);
    const advanced = resumed.units.find((unit) => unit.id === attacker.id)!;
    expect(advanced.behavior).toBe("charging");
    expect(advanced.position.z).toBeLessThan(afterAttack.position.z);
  });

  it("uses walkable navigation while charging toward the enemy castle", () => {
    const mover = createBattleUnit({
      id: "v-mover",
      faction: "verdant",
      role: "ranger",
      position: axialToWorld(BATTLEFIELD_MAP.verdantCamp),
    });
    let state = createBattleState([mover]);
    const visited = [mover.position];

    for (let index = 0; index < 200; index += 1) {
      state = stepBattle(state, 0.05);
      visited.push(state.units[0]!.position);
    }

    expect(visited.find((point) => (
      !getBattlefieldCell(worldToAxial(point))?.walkable
    ))).toBeUndefined();
    expect(state.units[0]!.position.z).toBeLessThan(mover.position.z);
    expect(Number.isFinite(state.units[0]!.position.x)).toBe(true);
  });

  it("keeps surviving units active after their army is mostly eliminated", () => {
    const squad = Array.from({ length: 10 }, (_, index) => {
      const unit = createBattleUnit({
        id: `v-${index}`,
        squadId: "verdant-test-squad",
        faction: "verdant",
        role: "knight",
        position: { x: index * 0.1, z: 5 },
      });
      return index < 3 ? unit : { ...unit, health: 0, status: "dead" as const };
    });
    const enemy = createBattleUnit({
      id: "c-survivor", faction: "crimson", role: "ranger", position: { x: 0, z: -5 },
    });
    const next = stepBattle(createBattleState([...squad, enemy]), 0.1);
    const survivors = next.units.filter((unit) => (
      unit.squadId === "verdant-test-squad" && unit.health > 0
    ));

    expect(survivors.every((unit) => unit.status !== "dead")).toBe(true);
    expect(next.winner).toBeNull();
  });

  it("freezes eight seconds after the three-minute draw", () => {
    const unit = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 5 },
    });
    const drawn = stepBattle({
      ...createBattleState([unit]),
      matchElapsed: 179.95,
    }, 0.1);
    const resolvedAt = drawn.resolvedAt!;
    const frozen = runSteps(drawn, 100);

    expect(frozen.elapsed).toBeCloseTo(resolvedAt + 8);
    expect(stepBattle(frozen, 0.05)).toBe(frozen);
  });
});
