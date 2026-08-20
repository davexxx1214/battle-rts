import { describe, expect, it } from "vitest";

import {
  advanceBuildings,
  battleBuildingConstructionPhaseAt,
  createBattleBuilding,
  type BattleBuilding,
} from "../../src/game/buildings";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import { createEconomyState, type EconomyState } from "../../src/game/economy";
import {
  canStartSandboxOrdinaryConstruction,
  hasCompletedLivingSandboxBarracks,
  startSandboxOrdinaryConstruction,
  type CanStartSandboxOrdinaryConstructionInput,
} from "../../src/game/sandboxConstruction";
import type { SandboxBuildingSlot } from "../../src/game/sandboxCatalog";
import { axialToWorld, coordinateKey } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";

const DEFINITION = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
const MODE = battleModeDefinitionFor("sandbox");
const VERDANT_ANCHORS = DEFINITION.buildAnchors!.verdant;

describe("sandbox ordinary construction", () => {
  it("atomically spends from the catalog and creates a permanent timed worksite", () => {
    const input = constructionInput({ elapsedSeconds: 3 });
    const result = startSandboxOrdinaryConstruction(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.costCharged).toBe(400);
    expect(result.economy.accounts.verdant.gold).toBe(600);
    expect(result.building).toMatchObject({
      id: "verdant-barracks-1",
      kind: "barracks",
      coordinate: VERDANT_ANCHORS[1]!.coordinate,
      createdAt: 3,
      constructionCompletedAt: 11,
      maxHealth: 1_200,
      health: 1_200,
      lifetimeSeconds: null,
      status: "active",
    });
    expect(battleBuildingConstructionPhaseAt(result.building, 10.999))
      .toBe("constructing");
    expect(battleBuildingConstructionPhaseAt(result.building, 11)).toBe("operational");
    expect(result.occupancy[coordinateKey(result.building.coordinate)]).toMatchObject({
      buildingId: result.building.id,
      kind: "barracks",
      faction: "verdant",
    });
    expect(input.economy.accounts.verdant.gold).toBe(1_000);
    expect(input.buildings).toHaveLength(0);
  });

  it("accepts only own ordinary anchors and rejects roads, pits, enemy anchors, and mine slots", () => {
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate: { q: 0, r: 0 },
    }))).toEqual({ ok: false, reason: "invalid-zone" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate: DEFINITION.minePits![0]!.coordinate,
    }))).toEqual({ ok: false, reason: "invalid-zone" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate: DEFINITION.buildAnchors!.crimson[0]!.coordinate,
    }))).toEqual({ ok: false, reason: "invalid-zone" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate: { q: 100, r: 100 },
    }))).toEqual({ ok: false, reason: "outside-battlefield" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      slot: "mine",
    }))).toEqual({ ok: false, reason: "invalid-building-slot" });
  });

  it("rejects duplicate ids and live unit or building occupancy with stable reasons", () => {
    const coordinate = VERDANT_ANCHORS[2]!.coordinate;
    const existing = sandboxBuilding("barracks", VERDANT_ANCHORS[0]!.coordinate, {
      id: "duplicate-id",
    });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      buildingId: "duplicate-id",
      buildings: [existing],
      coordinate,
    }))).toEqual({ ok: false, reason: "duplicate-building-id" });

    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate,
      units: [{ position: axialToWorld(coordinate), health: 1 }],
    }))).toEqual({ ok: false, reason: "occupied-hex" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate,
      buildings: [sandboxBuilding("barracks", coordinate)],
    }))).toEqual({ ok: false, reason: "occupied-hex" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      coordinate,
      occupancy: {
        [coordinateKey(coordinate)]: {
          buildingId: "stale-worksite",
          kind: "barracks",
          faction: "verdant",
          coordinate,
        },
      },
    }))).toEqual({ ok: false, reason: "occupied-hex" });
  });

  it("requires one completed living friendly barracks for every advanced building", () => {
    const advancedSlots = [
      "archery-range",
      "mage-tower",
      "siege-workshop",
      "guard-tower",
    ] as const satisfies readonly SandboxBuildingSlot[];
    for (const slot of advancedSlots) {
      expect(canStartSandboxOrdinaryConstruction(constructionInput({ slot })))
        .toEqual({ ok: false, reason: "missing-prerequisite" });
    }

    const barracks = sandboxBuilding("barracks", VERDANT_ANCHORS[0]!.coordinate);
    expect(hasCompletedLivingSandboxBarracks([barracks], "verdant", 7.999)).toBe(false);
    expect(hasCompletedLivingSandboxBarracks([barracks], "verdant", 8)).toBe(true);
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      slot: "archery-range",
      buildings: [barracks],
      elapsedSeconds: 7.999,
    }))).toEqual({ ok: false, reason: "missing-prerequisite" });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      slot: "archery-range",
      buildings: [barracks],
      elapsedSeconds: 8,
    })).ok).toBe(true);

    const enemyBarracks = { ...barracks, faction: "crimson" as const };
    const destroyedBarracks = {
      ...barracks,
      health: 0,
      status: "destroyed" as const,
    };
    expect(hasCompletedLivingSandboxBarracks([enemyBarracks], "verdant", 8)).toBe(false);
    expect(hasCompletedLivingSandboxBarracks([destroyedBarracks], "verdant", 8)).toBe(false);
  });

  it("does not re-check the barracks after an advanced worksite has legally started", () => {
    const barracks = sandboxBuilding("barracks", VERDANT_ANCHORS[0]!.coordinate);
    const started = startSandboxOrdinaryConstruction(constructionInput({
      slot: "archery-range",
      buildings: [barracks],
      elapsedSeconds: 8,
    }));
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.reason);

    const destroyedBarracks = {
      ...barracks,
      health: 0,
      status: "destroyed" as const,
    };
    expect(hasCompletedLivingSandboxBarracks([destroyedBarracks], "verdant", 18))
      .toBe(false);
    expect(started.building).toMatchObject({
      kind: "archery-range",
      constructionCompletedAt: 18,
      maxHealth: 1_000,
      lifetimeSeconds: null,
    });
    expect(battleBuildingConstructionPhaseAt(started.building, 18)).toBe("operational");

    const longIdle = advanceBuildings({
      buildings: [started.building],
      economy: started.economy,
      occupancy: started.occupancy,
      map: DEFINITION.map,
      units: [],
      elapsedSeconds: 18,
      deltaSeconds: 30 * 60,
      damageIntents: [],
      economyPolicy: MODE.economyPolicy,
      productionPolicy: MODE.productionPolicy,
    });
    expect(longIdle.buildings[0]).toMatchObject({
      kind: "archery-range",
      health: 1_000,
      status: "active",
    });
  });

  it("counts constructing guard towers toward the per-faction limit of two", () => {
    const barracks = sandboxBuilding("barracks", VERDANT_ANCHORS[0]!.coordinate);
    const first = sandboxBuilding("guard-tower", VERDANT_ANCHORS[3]!.coordinate, {
      id: "verdant-guard-1",
    });
    const second = sandboxBuilding("guard-tower", VERDANT_ANCHORS[4]!.coordinate, {
      id: "verdant-guard-2",
    });
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      slot: "guard-tower",
      buildings: [barracks, first, second],
      elapsedSeconds: 8,
    }))).toEqual({ ok: false, reason: "building-limit-reached" });

    const destroyedSecond = {
      ...second,
      health: 0,
      status: "destroyed" as const,
    };
    expect(canStartSandboxOrdinaryConstruction(constructionInput({
      slot: "guard-tower",
      buildings: [barracks, first, destroyedSecond],
      elapsedSeconds: 8,
    })).ok).toBe(true);
  });

  it("allows construction sites to be destroyed by combat without refunding their cost", () => {
    const barracks = sandboxBuilding("barracks", VERDANT_ANCHORS[0]!.coordinate);
    const started = startSandboxOrdinaryConstruction(constructionInput({
      slot: "mage-tower",
      buildings: [barracks],
      elapsedSeconds: 8,
    }));
    if (!started.ok) throw new Error(started.reason);
    expect(started.economy.accounts.verdant.gold).toBe(300);

    const destroyed = advanceBuildings({
      buildings: [started.building],
      economy: started.economy,
      occupancy: started.occupancy,
      map: DEFINITION.map,
      units: [],
      elapsedSeconds: 8,
      deltaSeconds: 1,
      damageIntents: [{
        sourceId: "crimson-raider",
        sourceType: "unit",
        targetId: started.building.id,
        targetType: "building",
        amount: started.building.maxHealth,
      }],
      economyPolicy: MODE.economyPolicy,
      productionPolicy: MODE.productionPolicy,
    });
    expect(destroyed.buildings[0]).toMatchObject({
      kind: "mage-tower",
      health: 0,
      status: "destroyed",
    });
    expect(destroyed.economy.accounts.verdant.gold).toBe(300);
  });

  it("returns original state references on insufficient gold or missing prerequisites", () => {
    const poor = constructionInput({ economy: economyWithVerdantGold(300) });
    const insufficient = startSandboxOrdinaryConstruction(poor);
    expect(insufficient).toMatchObject({ ok: false, reason: "insufficient-gold" });
    if (insufficient.ok) return;
    expect(insufficient.buildings).toBe(poor.buildings);
    expect(insufficient.occupancy).toBe(poor.occupancy);
    expect(insufficient.economy).toBe(poor.economy);

    const locked = constructionInput({ slot: "siege-workshop" });
    const missing = startSandboxOrdinaryConstruction(locked);
    expect(missing).toMatchObject({ ok: false, reason: "missing-prerequisite" });
    if (missing.ok) return;
    expect(missing.buildings).toBe(locked.buildings);
    expect(missing.occupancy).toBe(locked.occupancy);
    expect(missing.economy).toBe(locked.economy);
  });
});

interface ConstructionOverrides {
  readonly slot?: SandboxBuildingSlot;
  readonly buildingId?: string;
  readonly coordinate?: { readonly q: number; readonly r: number };
  readonly elapsedSeconds?: number;
  readonly buildings?: readonly BattleBuilding[];
  readonly occupancy?: CanStartSandboxOrdinaryConstructionInput["occupancy"];
  readonly units?: CanStartSandboxOrdinaryConstructionInput["units"];
  readonly economy?: EconomyState;
}

function constructionInput(
  overrides: ConstructionOverrides = {},
): CanStartSandboxOrdinaryConstructionInput {
  const coordinate = overrides.coordinate ?? VERDANT_ANCHORS[1]!.coordinate;
  return {
    map: DEFINITION.map,
    buildings: overrides.buildings ?? [],
    occupancy: overrides.occupancy ?? {},
    units: overrides.units ?? [],
    economy: overrides.economy ?? createEconomyState(MODE.economyPolicy),
    faction: "verdant",
    slot: overrides.slot ?? "barracks",
    buildingId: overrides.buildingId ?? "verdant-barracks-1",
    worldPosition: axialToWorld(coordinate),
    elapsedSeconds: overrides.elapsedSeconds ?? 0,
  };
}

function sandboxBuilding(
  slot: Exclude<SandboxBuildingSlot, "mine">,
  coordinate: { readonly q: number; readonly r: number },
  overrides: { readonly id?: string; readonly faction?: "verdant" | "crimson" } = {},
): BattleBuilding {
  const constructionSeconds = slot === "barracks" || slot === "guard-tower"
    ? 8
    : slot === "archery-range" ? 10 : slot === "mage-tower" ? 12 : 16;
  return createBattleBuilding({
    id: overrides.id ?? `fixture-${slot}`,
    kind: slot,
    faction: overrides.faction ?? "verdant",
    coordinate,
    createdAt: 0,
    constructionSeconds,
  }, MODE.buildingLifecyclePolicy);
}

function economyWithVerdantGold(gold: number): EconomyState {
  const economy = createEconomyState(MODE.economyPolicy);
  return {
    ...economy,
    accounts: {
      ...economy.accounts,
      verdant: {
        ...economy.accounts.verdant,
        gold,
        isFull: false,
      },
    },
  };
}
