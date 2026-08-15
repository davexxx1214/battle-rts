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
