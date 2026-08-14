import { describe, expect, it } from "vitest";

import { assignMeleeEngagementSlots } from "../../src/game/engagements";
import { createBattleUnit } from "../../src/game/battle";
import { getBattlefieldCell, worldToAxial } from "../../src/map/battlefield";

describe("melee engagement slots", () => {
  it("never assigns the same target slot to two attackers", () => {
    const target = createBattleUnit({
      id: "c-front",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const attackers = [
      createBattleUnit({
        id: "v-left",
        faction: "verdant",
        role: "knight",
        position: { x: -2, z: 1 },
      }),
      createBattleUnit({
        id: "v-right",
        faction: "verdant",
        role: "knight",
        position: { x: 2, z: 1 },
      }),
    ];

    const slots = assignMeleeEngagementSlots(
      attackers.map((attacker) => ({ attacker, target })),
    );

    expect(slots).toHaveLength(2);
    expect(new Set(slots.map((slot) => `${slot.targetId}:${slot.index}`)).size).toBe(2);
    expect(new Set(slots.map((slot) => `${slot.position.x}:${slot.position.z}`)).size).toBe(2);
  });

  it("does not assign a melee slot on blocked terrain", () => {
    const target = createBattleUnit({
      id: "c-water-edge",
      faction: "crimson",
      role: "knight",
      position: { x: 4, z: 0 },
    });
    const attacker = createBattleUnit({
      id: "v-east",
      faction: "verdant",
      role: "knight",
      position: { x: 8, z: 0 },
    });

    const slots = assignMeleeEngagementSlots(
      [{ attacker, target }],
      (position) => Boolean(getBattlefieldCell(worldToAxial(position))?.walkable),
    );

    expect(slots).toHaveLength(1);
    expect(getBattlefieldCell(worldToAxial(slots[0]!.position))?.walkable).toBe(true);
  });
});
