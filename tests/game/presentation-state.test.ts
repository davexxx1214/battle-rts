import { describe, expect, it } from "vitest";

import {
  UNIT_SPECS,
  createBattleState,
  createBattleUnit,
  issueAttackCommand,
  issueHoldCommand,
  stepBattle,
} from "../../src/game/battle";

describe("authoritative presentation state", () => {
  it("puts the simulated splash radius on the mage impact event", () => {
    const mage = createBattleUnit({
      id: "v-mage",
      faction: "verdant",
      role: "mage",
      position: { x: 0, z: 0 },
    });
    const target = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 5 },
    });
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([mage, target]), [target.id]),
      [mage.id],
      target.id,
    );

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
      position: { x: 0, z: 0 },
    });
    const target = createBattleUnit({
      id: "c-knight",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 1 },
    });
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([attacker, target]), [target.id]),
      [attacker.id],
      target.id,
    );

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
      position: { x: 0, z: 0 },
    });
    const target = {
      ...createBattleUnit({
        id: "c-target",
        faction: "crimson",
        role: "knight",
        position: { x: 0, z: 1 },
      }),
      health: 1,
    };
    let state = issueAttackCommand(
      issueHoldCommand(createBattleState([attacker, target]), [target.id]),
      [attacker.id],
      target.id,
    );

    for (let index = 0; index < 20 && !state.winner; index += 1) state = stepBattle(state, 0.1);
    const diedAt = state.units.find((unit) => unit.id === target.id)?.diedAt;
    for (let index = 0; index < 10; index += 1) state = stepBattle(state, 0.1);

    expect(diedAt).toBeTypeOf("number");
    expect(state.units.find((unit) => unit.id === target.id)?.diedAt).toBe(diedAt);
  });
});
