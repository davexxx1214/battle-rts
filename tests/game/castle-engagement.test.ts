import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
} from "../../src/game/battle";
import { createFormationSlots } from "../../src/game/formation";
import { axialToWorld } from "../../src/map/battlefield";

describe("castle melee engagement", () => {
  it("lets all three swordsmen engage the castle before any attacker is defeated", () => {
    const center = axialToWorld({ q: 3, r: -6 });
    const attackers = createFormationSlots(3, center, Math.PI).map((position, index) => (
      createBattleUnit({
        id: `verdant-swordsman-${index + 1}`,
        squadId: "verdant-swordsmen",
        faction: "verdant",
        role: "knight",
        position,
      })
    ));
    let state = createBattleState(attackers);
    state = {
      ...state,
      buildings: state.buildings.filter((building) => building.kind === "castle"),
    };

    for (let step = 0; step < 50; step += 1) state = stepBattle(state, 0.05);

    const castleAttackers = new Set(state.events.flatMap((event) => (
      event.type === "attack-started"
        && event.targetId === "crimson-castle"
        && event.attackerId.startsWith("verdant-swordsman-")
        ? [event.attackerId]
        : []
    )));
    expect(castleAttackers).toEqual(new Set(attackers.map((unit) => unit.id)));
    expect(state.units.filter((unit) => unit.faction === "verdant").every((unit) => (
      unit.behavior === "castle-locked"
    ))).toBe(true);
  });
});
