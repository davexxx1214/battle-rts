import { describe, expect, it } from "vitest";

import { createBattleBuilding } from "../../src/game/buildings";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import { stampBattleEvent } from "../../src/game/events";
import type { SandboxProductionState } from "../../src/game/sandboxProductionQueue";
import {
  BUILDING_HEALTH_BAR_LAYERS,
  buildingPresentation,
  latestBuildingSignal,
} from "../../src/scene/buildings/buildingPresentation";

describe("building presentation state", () => {
  it("renders the health fill after its translucent frame instead of hiding it in black", () => {
    const layers = Object.values(BUILDING_HEALTH_BAR_LAYERS);

    expect(layers.every((layer) => layer.material.transparent)).toBe(true);
    expect(layers.every((layer) => !layer.material.depthTest)).toBe(true);
    expect(layers.every((layer) => !layer.material.depthWrite)).toBe(true);
    expect(BUILDING_HEALTH_BAR_LAYERS.fill.renderOrder)
      .toBeGreaterThan(BUILDING_HEALTH_BAR_LAYERS.track.renderOrder);
    expect(BUILDING_HEALTH_BAR_LAYERS.track.renderOrder)
      .toBeGreaterThan(BUILDING_HEALTH_BAR_LAYERS.frame.renderOrder);
  });

  it("derives health tone and the next production progress from authoritative state", () => {
    const mine = {
      ...createBattleBuilding({
        id: "mine-1",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: { q: 0, r: 3 },
        createdAt: 0,
      }),
      health: 225,
      productionSequence: 2,
    };

    expect(buildingPresentation(mine, 10)).toMatchObject({
      healthRatio: 0.25,
      healthTone: "critical",
      lifecycle: "active",
      destructionProgress: 0,
      productionProgress: 0.5,
      kingVisible: false,
    });
  });

  it("uses the slower undead barracks cadence for production progress", () => {
    const barracks = createBattleBuilding({
      id: "undead-barracks-1",
      kind: "barracks",
      faction: "verdant",
      coordinate: { q: 0, r: 3 },
      createdAt: 0,
    });

    expect(buildingPresentation(barracks, 3, "undead").productionProgress).toBe(0.5);
    expect(buildingPresentation(barracks, 3, "human").productionProgress).toBe(0.6);
  });

  it("reads sandbox producer progress from the authoritative queue head", () => {
    const producers = [
      { kind: "barracks", troopKind: "spearman", progress: 1.5, expected: 0.5 },
      { kind: "archery-range", troopKind: "archer", progress: 2.5, expected: 0.5 },
      { kind: "mage-tower", troopKind: "mage", progress: 3.5, expected: 0.5 },
      { kind: "siege-workshop", troopKind: "catapult", progress: 8, expected: 0.5 },
    ] as const;

    for (const [index, producer] of producers.entries()) {
      const building = createBattleBuilding({
        id: `sandbox-producer-${index}`,
        kind: producer.kind,
        faction: index % 2 === 0 ? "verdant" : "crimson",
        coordinate: { q: index, r: 10 },
        createdAt: 0,
      }, battleModeDefinitionFor("sandbox").buildingLifecyclePolicy);
      const production: SandboxProductionState = {
        nextEntrySequence: 2,
        queuesByBuildingId: {
          [building.id]: {
            buildingId: building.id,
            faction: building.faction,
            producer: producer.kind,
            rallyPoint: null,
            entries: [{
              id: `${building.id}:production:1`,
              sequence: 1,
              troopKind: producer.troopKind,
              status: "training",
              trainingProgressSeconds: producer.progress,
            }],
          },
        },
      };

      expect(buildingPresentation(building, 20, "human", production).productionProgress)
        .toBe(producer.expected);
    }
  });

  it("hides sandbox producer progress for empty, missing, or mismatched queues", () => {
    const barracks = createBattleBuilding({
      id: "sandbox-barracks-empty",
      kind: "barracks",
      faction: "verdant",
      coordinate: { q: 0, r: 10 },
      createdAt: 0,
    }, battleModeDefinitionFor("sandbox").buildingLifecyclePolicy);
    const empty: SandboxProductionState = {
      nextEntrySequence: 1,
      queuesByBuildingId: {
        [barracks.id]: {
          buildingId: barracks.id,
          faction: barracks.faction,
          producer: "barracks",
          rallyPoint: null,
          entries: [],
        },
      },
    };
    const missing: SandboxProductionState = {
      nextEntrySequence: 1,
      queuesByBuildingId: {},
    };

    expect(buildingPresentation(barracks, 20, "human", empty).productionProgress).toBeNull();
    expect(buildingPresentation(barracks, 20, "human", missing).productionProgress).toBeNull();
    expect(buildingPresentation({ ...barracks, kind: "archery-range" }, 20).productionProgress)
      .toBeNull();
  });

  it("shows a completed sandbox queue head while its exit remains blocked", () => {
    const workshop = createBattleBuilding({
      id: "sandbox-workshop-blocked",
      kind: "siege-workshop",
      faction: "crimson",
      coordinate: { q: 8, r: -10 },
      createdAt: 0,
    }, battleModeDefinitionFor("sandbox").buildingLifecyclePolicy);
    const production: SandboxProductionState = {
      nextEntrySequence: 2,
      queuesByBuildingId: {
        [workshop.id]: {
          buildingId: workshop.id,
          faction: workshop.faction,
          producer: "siege-workshop",
          rallyPoint: null,
          entries: [{
            id: "sandbox-workshop-blocked:production:1",
            sequence: 1,
            troopKind: "catapult",
            status: "ready-blocked",
            trainingProgressSeconds: 18,
          }],
        },
      },
    };

    expect(buildingPresentation(workshop, 20, "undead", production).productionProgress).toBe(1);
  });

  it("shows a timed sandbox worksite before starting the mine production clock", () => {
    const mine = createBattleBuilding({
      id: "sandbox-mine-1",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: { q: -13, r: 10 },
      createdAt: 0,
      constructionSeconds: 6,
    }, battleModeDefinitionFor("sandbox").buildingLifecyclePolicy);

    expect(buildingPresentation(mine, 3)).toMatchObject({
      lifecycle: "constructing",
      constructionProgress: 0.5,
      productionProgress: null,
    });
    expect(buildingPresentation(mine, 6)).toMatchObject({
      lifecycle: "active",
      constructionProgress: 1,
      productionProgress: 0,
    });
  });

  it("marks destroyed buildings and activated castles without UI-owned timers", () => {
    const castle = createBattleBuilding({
      id: "verdant-castle",
      kind: "castle",
      faction: "verdant",
      coordinate: { q: -4, r: 9 },
      createdAt: 0,
    });
    const activated = {
      ...castle,
      castleCombat: { activatedAt: 4, cooldownRemaining: 0.5 },
    };
    const destroyed = {
      ...activated,
      health: 0,
      status: "destroyed" as const,
      diedAt: 8,
      removeAt: 8.8,
    };

    expect(buildingPresentation(activated, 5)).toMatchObject({
      healthTone: "healthy",
      lifecycle: "active",
      destructionProgress: 0,
      productionProgress: null,
      kingVisible: true,
    });
    expect(buildingPresentation(destroyed, 8.4)).toMatchObject({
      healthRatio: 0,
      healthTone: "critical",
      lifecycle: "destroying",
      destructionProgress: 0.5,
      kingVisible: true,
    });
  });

  it("shows arrow tower health without treating it as a production building", () => {
    const tower = {
      ...createBattleBuilding({
        id: "verdant-arrow-tower-left",
        kind: "arrow-tower",
        faction: "verdant",
        coordinate: { q: -4, r: 6 },
        createdAt: 0,
      }),
      health: 125,
    };

    expect(buildingPresentation(tower, 20)).toMatchObject({
      healthRatio: 0.25,
      healthTone: "critical",
      lifecycle: "active",
      productionProgress: null,
      kingVisible: false,
    });
  });

  it("distinguishes credited gold, wasted gold, spawning, destruction, and activation", () => {
    const mine = createBattleBuilding({
      id: "mine-1",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: { q: 0, r: 3 },
      createdAt: 0,
    });
    const events = [
      stampBattleEvent({
        type: "building-gold-produced",
        buildingId: mine.id,
        faction: mine.faction,
        scheduledAt: 4,
        productionSequence: 1,
        producedAmount: 100,
        creditedAmount: 0,
        wastedAmount: 100,
      }, 1, 4),
      stampBattleEvent({
        type: "building-gold-produced",
        buildingId: mine.id,
        faction: mine.faction,
        scheduledAt: 8,
        productionSequence: 2,
        producedAmount: 100,
        creditedAmount: 100,
        wastedAmount: 0,
      }, 2, 8),
    ];

    expect(latestBuildingSignal(mine, 8.5, events)).toEqual({
      kind: "gold",
      sequence: 2,
      age: 0.5,
      producedAmount: 100,
      creditedAmount: 100,
      wastedAmount: 0,
    });
    expect(latestBuildingSignal(mine, 4.5, events.slice(0, 1))).toEqual({
      kind: "gold-wasted",
      sequence: 1,
      age: 0.5,
      producedAmount: 100,
      creditedAmount: 0,
      wastedAmount: 100,
    });
  });

  it("exposes a short deployment signal for the building entrance", () => {
    const barracks = createBattleBuilding({
      id: "verdant-barracks-1",
      kind: "barracks",
      faction: "verdant",
      coordinate: { q: 1, r: 3 },
      createdAt: 1,
    });
    const deployed = stampBattleEvent({
      type: "deployment-succeeded",
      faction: "verdant",
      deploymentId: barracks.id,
      entityType: "building",
      buildingId: barracks.id,
      kind: "barracks",
      quantity: 1,
      coordinate: barracks.coordinate,
      position: barracks.position,
    }, 4, 1);

    expect(latestBuildingSignal(barracks, 1.3, [deployed])).toEqual({
      kind: "deploy",
      sequence: 4,
      age: 0.3,
    });
  });
});
