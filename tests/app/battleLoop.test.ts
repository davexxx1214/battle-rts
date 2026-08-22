import { describe, expect, it } from "vitest";

import {
  advanceBattleLoopClock,
  BATTLE_LOOP_MAX_CATCH_UP_STEPS,
  BATTLE_LOOP_MAX_ELAPSED_SECONDS,
  SIMULATION_STEP_SECONDS,
} from "../../src/app/battleLoop";

describe("battle loop clock", () => {
  it("accumulates timer polls into fixed simulation steps", () => {
    const first = advanceBattleLoopClock(0, SIMULATION_STEP_SECONDS / 2);
    expect(first).toEqual({
      steps: 0,
      accumulatorSeconds: SIMULATION_STEP_SECONDS / 2,
    });
    expect(advanceBattleLoopClock(
      first.accumulatorSeconds,
      SIMULATION_STEP_SECONDS / 2,
    )).toEqual({
      steps: 1,
      accumulatorSeconds: 0,
    });
  });

  it("bounds long stalls while preserving the fractional remainder", () => {
    const result = advanceBattleLoopClock(0.03, 10);
    expect(result.steps).toBe(BATTLE_LOOP_MAX_CATCH_UP_STEPS);
    expect(result.accumulatorSeconds).toBeCloseTo(0.03);
    expect(BATTLE_LOOP_MAX_ELAPSED_SECONDS).toBe(
      BATTLE_LOOP_MAX_CATCH_UP_STEPS * SIMULATION_STEP_SECONDS,
    );
  });

  it("ignores invalid or backwards elapsed time", () => {
    expect(advanceBattleLoopClock(Number.NaN, Number.NaN)).toEqual({
      steps: 0,
      accumulatorSeconds: 0,
    });
    expect(advanceBattleLoopClock(0.02, -1)).toEqual({
      steps: 0,
      accumulatorSeconds: 0.02,
    });
  });
});
