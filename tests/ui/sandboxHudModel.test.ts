import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  createInitialBattle,
} from "../../src/game/battle";
import {
  createSandboxHudModel,
  nextIncomeThresholdLabel,
} from "../../src/ui/sandboxHudModel";

describe("sandbox HUD model", () => {
  it("exposes finite wallet, ore, upkeep, and ROI thresholds", () => {
    const model = createSandboxHudModel(createInitialBattle({ modeId: "sandbox" }));
    expect(model.gold).toBe(1_000);
    expect(model.goldCap).toBe(5_000);
    expect(model.totalRemainingOre).toBeGreaterThan(0);
    expect(model.grossPerCycle).toBe(100);
    expect(model.upkeepPerCycle).toBe(0);
    expect(model.netPerCycle).toBe(100);
    expect(model.roiOreThreshold).toBe(400);
  });

  it("describes both population downgrade thresholds", () => {
    expect(nextIncomeThresholdLabel(20)).toContain("1 人");
    expect(nextIncomeThresholdLabel(20)).toContain("80%");
    expect(nextIncomeThresholdLabel(40)).toContain("1 人");
    expect(nextIncomeThresholdLabel(40)).toContain("60%");
    expect(nextIncomeThresholdLabel(60)).toContain("最低");
  });

  it("uses the 400/500/667 ore break-even lines in all three income bands", () => {
    expect(modelAtPopulation(20).roiOreThreshold).toBe(400);
    expect(modelAtPopulation(21).roiOreThreshold).toBe(500);
    expect(modelAtPopulation(41).roiOreThreshold).toBe(667);
  });
});

function modelAtPopulation(population: number) {
  const units = Array.from({ length: population }, (_, index) => createBattleUnit({
    id: `hud-unit-${index}`,
    faction: "verdant",
    role: "spearman",
    squadId: `hud-squad-${index}`,
    position: { x: 0, z: 0 },
  }));
  return createSandboxHudModel(createBattleState(units, { modeId: "sandbox" }));
}
