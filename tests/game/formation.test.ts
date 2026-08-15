import { describe, expect, it } from "vitest";

import { forwardProgress } from "../../src/game/autoCombat";
import { createBattleState, createBattleUnit, stepBattle } from "../../src/game/battle";
import { createFormationSlots, separateLivingAllies } from "../../src/game/formation";

describe("automatic formations", () => {
  it("creates a unique, spaced slot for every member", () => {
    const slots = createFormationSlots(40, { x: 3, z: -2 }, Math.PI / 3, 0.78);
    const keys = slots.map((slot) => `${slot.x.toFixed(4)},${slot.z.toFixed(4)}`);
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let first = 0; first < slots.length; first += 1) {
      for (let second = first + 1; second < slots.length; second += 1) {
        minimumDistance = Math.min(minimumDistance, Math.hypot(
          slots[first]!.x - slots[second]!.x,
          slots[first]!.z - slots[second]!.z,
        ));
      }
    }

    expect(slots).toHaveLength(40);
    expect(new Set(keys).size).toBe(40);
    expect(minimumDistance).toBeGreaterThanOrEqual(0.77);
  });

  it("deterministically separates overlapping living allies", () => {
    const first = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 4 },
    });
    const second = createBattleUnit({
      id: "v-2", faction: "verdant", role: "knight", position: { x: 0, z: 4 },
    });

    const separated = separateLivingAllies([first, second]);
    expect(Math.hypot(
      separated[0]!.position.x - separated[1]!.position.x,
      separated[0]!.position.z - separated[1]!.position.z,
    )).toBeGreaterThan(0);
    expect(separateLivingAllies([first, second])).toEqual(separated);
  });

  it("never lets collision separation move an automatic unit backwards", () => {
    const first = createBattleUnit({
      id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 5 },
    });
    const second = createBattleUnit({
      id: "v-2", faction: "verdant", role: "knight", position: { x: 0, z: 5 },
    });
    const enemy = createBattleUnit({
      id: "c-1", faction: "crimson", role: "knight", position: { x: 0, z: -5 },
    });
    const next = stepBattle(createBattleState([first, second, enemy]), 0.1);

    for (const unit of next.units.filter((candidate) => candidate.faction === "verdant")) {
      const origin = unit.id === first.id ? first.position : second.position;
      expect(forwardProgress("verdant", origin, unit.position)).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});
