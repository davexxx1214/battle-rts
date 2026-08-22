import { describe, expect, it } from "vitest";

import {
  FrameBenchmark,
  benchmarkScenarioFromSearch,
  createBenchmarkBattle,
} from "../../src/game/benchmark";
import { sandboxUsedPopulation } from "../../src/game/population";
import { getBattlefieldCell, worldToAxial } from "../../src/map/battlefield";
import { battlefieldDefinitionFor } from "../../src/map/battlefieldDefinition";

describe("frame benchmark", () => {
  it("creates an explicit 80-unit scenario independent from the empty live match", () => {
    const battle = createBenchmarkBattle(80);

    expect(battle.units).toHaveLength(80);
    expect(battle.units.filter((unit) => unit.faction === "verdant")).toHaveLength(40);
    expect(battle.units.filter((unit) => unit.faction === "crimson")).toHaveLength(40);
    expect(battle.units.every((unit) => (
      getBattlefieldCell(worldToAxial(unit.position))?.walkable
    ))).toBe(true);
    expect(battle.units.every((unit) => unit.health === 1_000_000_000)).toBe(true);
    expect(battle.buildings.filter((building) => building.kind === "castle")
      .every((building) => building.health === 1_000_000_000)).toBe(true);
  });

  it.each([
    ["?benchmark=80", "legacy-80", "normal", 80],
    ["?benchmark=sandbox-100", "sandbox-100", "sandbox", 100],
    ["?benchmark=sandbox-200", "sandbox-200", "sandbox", 200],
  ] as const)("parses the supported %s scenario", (search, id, modeId, unitCount) => {
    expect(benchmarkScenarioFromSearch(search)).toMatchObject({ id, modeId, unitCount });
  });

  it("fails closed for absent and unknown benchmark requests", () => {
    expect(benchmarkScenarioFromSearch("")).toBeNull();
    expect(benchmarkScenarioFromSearch("?benchmark=871")).toBeNull();
  });

  it.each([100, 200])("creates a %i-entity sandbox render scenario", (unitCount) => {
    const battle = createBenchmarkBattle(unitCount, "sandbox");
    const map = battlefieldDefinitionFor(battle.mapId).map;

    expect(battle.modeId).toBe("sandbox");
    expect(battle.units).toHaveLength(unitCount);
    expect(battle.units.filter((unit) => unit.faction === "verdant"))
      .toHaveLength(unitCount / 2);
    expect(battle.units.filter((unit) => unit.faction === "crimson"))
      .toHaveLength(unitCount / 2);
    const expectedPopulation = unitCount === 100 ? 66 : 133;
    expect(sandboxUsedPopulation(battle.units, "verdant")).toBe(expectedPopulation);
    expect(sandboxUsedPopulation(battle.units, "crimson")).toBe(expectedPopulation);
    expect(battle.units.every((unit) => unit.squadId === unit.id)).toBe(true);
    expect(battle.units.every((unit) => (
      map.cells.some((cell) => (
        cell.q === worldToAxial(unit.position).q
        && cell.r === worldToAxial(unit.position).r
        && cell.walkable
      ))
    ))).toBe(true);
  });

  it("reports median fps, one-percent low, and render counters after its window", () => {
    const benchmark = new FrameBenchmark(1);
    for (let index = 0; index < 100; index += 1) {
      benchmark.addFrame(index < 99 ? 10 : 40, { calls: 12, triangles: 3456 });
    }

    expect(benchmark.snapshot()).toEqual({
      complete: true,
      frames: 100,
      averageFps: 97.1,
      medianFps: 100,
      onePercentLowFps: 25,
      drawCalls: 12,
      triangles: 3456,
    });
  });

  it("ignores invalid frame durations", () => {
    const benchmark = new FrameBenchmark(10);
    benchmark.addFrame(0, { calls: 1, triangles: 2 });
    benchmark.addFrame(Number.NaN, { calls: 1, triangles: 2 });
    expect(benchmark.snapshot().frames).toBe(0);
  });
});
