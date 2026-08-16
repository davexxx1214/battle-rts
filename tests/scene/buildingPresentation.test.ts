import { describe, expect, it } from "vitest";

import { createBattleBuilding } from "../../src/game/buildings";
import { stampBattleEvent } from "../../src/game/events";
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
