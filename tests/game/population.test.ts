import { describe, expect, it } from "vitest";

import {
  canCommitSandboxPopulation,
  createFactionPopulationSnapshot,
  sandboxPopulationCostForUnitRole,
  sandboxUsedPopulation,
  type PopulationUnitSnapshot,
} from "../../src/game/population";

function unit(
  id: number,
  role: PopulationUnitSnapshot["role"],
  health = 100,
): PopulationUnitSnapshot & { readonly id: string } {
  return { id: `unit-${id}`, faction: "verdant", role, health, status: health > 0 ? "idle" : "dead" };
}

describe("sandbox population", () => {
  it("counts rendered entities independently from the heavy-unit population cost", () => {
    const units = [
      unit(1, "spearman"),
      unit(2, "spearman"),
      unit(3, "knight"),
      unit(4, "knight"),
      unit(5, "knight"),
      unit(6, "ranger"),
      unit(7, "ranger"),
      unit(8, "mage"),
      unit(9, "mage"),
      unit(10, "catapult"),
    ];

    expect(sandboxPopulationCostForUnitRole("mage")).toBe(2);
    expect(sandboxPopulationCostForUnitRole("catapult")).toBe(4);
    expect(sandboxPopulationCostForUnitRole("bone-dragon")).toBe(4);
    expect(sandboxUsedPopulation(units, "verdant")).toBe(15);
  });

  it("releases dead units immediately and includes ready-blocked population", () => {
    const units = [unit(1, "knight"), unit(2, "catapult", 0)];
    expect(sandboxUsedPopulation(units, "verdant", 4)).toBe(5);
  });

  it("admits exactly 60 committed population and rejects 61", () => {
    const snapshot = createFactionPopulationSnapshot([], "verdant", 58);
    expect(canCommitSandboxPopulation(snapshot, 2)).toBe(true);
    expect(canCommitSandboxPopulation(snapshot, 3)).toBe(false);
  });
});
