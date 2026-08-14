import { describe, expect, it } from "vitest";

import {
  createInitialBattle,
  createBattleState,
  createBattleUnit,
  issueAttackMoveCommand,
  issueHoldCommand,
  issueMoveCommand,
  issueStopCommand,
  stepBattle,
} from "../../src/game/battle";
import { createFormationSlots, separateLivingAllies } from "../../src/game/formation";
import { axialToWorld, getBattlefieldCell, worldToAxial } from "../../src/map/battlefield";

describe("squad formations", () => {
  it("creates a unique, spaced slot for every member", () => {
    const slots = createFormationSlots(40, { x: 3, z: -2 }, Math.PI / 3, 0.78);
    const keys = slots.map((slot) => `${slot.x.toFixed(4)},${slot.z.toFixed(4)}`);
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let first = 0; first < slots.length; first += 1) {
      for (let second = first + 1; second < slots.length; second += 1) {
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(slots[first]!.x - slots[second]!.x, slots[first]!.z - slots[second]!.z),
        );
      }
    }

    expect(slots).toHaveLength(40);
    expect(new Set(keys).size).toBe(40);
    expect(minimumDistance).toBeGreaterThanOrEqual(0.77);
  });

  it("keeps unit slots stable when the same army command is repeated", () => {
    const initial = createInitialBattle();
    const friendlyIds = initial.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.id);
    const destination = { x: 0, z: 2.5 };
    const first = issueMoveCommand(initial, friendlyIds, destination);
    const second = issueMoveCommand(first, friendlyIds, destination);
    const firstSlots = new Map(first.units.map((unit) => [unit.id, unit.formationSlot]));

    expect(first.units.filter((unit) => friendlyIds.includes(unit.id))).toHaveLength(41);
    for (const unit of second.units.filter((candidate) => friendlyIds.includes(candidate.id))) {
      expect(unit.formationSlot).toEqual(firstSlots.get(unit.id));
      expect(unit.waypoints.length).toBeGreaterThan(0);
    }
  });

  it("stops selected units and clears their navigation path", () => {
    const initial = createInitialBattle();
    const selectedIds = initial.units
      .filter((unit) => unit.faction === "verdant")
      .slice(0, 5)
      .map((unit) => unit.id);
    const moving = issueMoveCommand(initial, selectedIds, { x: 0, z: 0 });
    const stopped = issueStopCommand(moving, selectedIds);

    for (const unit of stopped.units.filter((candidate) => selectedIds.includes(candidate.id))) {
      expect(unit.order).toEqual({ type: "idle" });
      expect(unit.waypoints).toEqual([]);
      expect(unit.status).toBe("idle");
    }
  });

  it("attack-moves toward a destination while hold units never chase", () => {
    const attacker = createBattleUnit({
      id: "v-attacker",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 5 },
    });
    const holder = createBattleUnit({
      id: "v-holder",
      faction: "verdant",
      role: "knight",
      position: { x: 2, z: 5 },
    });
    const enemy = createBattleUnit({
      id: "c-target",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -2 },
    });
    const initial = createBattleState([attacker, holder, enemy]);
    const commanded = issueHoldCommand(
      issueAttackMoveCommand(initial, [attacker.id], { x: 0, z: 0 }),
      [holder.id],
    );
    const next = stepBattle(commanded, 0.1);

    expect(next.units.find((unit) => unit.id === attacker.id)?.position.z).toBeLessThan(5);
    expect(next.units.find((unit) => unit.id === holder.id)?.position).toEqual(holder.position);
    expect(next.units.find((unit) => unit.id === holder.id)?.order.type).toBe("hold");
  });

  it("deterministically separates overlapping living allies", () => {
    const first = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 0 },
    });
    const second = createBattleUnit({
      id: "v-2",
      faction: "verdant",
      role: "knight",
      position: { x: 0, z: 0 },
    });

    const separated = separateLivingAllies([first, second]);
    const distance = Math.hypot(
      separated[0]!.position.x - separated[1]!.position.x,
      separated[0]!.position.z - separated[1]!.position.z,
    );

    expect(distance).toBeGreaterThan(0);
    expect(separateLivingAllies([first, second])).toEqual(separated);
  });

  it("clamps a blocked water destination to the actual walkable path endpoint", () => {
    const unit = createBattleUnit({
      id: "v-1",
      faction: "verdant",
      role: "knight",
      position: axialToWorld({ q: 0, r: 0 }),
    });
    const destination = axialToWorld({ q: 4, r: 0 });
    const commanded = issueMoveCommand(createBattleState([unit]), [unit.id], destination);
    const order = commanded.units[0]!.order;

    expect(order.type).toBe("move");
    if (order.type !== "move") return;
    expect(order.destination).not.toEqual(destination);
    expect(getBattlefieldCell(worldToAxial(order.destination))?.walkable).toBe(true);
  });
});
