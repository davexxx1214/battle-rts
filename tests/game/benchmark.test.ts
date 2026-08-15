import { describe, expect, it } from "vitest";

import { FrameBenchmark } from "../../src/game/benchmark";

describe("frame benchmark", () => {
  it("reports median fps, one-percent low, and render counters after its window", () => {
    const benchmark = new FrameBenchmark(1);
    for (let index = 0; index < 100; index += 1) {
      benchmark.addFrame(index < 99 ? 10 : 40, { calls: 12, triangles: 3456 });
    }

    expect(benchmark.snapshot()).toEqual({
      complete: true,
      frames: 100,
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
