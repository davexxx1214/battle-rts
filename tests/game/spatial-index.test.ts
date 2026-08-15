import { describe, expect, it } from "vitest";

import { createBattleUnit } from "../../src/game/battle";
import { BattleSpatialIndex } from "../../src/game/spatialIndex";

describe("battle spatial index", () => {
  it("returns nearby enemy units in deterministic distance and id order", () => {
    const origin = createBattleUnit({
      id: "origin",
      faction: "verdant",
      role: "ranger",
      position: { x: 0, z: 0 },
    });
    const units = [
      createBattleUnit({ id: "far", faction: "crimson", role: "knight", position: { x: 8, z: 0 } }),
      createBattleUnit({ id: "bravo", faction: "crimson", role: "knight", position: { x: 2, z: 0 } }),
      createBattleUnit({ id: "alpha", faction: "crimson", role: "knight", position: { x: 0, z: 2 } }),
      createBattleUnit({ id: "ally", faction: "verdant", role: "knight", position: { x: 1, z: 0 } }),
      origin,
    ];

    const index = new BattleSpatialIndex(units, 3);

    expect(index.enemiesWithin(origin, 3).map((unit) => unit.id)).toEqual(["alpha", "bravo"]);
    expect(index.unitById("far")?.id).toBe("far");
  });

  it("excludes dead units and can restrict results to melee threats", () => {
    const origin = createBattleUnit({
      id: "origin",
      faction: "verdant",
      role: "mage",
      position: { x: 0, z: 0 },
    });
    const dead = {
      ...createBattleUnit({ id: "dead", faction: "crimson", role: "knight", position: { x: 1, z: 0 } }),
      health: 0,
      status: "dead" as const,
    };
    const ranger = createBattleUnit({ id: "ranger", faction: "crimson", role: "ranger", position: { x: 1, z: 1 } });
    const knight = createBattleUnit({ id: "knight", faction: "crimson", role: "knight", position: { x: 2, z: 0 } });

    const index = new BattleSpatialIndex([origin, dead, ranger, knight]);

    expect(index.enemiesWithin(origin, 3, { meleeOnly: true }).map((unit) => unit.id)).toEqual(["knight"]);
  });
});
