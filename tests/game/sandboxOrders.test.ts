import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import {
  issueSandboxSquadOrder,
  sandboxSquadOrderFor,
} from "../../src/game/sandboxOrders";
import { axialToWorld } from "../../src/map/battlefield";

describe("sandbox independent unit orders", () => {
  it("issues distinct deterministic formation destinations and permits retreat", () => {
    const battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 }),
      unit("bravo-1", "bravo", "verdant", { q: -4, r: 10 }),
    ]);
    const retreat = axialToWorld({ q: -7, r: 14 });
    const result = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["bravo-1", "alpha-1"],
      kind: "move",
      destination: retreat,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orders.map((order) => order.squadId)).toEqual(["alpha-1", "bravo-1"]);
    expect(new Set(result.orders.map((order) => (
      `${order.destination!.x},${order.destination!.z}`
    ))).size).toBe(2);
    expect(result.battle.units.every((candidate) => candidate.status === "moving")).toBe(true);
    expect(result.battle.units.every((candidate) => candidate.waypoints.length > 0)).toBe(true);

    const advanced = advanceSeconds(result.battle, 2);
    expect(advanced.units.every((candidate, index) => (
      candidate.position.z > result.battle.units[index]!.position.z
    ))).toBe(true);
  });

  it("keeps multiple selected units on independent formation destinations", () => {
    const battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -7, r: 14 }),
      unit("alpha-2", "alpha", "verdant", { q: -6, r: 14 }),
    ]);
    const result = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1", "alpha-2"],
      kind: "move",
      destination: axialToWorld({ q: 0, r: 0 }),
    });
    if (!result.ok) throw new Error(result.reason);
    expect(new Set(result.battle.units.map((candidate) => (
      `${candidate.formationSlot.x},${candidate.formationSlot.z}`
    ))).size).toBe(2);
    const advanced = advanceSeconds(result.battle, 10);
    expect(advanced.units.every((candidate, index) => (
      distance(candidate.position, result.battle.units[index]!.position) > 5
    ))).toBe(true);
  });

  it("rejects invalid selections, destinations, and friendly targets atomically", () => {
    const battle = sandboxBattle([
      unit("friendly", "alpha", "verdant", { q: -5, r: 10 }),
      unit("enemy", "omega", "crimson", { q: -3, r: 8 }),
    ]);
    const enemySelection = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["enemy"],
      kind: "stop",
    });
    expect(enemySelection).toMatchObject({ ok: false, reason: "faction-mismatch" });
    expect(enemySelection.battle).toBe(battle);

    const outside = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["friendly"],
      kind: "move",
      destination: { x: 999, z: 999 },
    });
    expect(outside).toMatchObject({ ok: false, reason: "invalid-destination" });
    expect(outside.battle).toBe(battle);

    const friendlyAttack = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["friendly"],
      kind: "attack",
      target: { targetType: "unit", targetId: "friendly" },
    });
    expect(friendlyAttack).toMatchObject({ ok: false, reason: "friendly-target" });
    expect(friendlyAttack.battle).toBe(battle);
  });

  it("stops immediately and holds the captured anchor", () => {
    let battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -7, r: 14 }),
    ]);
    const move = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "move",
      destination: axialToWorld({ q: -5, r: 10 }),
    });
    if (!move.ok) throw new Error(move.reason);
    battle = advanceSeconds(move.battle, 1);
    const stop = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "stop",
    });
    if (!stop.ok) throw new Error(stop.reason);
    const stoppedAt = stop.battle.units[0]!.position;
    battle = advanceSeconds(stop.battle, 2);
    expect(distance(battle.units[0]!.position, stoppedAt)).toBeLessThan(1e-9);
    expect(battle.units[0]).toMatchObject({ status: "idle", waypoints: [] });

    const hold = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "hold",
    });
    if (!hold.ok) throw new Error(hold.reason);
    expect(hold.orders[0]!.holdPosition).toEqual(stoppedAt);
  });

  it("does not leave a hold anchor to chase an enemy outside its leash", () => {
    let battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 }),
      unit("enemy-1", "omega", "crimson", { q: -2, r: 7 }),
    ]);
    const hold = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "hold",
    });
    if (!hold.ok) throw new Error(hold.reason);
    const anchor = hold.battle.units[0]!.position;
    battle = advanceSeconds(hold.battle, 3);
    expect(distance(battle.units[0]!.position, anchor)).toBeLessThan(1e-9);
    expect(battle.units[0]!.currentTarget).toBeNull();
  });

  it("executes explicit attacks and preserves attack-move after a local fight", () => {
    let battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 }),
      {
        ...unit("enemy-1", "omega", "crimson", { q: -4, r: 9 }),
        health: 1,
      },
    ]);
    const attack = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "attack",
      target: { targetType: "unit", targetId: "enemy-1" },
    });
    if (!attack.ok) throw new Error(attack.reason);
    battle = advanceSeconds(attack.battle, 2);
    expect(battle.units.find((candidate) => candidate.id === "enemy-1")?.health).toBe(0);
    expect(battle.units.find((candidate) => candidate.id === "alpha-1")?.status).toBe("idle");

    battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 }),
      {
        ...unit("enemy-1", "omega", "crimson", { q: -4, r: 9 }),
        health: 1,
      },
    ]);
    const attackMove = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "attack-move",
      destination: axialToWorld({ q: 0, r: 0 }),
    });
    if (!attackMove.ok) throw new Error(attackMove.reason);
    battle = advanceSeconds(attackMove.battle, 4);
    const alpha = battle.units.find((candidate) => candidate.id === "alpha-1")!;
    expect(battle.units.find((candidate) => candidate.id === "enemy-1")?.health).toBe(0);
    expect(alpha.position.z).toBeLessThan(attackMove.battle.units[0]!.position.z);
    expect(sandboxSquadOrderFor(battle.squadOrders!, "alpha-1")?.kind).toBe("attack-move");
  });

  it("automatically attacks enemies already inside attack range without an order", () => {
    const attacker = unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 });
    const defender = {
      ...unit("enemy-1", "omega", "crimson", { q: -5, r: 10 }),
      position: { x: attacker.position.x + 1.4, z: attacker.position.z },
    };
    const battle = sandboxBattle([
      attacker,
      defender,
    ]);

    const advanced = advanceSeconds(battle, 1.5);
    const alpha = advanced.units.find((candidate) => candidate.id === "alpha-1")!;
    const enemy = advanced.units.find((candidate) => candidate.id === "enemy-1")!;
    expect(alpha.currentTarget).toEqual({ targetType: "unit", targetId: "enemy-1" });
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
  });

  it("leaves new sandbox units idle without input while legacy units still charge", () => {
    const sandbox = advanceSeconds(sandboxBattle([
      unit("sandbox-idle", "alpha", "verdant", { q: -7, r: 14 }),
    ]), 60);
    expect(sandbox.units[0]).toMatchObject({
      position: axialToWorld({ q: -7, r: 14 }),
      status: "idle",
    });

    const legacyStart = createBattleState([
      createBattleUnit({
        id: "legacy-charge",
        faction: "verdant",
        role: "spearman",
        position: axialToWorld({ q: -4, r: 8 }),
      }),
    ]);
    const legacy = advanceSeconds(legacyStart, 1);
    expect(distance(legacy.units[0]!.position, legacyStart.units[0]!.position)).toBeGreaterThan(0);
  });

  it("accepts enemy building targets, survives JSON restore, and reissues after attrition", () => {
    let battle = sandboxBattle([
      unit("alpha-1", "alpha", "verdant", { q: -5, r: 10 }),
      {
        ...unit("alpha-2", "alpha", "verdant", { q: -4, r: 10 }),
        health: 0,
        status: "dead" as const,
        diedAt: 0,
      },
    ]);
    const enemyCastle = battle.buildings.find((building) => (
      building.kind === "castle" && building.faction === "crimson"
    ))!;
    const attack = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "attack",
      target: { targetType: "building", targetId: enemyCastle.id },
    });
    expect(attack.ok).toBe(true);
    if (!attack.ok) return;
    expect(attack.orders[0]?.target).toEqual({
      targetType: "building",
      targetId: enemyCastle.id,
    });

    battle = JSON.parse(JSON.stringify(attack.battle)) as BattleState;
    expect(sandboxSquadOrderFor(battle.squadOrders!, "alpha-1")).toMatchObject({
      kind: "attack",
      target: { targetType: "building", targetId: enemyCastle.id },
    });
    const retreat = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["alpha-1"],
      kind: "move",
      destination: axialToWorld({ q: -7, r: 14 }),
    });
    expect(retreat.ok).toBe(true);
  });

  it("stores reserved-key unit ids as own serializable entries", () => {
    const battle = sandboxBattle([
      unit("__proto__", "legacy-shared", "verdant", { q: -7, r: 14 }),
    ]);
    const result = issueSandboxSquadOrder(battle, {
      faction: "verdant",
      squadIds: ["__proto__"],
      kind: "stop",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.battle.squadOrders!.ordersBySquadId, "__proto__"))
      .toBe(true);
    expect(sandboxSquadOrderFor(result.battle.squadOrders!, "__proto__")?.kind)
      .toBe("stop");
  });
});

function sandboxBattle(units: BattleState["units"]): BattleState {
  return createBattleState(units, { modeId: "sandbox" });
}

function unit(
  id: string,
  _legacySquadId: string,
  faction: "verdant" | "crimson",
  coordinate: { readonly q: number; readonly r: number },
) {
  return createBattleUnit({
    id,
    squadId: _legacySquadId,
    faction,
    role: "spearman",
    position: axialToWorld(coordinate),
  });
}

function advanceSeconds(battle: BattleState, seconds: number): BattleState {
  let next = battle;
  for (let index = 0; index < Math.round(seconds / 0.1); index += 1) {
    next = stepBattle(next, 0.1);
  }
  return next;
}

function distance(
  first: { readonly x: number; readonly z: number },
  second: { readonly x: number; readonly z: number },
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
