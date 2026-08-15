export interface RenderCounters {
  readonly calls: number;
  readonly triangles: number;
}

export interface BenchmarkSnapshot {
  readonly complete: boolean;
  readonly frames: number;
  readonly medianFps: number;
  readonly onePercentLowFps: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

export class FrameBenchmark {
  readonly #windowMilliseconds: number;
  readonly #frameTimes: number[] = [];
  #elapsedMilliseconds = 0;
  #counters: RenderCounters = { calls: 0, triangles: 0 };

  constructor(windowSeconds = 10) {
    this.#windowMilliseconds = Math.max(0.1, windowSeconds) * 1000;
  }

  addFrame(milliseconds: number, counters: RenderCounters): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0 || this.complete) return;
    this.#frameTimes.push(milliseconds);
    this.#elapsedMilliseconds += milliseconds;
    this.#counters = counters;
  }

  get complete(): boolean {
    return this.#elapsedMilliseconds >= this.#windowMilliseconds;
  }

  snapshot(): BenchmarkSnapshot {
    const sorted = [...this.#frameTimes].sort((first, second) => first - second);
    const medianIndex = Math.floor((sorted.length - 1) / 2);
    const lowCount = Math.max(1, Math.ceil(sorted.length * 0.01));
    const slowest = sorted.slice(-lowCount);
    const lowFrameTime = slowest.length > 0
      ? slowest.reduce((total, value) => total + value, 0) / slowest.length
      : 0;
    return {
      complete: this.complete,
      frames: sorted.length,
      medianFps: sorted.length > 0 ? round(1000 / sorted[medianIndex]!) : 0,
      onePercentLowFps: lowFrameTime > 0 ? round(1000 / lowFrameTime) : 0,
      drawCalls: this.#counters.calls,
      triangles: this.#counters.triangles,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
