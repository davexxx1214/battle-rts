import { describe, expect, it } from "vitest";

import { SANDBOX_ECONOMY_POLICY } from "../../src/game/battleMode";
import { createEconomyState, trySpendGold } from "../../src/game/economy";
import {
  SANDBOX_TROOP_SLOTS,
  sandboxTroopSpec,
  type SandboxTroopSlot,
} from "../../src/game/sandboxCatalog";
import {
  advanceSandboxProduction,
  createSandboxProductionState,
  destroySandboxProductionBuilding,
  enqueueSandboxProduction,
  isSandboxTroopSlot,
  registerSandboxProductionBuilding,
  sandboxProductionPopulation,
  sandboxProductionQueueFor,
  setSandboxProductionRallyPoint,
  SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH,
  SANDBOX_PRODUCTION_POPULATION_CAP,
  type SandboxProductionBuildingSlot,
  type SandboxProductionState,
} from "../../src/game/sandboxProductionQueue";
import type { EconomyState } from "../../src/game/economy";
import type { Faction } from "../../src/game/types";

const NO_LIVING_POPULATION = Object.freeze({ verdant: 0, crimson: 0 });

function stateWithBuilding(
  producer: SandboxProductionBuildingSlot = "barracks",
  buildingId = "producer-1",
  faction: Faction = "verdant",
): SandboxProductionState {
  return createSandboxProductionState([{ buildingId, faction, producer }]);
}

function enqueue(
  state: SandboxProductionState,
  economy: EconomyState,
  troopKind: SandboxTroopSlot,
  options: {
    readonly buildingId?: string;
    readonly faction?: Faction;
    readonly livingVerdant?: number;
    readonly livingCrimson?: number;
  } = {},
) {
  return enqueueSandboxProduction({
    state,
    economy,
    livingPopulationByFaction: {
      verdant: options.livingVerdant ?? 0,
      crimson: options.livingCrimson ?? 0,
    },
    request: {
      buildingId: options.buildingId ?? "producer-1",
      faction: options.faction ?? "verdant",
      troopKind,
    },
  });
}

describe("sandbox production queue", () => {
  it("derives the queue and population limits from the sandbox mode", () => {
    expect(SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH).toBe(3);
    expect(SANDBOX_PRODUCTION_POPULATION_CAP).toBe(100);
  });

  it("registers immutable, independent queues and rejects duplicate ids", () => {
    const state = createSandboxProductionState([
      { buildingId: "barracks-a", faction: "verdant", producer: "barracks" },
      { buildingId: "range-b", faction: "crimson", producer: "archery-range" },
    ]);

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.queuesByBuildingId)).toBe(true);
    expect(sandboxProductionQueueFor(state, "barracks-a")).toMatchObject({
      faction: "verdant",
      producer: "barracks",
      entries: [],
    });
    expect(sandboxProductionQueueFor(state, "range-b")).toMatchObject({
      faction: "crimson",
      producer: "archery-range",
      entries: [],
    });

    const duplicate = registerSandboxProductionBuilding(state, {
      buildingId: "barracks-a",
      faction: "crimson",
      producer: "barracks",
    });
    expect(duplicate).toMatchObject({
      registered: false,
      reason: "building-already-registered",
      state,
    });
  });

  it("trains in parallel across multiple buildings of the same type", () => {
    let state = createSandboxProductionState([
      { buildingId: "barracks-a", faction: "verdant", producer: "barracks" },
      { buildingId: "barracks-b", faction: "verdant", producer: "barracks" },
    ]);
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (const buildingId of ["barracks-a", "barracks-b"]) {
      const queued = enqueue(state, economy, "spearman", { buildingId });
      expect(queued.accepted).toBe(true);
      if (!queued.accepted) throw new Error("expected enqueue success");
      state = queued.state;
      economy = queued.economy;
    }

    const completed = advanceSandboxProduction(state, {
      elapsedSeconds: 0,
      deltaSeconds: sandboxTroopSpec("spearman").trainingSeconds,
    });

    expect(completed.spawns.map((spawn) => spawn.buildingId))
      .toEqual(["barracks-a", "barracks-b"]);
    expect(completed.spawns.every((spawn) => spawn.scheduledAtSeconds === 6)).toBe(true);
  });

  it("treats prototype-looking building ids as ordinary own keys", () => {
    let state = createSandboxProductionState();
    expect(sandboxProductionQueueFor(state, "toString")).toBeNull();
    expect(sandboxProductionQueueFor(state, "constructor")).toBeNull();
    expect(sandboxProductionQueueFor(state, "__proto__")).toBeNull();

    for (const buildingId of ["toString", "constructor", "__proto__"]) {
      const registered = registerSandboxProductionBuilding(state, {
        buildingId,
        faction: "verdant",
        producer: "barracks",
      });
      expect(registered.registered).toBe(true);
      if (!registered.registered) throw new Error("expected registration success");
      state = registered.state;
      expect(Object.hasOwn(state.queuesByBuildingId, buildingId)).toBe(true);
      expect(sandboxProductionQueueFor(state, buildingId)?.buildingId).toBe(buildingId);
    }

    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    const queued = enqueue(state, economy, "spearman", { buildingId: "__proto__" });
    expect(queued.accepted).toBe(true);
    if (!queued.accepted) throw new Error("expected enqueue success");
    state = queued.state;
    economy = queued.economy;
    expect(economy.accounts.verdant.gold).toBe(800);

    const destroyed = destroySandboxProductionBuilding(state, "__proto__");
    expect(destroyed.destroyed).toBe(true);
    expect(sandboxProductionQueueFor(destroyed.state, "__proto__")).toBeNull();
    expect(Object.getPrototypeOf(destroyed.state.queuesByBuildingId))
      .toBe(Object.prototype);
  });

  it("validates untrusted troop strings and snapshots a frozen rally point", () => {
    expect(isSandboxTroopSlot("mage")).toBe(true);
    expect(isSandboxTroopSlot("dragon" as string)).toBe(false);

    const initial = stateWithBuilding();
    const source = { q: 5, r: -2 };
    const set = setSandboxProductionRallyPoint(initial, "producer-1", source);
    expect(set).toMatchObject({ updated: true, reason: null, rallyPoint: { q: 5, r: -2 } });
    if (!set.updated) throw new Error("expected rally point update success");
    source.q = 99;
    expect(sandboxProductionQueueFor(set.state, "producer-1")?.rallyPoint)
      .toEqual({ q: 5, r: -2 });
    expect(Object.isFrozen(set.rallyPoint)).toBe(true);

    const queued = enqueue(
      set.state,
      createEconomyState(SANDBOX_ECONOMY_POLICY),
      "spearman",
    );
    if (!queued.accepted) throw new Error("expected enqueue success");
    const completed = advanceSandboxProduction(queued.state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
    });
    expect(completed.spawns[0].rallyPoint).toEqual({ q: 5, r: -2 });
    expect(Object.isFrozen(completed.spawns[0].rallyPoint)).toBe(true);

    const cleared = setSandboxProductionRallyPoint(
      completed.state,
      "producer-1",
      null,
    );
    expect(cleared).toMatchObject({ updated: true, rallyPoint: null });
    expect(sandboxProductionQueueFor(cleared.state, "producer-1")?.rallyPoint)
      .toBeNull();

    expect(setSandboxProductionRallyPoint(initial, "missing", { q: 0, r: 0 }))
      .toMatchObject({ updated: false, reason: "building-not-found", state: initial });
    expect(setSandboxProductionRallyPoint(initial, "producer-1", { q: NaN, r: 0 }))
      .toMatchObject({ updated: false, reason: "invalid-coordinate", state: initial });
  });

  it("deducts gold and reserves population exactly once when enqueued", () => {
    const state = stateWithBuilding();
    const economy = createEconomyState(SANDBOX_ECONOMY_POLICY);

    const result = enqueue(state, economy, "spearman");

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error("expected enqueue success");
    expect(result.economy.accounts.verdant.gold).toBe(800);
    expect(economy.accounts.verdant.gold).toBe(1_000);
    expect(result.entry).toMatchObject({
      troopKind: "spearman",
      status: "training",
      trainingProgressSeconds: 0,
    });
    expect(result.population).toEqual({
      reservedPopulation: 2,
      readyBlockedPopulation: 0,
      totalQueuePopulation: 2,
    });
    expect(Object.isFrozen(result.entry)).toBe(true);
  });

  it("enforces FIFO length three across active and queued orders", () => {
    let state = stateWithBuilding();
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (let index = 0; index < 3; index += 1) {
      const result = enqueue(state, economy, "spearman");
      expect(result.accepted).toBe(true);
      if (!result.accepted) throw new Error("expected enqueue success");
      state = result.state;
      economy = result.economy;
    }

    expect(sandboxProductionQueueFor(state, "producer-1")?.entries.map(
      (entry) => entry.status,
    )).toEqual(["training", "queued", "queued"]);
    expect(sandboxProductionPopulation(state, "verdant").reservedPopulation).toBe(6);

    const rejected = enqueue(state, economy, "spearman");
    expect(rejected).toMatchObject({
      accepted: false,
      reason: "queue-full",
      state,
      economy,
    });
  });

  it("returns stable failure reasons without mutating state or economy", () => {
    const state = stateWithBuilding();
    const economy = createEconomyState(SANDBOX_ECONOMY_POLICY);

    expect(enqueueSandboxProduction({
      state,
      economy,
      livingPopulationByFaction: NO_LIVING_POPULATION,
      request: { buildingId: "missing", faction: "verdant", troopKind: "spearman" },
    }).reason).toBe("building-not-found");
    expect(enqueue(state, economy, "spearman", { faction: "crimson" }).reason)
      .toBe("faction-mismatch");
    expect(enqueue(state, economy, "archer").reason).toBe("wrong-producer");
    expect(enqueue(state, economy, "spearman", { livingVerdant: -1 }).reason)
      .toBe("invalid-population");

    const nearlyEmpty = trySpendGold(
      economy,
      "verdant",
      900,
      SANDBOX_ECONOMY_POLICY,
    ).state;
    const insufficient = enqueue(state, nearlyEmpty, "spearman");
    expect(insufficient).toMatchObject({
      accepted: false,
      reason: "insufficient-gold",
      state,
      economy: nearlyEmpty,
    });
  });

  it.each([
    { living: 49, troop: "swordsman", expected: true },
    { living: 50, troop: "spearman", expected: true },
    { living: 79, troop: "archer", expected: true },
    { living: 98, troop: "mage", expected: true },
    { living: 98, troop: "catapult", expected: false },
    { living: 99, troop: "spearman", expected: false },
    { living: 100, troop: "spearman", expected: false },
  ] as const)(
    "applies the population cap at $living + $troop",
    ({ living, troop, expected }) => {
      const spec = sandboxTroopSpec(troop);
      const state = stateWithBuilding(spec.producer as SandboxProductionBuildingSlot);
      const economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
      const result = enqueue(state, economy, troop, { livingVerdant: living });

      expect(result.accepted).toBe(expected);
      expect(result.reason).toBe(expected ? null : "population-cap");
    },
  );

  it("counts existing reservations and ready-blocked orders in cap admission", () => {
    let state = stateWithBuilding();
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    const first = enqueue(state, economy, "spearman", { livingVerdant: 96 });
    if (!first.accepted) throw new Error("expected first enqueue success");
    state = first.state;
    economy = first.economy;

    const blocked = advanceSandboxProduction(state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
      isExitBlocked: () => true,
    });
    expect(blocked.populationAfter.verdant).toEqual({
      reservedPopulation: 0,
      readyBlockedPopulation: 2,
      totalQueuePopulation: 2,
    });

    const second = enqueue(blocked.state, economy, "spearman", {
      livingVerdant: 98,
    });
    expect(second).toMatchObject({ accepted: false, reason: "population-cap" });
  });

  it.each(SANDBOX_TROOP_SLOTS)(
    "completes %s at its exact catalog duration",
    (troopKind) => {
      const spec = sandboxTroopSpec(troopKind);
      const state = stateWithBuilding(spec.producer as SandboxProductionBuildingSlot);
      const economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
      const queued = enqueue(state, economy, troopKind);
      if (!queued.accepted) throw new Error("expected enqueue success");

      const almost = advanceSandboxProduction(queued.state, {
        elapsedSeconds: 0,
        deltaSeconds: spec.trainingSeconds - 0.001,
      });
      expect(almost.spawns).toHaveLength(0);
      expect(sandboxProductionQueueFor(almost.state, "producer-1")?.entries[0])
        .toMatchObject({ status: "training" });

      const exact = advanceSandboxProduction(almost.state, {
        elapsedSeconds: spec.trainingSeconds - 0.001,
        deltaSeconds: 0.001,
      });
      expect(exact.spawns).toHaveLength(1);
      expect(exact.spawns[0]).toMatchObject({
        troopKind,
        entityCount: spec.entityCount,
        populationCost: spec.populationCost,
      });
      expect(exact.spawns[0].scheduledAtSeconds).toBeCloseTo(spec.trainingSeconds, 8);
      expect(exact.spawns[0].unitIds).toHaveLength(spec.entityCount);
      expect(exact.populationBefore.verdant.reservedPopulation)
        .toBe(spec.populationCost);
      expect(exact.populationAfter.verdant.totalQueuePopulation).toBe(0);
    },
  );

  it("moves a completed blocked order from reserved to used-ready and retries it", () => {
    const initial = stateWithBuilding();
    const queued = enqueue(
      initial,
      createEconomyState(SANDBOX_ECONOMY_POLICY),
      "spearman",
    );
    if (!queued.accepted) throw new Error("expected enqueue success");

    const blocked = advanceSandboxProduction(queued.state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
      isExitBlocked: () => true,
    });
    expect(blocked.spawns).toHaveLength(0);
    expect(sandboxProductionQueueFor(blocked.state, "producer-1")?.entries[0])
      .toMatchObject({
        status: "ready-blocked",
        trainingProgressSeconds: 6,
      });
    expect(blocked.populationBefore.verdant).toMatchObject({
      reservedPopulation: 2,
      readyBlockedPopulation: 0,
    });
    expect(blocked.populationAfter.verdant).toMatchObject({
      reservedPopulation: 0,
      readyBlockedPopulation: 2,
    });

    const stillBlocked = advanceSandboxProduction(blocked.state, {
      elapsedSeconds: 6,
      deltaSeconds: 1,
      isExitBlocked: () => true,
    });
    expect(stillBlocked.state).toBe(blocked.state);
    expect(stillBlocked.spawns).toHaveLength(0);

    const released = advanceSandboxProduction(stillBlocked.state, {
      elapsedSeconds: 7,
      deltaSeconds: 0.25,
      isExitBlocked: () => false,
    });
    expect(released.spawns).toHaveLength(1);
    expect(released.spawns[0].scheduledAtSeconds).toBe(7);
    expect(released.populationBefore.verdant.readyBlockedPopulation).toBe(2);
    expect(released.populationAfter.verdant.totalQueuePopulation).toBe(0);
  });

  it("trains only the FIFO head and carries unused tick time into the next order", () => {
    let state = stateWithBuilding();
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (const troopKind of ["spearman", "swordsman", "spearman"] as const) {
      const result = enqueue(state, economy, troopKind);
      if (!result.accepted) throw new Error("expected enqueue success");
      state = result.state;
      economy = result.economy;
    }

    const result = advanceSandboxProduction(state, {
      elapsedSeconds: 10,
      deltaSeconds: 20,
    });

    expect(result.spawns.map((spawn) => spawn.troopKind))
      .toEqual(["spearman", "swordsman", "spearman"]);
    expect(result.spawns.map((spawn) => spawn.scheduledAtSeconds))
      .toEqual([16, 24, 30]);
    expect(sandboxProductionQueueFor(result.state, "producer-1")?.entries)
      .toHaveLength(0);
  });

  it("uses remaining tick time after a ready-blocked head leaves", () => {
    let state = stateWithBuilding();
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (const troopKind of ["spearman", "swordsman"] as const) {
      const queued = enqueue(state, economy, troopKind);
      if (!queued.accepted) throw new Error("expected enqueue success");
      state = queued.state;
      economy = queued.economy;
    }
    state = advanceSandboxProduction(state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
      isExitBlocked: () => true,
    }).state;

    const released = advanceSandboxProduction(state, {
      elapsedSeconds: 6,
      deltaSeconds: 3,
    });

    expect(released.spawns).toHaveLength(1);
    expect(released.spawns[0].scheduledAtSeconds).toBe(6);
    expect(sandboxProductionQueueFor(released.state, "producer-1")?.entries[0])
      .toMatchObject({
        troopKind: "swordsman",
        status: "training",
        trainingProgressSeconds: 3,
      });
  });

  it("advances separate buildings independently and returns stable spawn order", () => {
    let state = createSandboxProductionState([
      { buildingId: "z-barracks", faction: "verdant", producer: "barracks" },
      { buildingId: "a-barracks", faction: "verdant", producer: "barracks" },
    ]);
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (const buildingId of ["z-barracks", "a-barracks"] as const) {
      const queued = enqueue(state, economy, "spearman", { buildingId });
      if (!queued.accepted) throw new Error("expected enqueue success");
      state = queued.state;
      economy = queued.economy;
    }

    const result = advanceSandboxProduction(state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
    });

    expect(result.spawns.map((spawn) => spawn.buildingId))
      .toEqual(["a-barracks", "z-barracks"]);
    expect(new Set(result.spawns.map((spawn) => spawn.squadId)).size).toBe(2);
    expect(Object.isFrozen(result.spawns)).toBe(true);
    expect(Object.isFrozen(result.spawns[0].unitIds)).toBe(true);
  });

  it("destroys all queue states, releasing both reservation classes without refund", () => {
    let state = stateWithBuilding();
    let economy = createEconomyState(SANDBOX_ECONOMY_POLICY);
    for (const troopKind of ["spearman", "swordsman", "spearman"] as const) {
      const queued = enqueue(state, economy, troopKind);
      if (!queued.accepted) throw new Error("expected enqueue success");
      state = queued.state;
      economy = queued.economy;
    }
    state = advanceSandboxProduction(state, {
      elapsedSeconds: 0,
      deltaSeconds: 6,
      isExitBlocked: () => true,
    }).state;

    const goldBeforeDestruction = economy.accounts.verdant.gold;
    const destroyed = destroySandboxProductionBuilding(state, "producer-1");

    expect(destroyed).toMatchObject({
      destroyed: true,
      faction: "verdant",
      releasedReservedPopulation: 5,
      releasedReadyBlockedPopulation: 2,
    });
    expect(destroyed.discardedEntries.map((entry) => entry.status))
      .toEqual(["ready-blocked", "queued", "queued"]);
    expect(sandboxProductionQueueFor(destroyed.state, "producer-1")).toBeNull();
    expect(economy.accounts.verdant.gold).toBe(goldBeforeDestruction);
    expect(goldBeforeDestruction).toBe(200);

    const missing = destroySandboxProductionBuilding(destroyed.state, "producer-1");
    expect(missing).toMatchObject({
      destroyed: false,
      state: destroyed.state,
      releasedReservedPopulation: 0,
      releasedReadyBlockedPopulation: 0,
    });
  });
});
