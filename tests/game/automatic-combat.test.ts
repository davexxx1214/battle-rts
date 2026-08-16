import { describe, expect, it } from "vitest";

import {
  clampToForwardProgress,
  forwardProgress,
  selectAutomaticTarget,
} from "../../src/game/autoCombat";
import { createBattleUnit } from "../../src/game/battle";
import { createBattleBuilding } from "../../src/game/buildings";
import { BATTLEFIELD_MAP, axialToWorld } from "../../src/map/battlefield";

function chargingVerdant(position = axialToWorld({ q: -2, r: 5 })) {
  return {
    ...createBattleUnit({
      id: "verdant-attacker",
      faction: "verdant" as const,
      role: "knight" as const,
      position,
    }),
    behavior: "charging" as const,
  };
}

describe("automatic combat target selection", () => {
  it("selects an enemy soldier on the castle route", () => {
    const attacker = chargingVerdant();
    const enemy = createBattleUnit({
      id: "crimson-on-route",
      faction: "crimson",
      role: "ranger",
      position: axialToWorld({ q: -1, r: 3 }),
    });

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, enemy],
      buildings: [],
    })?.id).toBe(enemy.id);
  });

  it("selects an attackable building on the route", () => {
    const attacker = chargingVerdant();
    const mine = createBattleBuilding({
      id: "crimson-route-mine",
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker],
      buildings: [mine],
    })?.id).toBe(mine.id);
  });

  it("switches from a soldier to a building blocking the castle route", () => {
    const blocker = createBattleBuilding({
      id: "crimson-route-blocker",
      kind: "barracks",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const soldier = createBattleUnit({
      id: "crimson-closer-soldier",
      faction: "crimson",
      role: "knight",
      position: { x: blocker.position.x, z: blocker.position.z + 1.5 },
    });
    const attacker = {
      ...chargingVerdant(),
      behavior: "engaging" as const,
      currentTarget: { targetType: "unit" as const, targetId: soldier.id },
    };

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, soldier],
      buildings: [blocker],
    })).toMatchObject({ targetType: "building", id: blocker.id });
  });

  it("does not prioritize a nearby building outside the chosen hex route", () => {
    const sideBuilding = createBattleBuilding({
      id: "crimson-side-building",
      kind: "barracks",
      faction: "crimson",
      coordinate: { q: 0, r: 3 },
      createdAt: 0,
    });
    const soldier = createBattleUnit({
      id: "crimson-current-soldier",
      faction: "crimson",
      role: "knight",
      position: { x: 1, z: 7 },
    });
    const attacker = {
      ...chargingVerdant(),
      behavior: "engaging" as const,
      currentTarget: { targetType: "unit" as const, targetId: soldier.id },
    };

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, soldier],
      buildings: [sideBuilding],
    })).toMatchObject({ targetType: "unit", id: soldier.id });
  });

  it("uses cached charge waypoints as the canonical blocking route", () => {
    const blocker = createBattleBuilding({
      id: "crimson-astar-only-blocker",
      kind: "barracks",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const soldier = createBattleUnit({
      id: "crimson-cached-route-target",
      faction: "crimson",
      role: "knight",
      position: { x: blocker.position.x, z: blocker.position.z + 1.5 },
    });
    const attacker = {
      ...chargingVerdant(),
      behavior: "engaging" as const,
      currentTarget: { targetType: "unit" as const, targetId: soldier.id },
      navigationKey: "charge:crimson-castle",
      waypoints: [
        axialToWorld({ q: 0, r: 3 }),
        axialToWorld(BATTLEFIELD_MAP.castleApproaches.crimson),
      ],
    };

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, soldier],
      buildings: [blocker],
    })).toMatchObject({ targetType: "unit", id: soldier.id });
  });

  it("interrupts a castle lock for a building newly placed in front", () => {
    const castle = createBattleBuilding({
      id: "crimson-castle",
      kind: "castle",
      faction: "crimson",
      coordinate: BATTLEFIELD_MAP.castles.crimson,
      createdAt: 0,
    });
    const blocker = createBattleBuilding({
      id: "crimson-late-blocker",
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const attacker = {
      ...chargingVerdant(),
      behavior: "castle-locked" as const,
      currentTarget: { targetType: "building" as const, targetId: castle.id },
    };

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker],
      buildings: [castle, blocker],
    })).toMatchObject({ targetType: "building", id: blocker.id });

    const afterBlocker = {
      ...attacker,
      currentTarget: { targetType: "building" as const, targetId: blocker.id },
    };
    expect(selectAutomaticTarget({
      unit: afterBlocker,
      units: [afterBlocker],
      buildings: [castle],
    })).toMatchObject({ targetType: "building", id: castle.id });
  });

  it("ignores enemies behind the unit or far outside its forward route", () => {
    const attacker = chargingVerdant();
    const behind = createBattleUnit({
      id: "crimson-behind",
      faction: "crimson",
      role: "knight",
      position: axialToWorld({ q: -3, r: 6 }),
    });
    const farSide = createBattleUnit({
      id: "crimson-far-side",
      faction: "crimson",
      role: "knight",
      position: axialToWorld({ q: 2, r: 3 }),
    });

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, behind, farSide],
      buildings: [],
    })).toBeNull();
  });

  it("prioritizes a path enemy before the castle and sorts equal candidates by id", () => {
    const attacker = chargingVerdant(axialToWorld({ q: 3, r: -6 }));
    const castle = createBattleBuilding({
      id: "crimson-castle",
      kind: "castle",
      faction: "crimson",
      coordinate: BATTLEFIELD_MAP.castles.crimson,
      createdAt: 0,
    });
    const second = createBattleUnit({
      id: "crimson-b",
      faction: "crimson",
      role: "knight",
      position: { x: -0.6, z: -12.1 },
    });
    const first = createBattleUnit({
      id: "crimson-a",
      faction: "crimson",
      role: "knight",
      position: { x: 0.6, z: -12.1 },
    });

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, second, first],
      buildings: [castle],
    })?.id).toBe(first.id);
  });

  it("keeps unit and building targets distinct even when their ids collide", () => {
    const sharedId = "crimson-shared";
    const building = createBattleBuilding({
      id: sharedId,
      kind: "gold-mine",
      faction: "crimson",
      coordinate: { q: -1, r: 3 },
      createdAt: 0,
    });
    const enemyUnit = createBattleUnit({
      id: sharedId,
      faction: "crimson",
      role: "knight",
      position: building.position,
    });
    const attacker = {
      ...chargingVerdant(),
      behavior: "engaging" as const,
      currentTarget: { targetType: "building" as const, targetId: sharedId },
    };

    expect(selectAutomaticTarget({
      unit: attacker,
      units: [attacker, enemyUnit],
      buildings: [building],
    })?.targetType).toBe("building");
  });
});

describe("forward-only movement", () => {
  it("removes backwards progress while preserving a possible lateral correction", () => {
    const origin = { x: 0, z: 0 };
    const requested = { x: 2, z: 1 };
    const clamped = clampToForwardProgress("verdant", origin, requested);

    expect(forwardProgress("verdant", origin, clamped)).toBeGreaterThanOrEqual(-1e-9);
    expect(clamped.x).not.toBe(origin.x);
  });
});
