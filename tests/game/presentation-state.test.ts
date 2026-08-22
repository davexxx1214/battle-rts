import { describe, expect, it } from "vitest";

import {
  BATTLE_CORPSE_RETENTION_SECONDS,
  UNIT_SPECS,
  appendUnitsToSquads,
  createBattleState,
  createBattleUnit,
  stepBattle,
} from "../../src/game/battle";

describe("authoritative presentation state", () => {
  it("puts the simulated splash radius on the mage impact event", () => {
    const mage = createBattleUnit({
      id: "v-mage",
      faction: "verdant",
      role: "mage",
      position: { x: 0, z: 5 },
    });
    const target = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    let state = createBattleState([mage, target]);

    for (let index = 0; index < 12; index += 1) state = stepBattle(state, 0.1);
    const impact = state.events.find((event) => (
      event.type === "projectile-hit" && event.role === "mage"
    ));

    expect(impact).toMatchObject({ splashRadius: UNIT_SPECS.mage.splashRadius });
  });

  it("stores immutable source and target presentation data on damage events", () => {
    const attacker = createBattleUnit({
      id: "v-knight",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 1 },
    });
    const target = createBattleUnit({
      id: "c-knight",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    let state = createBattleState([attacker, target]);

    for (let index = 0; index < 10; index += 1) {
      state = stepBattle(state, 0.1);
      if (state.events.some((event) => event.type === "damage-applied")) break;
    }
    const damage = state.events.find((event) => event.type === "damage-applied");
    const attack = state.events.find((event) => event.type === "attack-started");

    expect(attack && "origin" in attack).toBe(true);
    expect(attack && "targetPosition" in attack).toBe(true);
    expect(damage).toMatchObject({
      sourceId: attacker.id,
      sourceRole: "knight",
      targetId: target.id,
    });
    expect(damage && "sourcePosition" in damage).toBe(true);
    expect(damage && "targetPosition" in damage).toBe(true);
  });

  it("records a stable death time so corpses can remain for six seconds", () => {
    const attacker = createBattleUnit({
      id: "v-knight",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 1 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-target",
        faction: "crimson",
        role: "knight",
        position: { x: 0, z: 0 },
      }),
      health: 1,
    };
    let state = createBattleState([attacker, target]);

    for (let index = 0; index < 20; index += 1) state = stepBattle(state, 0.1);
    const diedAt = state.units.find((unit) => unit.id === target.id)?.diedAt;
    for (let index = 0; index < 10; index += 1) state = stepBattle(state, 0.1);

    expect(diedAt).toBeTypeOf("number");
    expect(state.units.find((unit) => unit.id === target.id)?.diedAt).toBe(diedAt);
  });

  it("removes expired corpses and their control-group references after presentation", () => {
    const survivor = createBattleUnit({
      id: "v-survivor",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 8 },
    });
    const corpse = {
      ...createBattleUnit({
        id: "c-expired-corpse",
        faction: "crimson",
        role: "spearman",
        position: { x: 0, z: 0 },
      }),
      health: 0,
      status: "dead" as const,
      diedAt: 0,
    };
    let state = createBattleState([survivor, corpse]);
    state = {
      ...state,
      elapsed: BATTLE_CORPSE_RETENTION_SECONDS - 0.15,
      matchElapsed: BATTLE_CORPSE_RETENTION_SECONDS - 0.15,
    };

    state = stepBattle(state, 0.1);
    expect(state.units.some((unit) => unit.id === corpse.id)).toBe(true);

    state = stepBattle(state, 0.1);
    expect(state.units.some((unit) => unit.id === corpse.id)).toBe(false);
    expect(state.squads.some((squad) => squad.memberIds.includes(corpse.id))).toBe(false);
  });

  it("keeps combat collections bounded while expired units churn through a long sandbox match", () => {
    const survivor = createBattleUnit({
      id: "v-long-session-survivor",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 20 },
    });
    let state = createBattleState([survivor], { modeId: "sandbox" });

    for (let sequence = 0; sequence < 120; sequence += 1) {
      const corpse = {
        ...createBattleUnit({
          id: `expired-${sequence}`,
          faction: "crimson",
          role: "spearman",
          position: { x: 0, z: 0 },
        }),
        health: 0,
        status: "dead" as const,
        diedAt: state.elapsed - BATTLE_CORPSE_RETENTION_SECONDS,
      };
      state = {
        ...state,
        units: [...state.units, corpse],
        squads: appendUnitsToSquads(state.squads, [corpse]),
      };
      state = stepBattle(state, 0.1);
      expect(state.units).toHaveLength(1);
      expect(state.squads).toHaveLength(1);
    }

    expect(state.elapsed).toBeCloseTo(12);
    expect(state.winner).toBeNull();
  });
});
