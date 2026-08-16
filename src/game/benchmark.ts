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

export function createBenchmarkBattle(unitCount = 80): BattleState {
  if (!Number.isInteger(unitCount) || unitCount <= 0) {
    throw new Error("Benchmark unitCount must be a positive integer.");
  }
  const verdantCount = Math.ceil(unitCount / 2);
  const crimsonCount = unitCount - verdantCount;
  return createBattleState([
    ...createBenchmarkFaction("verdant", verdantCount),
    ...createBenchmarkFaction("crimson", crimsonCount),
  ]);
}

function createBenchmarkFaction(faction: Faction, count: number) {
  const roles: readonly UnitRole[] = ["knight", "ranger", "mage", "catapult"];
  const cells = BATTLEFIELD_MAP.cells.filter((cell) => (
    cell.territory === faction && cell.walkable
  ));
  if (cells.length === 0) {
    throw new Error(`Benchmark map has no walkable ${faction} cells.`);
  }
  return Array.from({ length: count }, (_, index) => {
    const cell = cells[index % cells.length]!;
    const center = axialToWorld(cell);
    const layer = Math.floor(index / cells.length);
    const angle = (index % 6) * Math.PI / 3;
    const offset = layer === 0 ? 0 : Math.min(0.32, 0.12 + layer * 0.06);
    return createBattleUnit({
      id: `benchmark-${faction}-${index + 1}`,
      squadId: `benchmark-${faction}-${roles[index % roles.length]}`,
      faction,
      role: roles[index % roles.length]!,
      position: {
        x: center.x + Math.cos(angle) * offset,
        z: center.z + Math.sin(angle) * offset,
      },
    });
  });
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
import { createBattleState, createBattleUnit, type BattleState } from "./battle";
import type { Faction, UnitRole } from "./types";
import { BATTLEFIELD_MAP, axialToWorld } from "../map/battlefield";
