import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
} from "../../src/game/battle";
import {
  applyPlannedCommands,
  queuePlannedCommand,
  type PlannedCommand,
} from "../../src/game/battlePlans";

describe("pre-battle command planning", () => {
  it("keeps planned commands separate from the frozen battle state", () => {
    const initial = createBattleState([
      createBattleUnit({ id: "v-1", faction: "verdant", role: "knight", position: { x: 0, z: 0 } }),
      createBattleUnit({ id: "c-1", faction: "crimson", role: "knight", position: { x: 4, z: 0 } }),
    ]);

    const plans = queuePlannedCommand([], {
      kind: "attack",
      unitIds: ["v-1"],
      targetId: "c-1",
    });

    expect(initial.units[0]?.order).toEqual({ type: "idle" });
    expect(initial.units[0]?.status).toBe("idle");
    expect(plans).toEqual([{
      kind: "attack",
      unitIds: ["v-1"],
      targetId: "c-1",
    }]);
  });

  it("replaces only the reassigned units when a new plan overlaps an old one", () => {
    const first: PlannedCommand = {
      kind: "attack",
      unitIds: ["v-1", "v-2"],
      targetId: "c-1",
    };

    const plans = queuePlannedCommand([first], {
      kind: "attack-move",
      unitIds: ["v-2"],
      destination: { x: 8, z: -3 },
    });

    expect(plans).toEqual([
      { kind: "attack", unitIds: ["v-1"], targetId: "c-1" },
      { kind: "attack-move", unitIds: ["v-2"], destination: { x: 8, z: -3 } },
    ]);
  });

  it("applies every queued plan when engagement begins", () => {
    const first = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const second = createBattleUnit({
      id: "v-2",
      faction: "verdant",
      role: "ranger",
      position: { x: 1, z: 0 },
    });
    const enemy = createBattleUnit({
      id: "c-1",
      faction: "crimson",
      role: "knight",
      position: { x: 8, z: -3 },
    });
    const initial = createBattleState([first, second, enemy]);

    const engaged = applyPlannedCommands(initial, [
      { kind: "attack", unitIds: [first.id], targetId: enemy.id },
      { kind: "attack-move", unitIds: [second.id], destination: { x: 7, z: -2 } },
    ]);

    expect(engaged.units.find((unit) => unit.id === first.id)?.order).toEqual({
      type: "attack",
      targetId: enemy.id,
    });
    expect(engaged.units.find((unit) => unit.id === second.id)?.order).toMatchObject({
      type: "attack-move",
      destination: expect.any(Object),
    });
    expect(initial.units.every((unit) => unit.order.type === "idle")).toBe(true);
  });
});
