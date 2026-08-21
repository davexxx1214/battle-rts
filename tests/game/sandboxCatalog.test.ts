import { describe, expect, it } from "vitest";

import {
  SANDBOX_BUILDING_CATALOG,
  SANDBOX_BUILDING_SLOTS,
  SANDBOX_GOLD_MINE_MAX_HEALTH,
  SANDBOX_TROOP_CATALOG,
  SANDBOX_TROOP_SLOTS,
  sandboxBuildingSlotForKind,
  sandboxBuildingSpec,
  sandboxTroopSpec,
} from "../../src/game/sandboxCatalog";
import { DEPLOYABLE_CATEGORIES } from "../../src/game/rules";

describe("sandbox catalog", () => {
  it("locks the six building slots and their first playable balance values", () => {
    expect(SANDBOX_BUILDING_SLOTS).toEqual([
      "mine",
      "barracks",
      "archery-range",
      "mage-tower",
      "siege-workshop",
      "guard-tower",
    ]);
    expect(Object.fromEntries(SANDBOX_BUILDING_SLOTS.map((slot) => {
      const spec = sandboxBuildingSpec(slot);
      return [slot, {
        kind: spec.kind,
        cost: spec.cost,
        constructionSeconds: spec.constructionSeconds,
        maxHealth: spec.maxHealth,
        prerequisites: spec.prerequisites,
        maximumActivePerFaction: spec.maximumActivePerFaction,
      }];
    }))).toEqual({
      mine: {
        kind: "gold-mine",
        cost: 400,
        constructionSeconds: 6,
        maxHealth: SANDBOX_GOLD_MINE_MAX_HEALTH,
        prerequisites: [],
        maximumActivePerFaction: null,
      },
      barracks: {
        kind: "barracks",
        cost: 400,
        constructionSeconds: 8,
        maxHealth: 1_200,
        prerequisites: [],
        maximumActivePerFaction: null,
      },
      "archery-range": {
        kind: "archery-range",
        cost: 500,
        constructionSeconds: 10,
        maxHealth: 1_000,
        prerequisites: ["barracks"],
        maximumActivePerFaction: null,
      },
      "mage-tower": {
        kind: "mage-tower",
        cost: 700,
        constructionSeconds: 12,
        maxHealth: 900,
        prerequisites: ["barracks"],
        maximumActivePerFaction: null,
      },
      "siege-workshop": {
        kind: "siege-workshop",
        cost: 800,
        constructionSeconds: 16,
        maxHealth: 1_400,
        prerequisites: ["barracks"],
        maximumActivePerFaction: null,
      },
      "guard-tower": {
        kind: "guard-tower",
        cost: 500,
        constructionSeconds: 8,
        maxHealth: 450,
        prerequisites: ["barracks"],
        maximumActivePerFaction: 2,
      },
    });
  });

  it("locks the five troop slots to one producer, price, timer, formation, and population cost", () => {
    expect(SANDBOX_TROOP_SLOTS).toEqual([
      "spearman",
      "swordsman",
      "archer",
      "mage",
      "catapult",
    ]);
    expect(Object.fromEntries(SANDBOX_TROOP_SLOTS.map((slot) => {
      const spec = sandboxTroopSpec(slot);
      return [slot, {
        producer: spec.producer,
        cost: spec.cost,
        trainingSeconds: spec.trainingSeconds,
        entityCount: spec.entityCount,
        populationCost: spec.populationCost,
      }];
    }))).toEqual({
      spearman: {
        producer: "barracks",
        cost: 200,
        trainingSeconds: 6,
        entityCount: 2,
        populationCost: 2,
      },
      swordsman: {
        producer: "barracks",
        cost: 400,
        trainingSeconds: 8,
        entityCount: 3,
        populationCost: 3,
      },
      archer: {
        producer: "archery-range",
        cost: 300,
        trainingSeconds: 8,
        entityCount: 2,
        populationCost: 2,
      },
      mage: {
        producer: "mage-tower",
        cost: 600,
        trainingSeconds: 12,
        entityCount: 2,
        populationCost: 2,
      },
      catapult: {
        producer: "siege-workshop",
        cost: 800,
        trainingSeconds: 18,
        entityCount: 1,
        populationCost: 3,
      },
    });
  });

  it("keeps race presentation and combat-role mappings in the same authoritative entries", () => {
    expect(SANDBOX_BUILDING_CATALOG.barracks.displayByRace).toMatchObject({
      human: { name: "兵营" },
      undead: { name: "墓穴兵营" },
    });
    expect(SANDBOX_BUILDING_CATALOG["guard-tower"].displayByRace).toMatchObject({
      human: { name: "守卫塔" },
      undead: { name: "魂火尖塔" },
    });
    expect(SANDBOX_TROOP_CATALOG.catapult).toMatchObject({
      roleByRace: { human: "catapult", undead: "bone-dragon" },
      displayByRace: {
        human: { name: "投石车" },
        undead: { name: "冰霜骨龙" },
      },
    });
    expect(SANDBOX_TROOP_SLOTS.every((slot) => (
      SANDBOX_TROOP_CATALOG[slot].displayByRace.human.name.length > 0
      && SANDBOX_TROOP_CATALOG[slot].displayByRace.undead.name.length > 0
    ))).toBe(true);
  });

  it("maps the catalog-only mine slot without widening legacy deployment kinds", () => {
    expect(sandboxBuildingSlotForKind("gold-mine")).toBe("mine");
    expect(sandboxBuildingSlotForKind("archery-range")).toBe("archery-range");
    expect(sandboxBuildingSlotForKind("castle")).toBeNull();
    expect(Object.keys(DEPLOYABLE_CATEGORIES)).toEqual([
      "spearman",
      "swordsman",
      "archer",
      "mage",
      "catapult",
      "guard-tower",
      "gold-mine",
      "barracks",
    ]);
  });

  it("keeps catalog ids unique, numeric values valid, and the prerequisite graph acyclic", () => {
    expect(new Set(SANDBOX_BUILDING_SLOTS.map((slot) => (
      SANDBOX_BUILDING_CATALOG[slot].kind
    ))).size).toBe(SANDBOX_BUILDING_SLOTS.length);
    for (const slot of SANDBOX_BUILDING_SLOTS) {
      const spec = SANDBOX_BUILDING_CATALOG[slot];
      expect(Number.isInteger(spec.cost) && spec.cost > 0).toBe(true);
      expect(Number.isInteger(spec.constructionSeconds) && spec.constructionSeconds > 0)
        .toBe(true);
      expect(Number.isInteger(spec.maxHealth) && spec.maxHealth > 0).toBe(true);
      expect(spec.prerequisites).not.toContain(slot);
      expect(spec.prerequisites.every((prerequisite) => (
        SANDBOX_BUILDING_SLOTS.includes(prerequisite)
      ))).toBe(true);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (slot: typeof SANDBOX_BUILDING_SLOTS[number]): boolean => {
      if (visiting.has(slot)) return false;
      if (visited.has(slot)) return true;
      visiting.add(slot);
      const acyclic = SANDBOX_BUILDING_CATALOG[slot].prerequisites.every(visit);
      visiting.delete(slot);
      visited.add(slot);
      return acyclic;
    };
    expect(SANDBOX_BUILDING_SLOTS.every(visit)).toBe(true);

    for (const slot of SANDBOX_TROOP_SLOTS) {
      const spec = SANDBOX_TROOP_CATALOG[slot];
      expect(Number.isInteger(spec.cost) && spec.cost > 0).toBe(true);
      expect(Number.isInteger(spec.trainingSeconds) && spec.trainingSeconds > 0).toBe(true);
      expect(Number.isInteger(spec.entityCount) && spec.entityCount > 0).toBe(true);
      expect(Number.isInteger(spec.populationCost) && spec.populationCost > 0).toBe(true);
      expect(SANDBOX_BUILDING_CATALOG[spec.producer].kind).toBe(spec.producer);
    }
  });
});
