import {
  battleBuildingConstructionPhaseAt,
  type BattleBuilding,
} from "../../game/buildings";
import type { BattleEvent } from "../../game/events";
import { barracksRulesForRace, GAME_RULES } from "../../game/rules";
import { sandboxTroopSpec } from "../../game/sandboxCatalog";
import {
  sandboxProductionQueueFor,
  type SandboxProductionState,
} from "../../game/sandboxProductionQueue";
import type { BattleRace } from "../../game/types";

export type BuildingHealthTone = "healthy" | "warning" | "critical";
export type BuildingLifecyclePresentation = "constructing" | "active" | "destroying";
export type BuildingSignalKind =
  | "deploy"
  | "gold"
  | "gold-wasted"
  | "spawn"
  | "destroy"
  | "castle-active";

export interface BuildingPresentation {
  readonly healthRatio: number;
  readonly healthTone: BuildingHealthTone;
  readonly lifecycle: BuildingLifecyclePresentation;
  readonly constructionProgress: number;
  readonly destructionProgress: number;
  readonly productionProgress: number | null;
  readonly kingVisible: boolean;
}

interface BuildingSignalBase {
  readonly sequence: number;
  readonly age: number;
}

export type BuildingSignalPayload =
  | {
      readonly kind: "gold" | "gold-wasted";
      readonly producedAmount: number;
      readonly creditedAmount: number;
      readonly wastedAmount: number;
    }
  | {
      readonly kind: Exclude<BuildingSignalKind, "gold" | "gold-wasted">;
    };

export type BuildingSignal = BuildingSignalBase & BuildingSignalPayload;

const SIGNAL_SECONDS = 1.2;

export const BUILDING_HEALTH_BAR_LAYERS = {
  frame: {
    renderOrder: 120,
    material: { transparent: true, depthTest: false, depthWrite: false },
  },
  track: {
    renderOrder: 121,
    material: { transparent: true, depthTest: false, depthWrite: false },
  },
  fill: {
    renderOrder: 122,
    material: { transparent: true, depthTest: false, depthWrite: false },
  },
} as const;

export function buildingPresentation(
  building: BattleBuilding,
  elapsed: number,
  race: BattleRace = "human",
  sandboxProduction: SandboxProductionState | null = null,
): BuildingPresentation {
  const healthRatio = clamp01(building.health / building.maxHealth);
  const constructionPhase = battleBuildingConstructionPhaseAt(building, elapsed);
  const constructionCompletedAt = Number.isFinite(building.constructionCompletedAt)
    ? building.constructionCompletedAt
    : building.createdAt;
  return {
    healthRatio,
    healthTone: healthRatio > 0.55
      ? "healthy"
      : healthRatio > 0.3 ? "warning" : "critical",
    lifecycle: constructionPhase === "destroyed"
      ? "destroying"
      : constructionPhase === "constructing" ? "constructing" : "active",
    constructionProgress: constructionPhase === "constructing"
      ? clamp01(
          (elapsed - building.createdAt)
          / Math.max(0.001, constructionCompletedAt - building.createdAt),
        )
      : 1,
    destructionProgress: destructionProgress(building, elapsed),
    productionProgress: productionProgress(
      building,
      elapsed,
      race,
      sandboxProduction,
    ),
    kingVisible: building.kind === "castle"
      && building.castleCombat?.activatedAt !== null,
  };
}

export function latestBuildingSignal(
  building: BattleBuilding,
  elapsed: number,
  events: readonly BattleEvent[],
): BuildingSignal | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    const age = elapsed - event.time;
    if (age < 0 || age > SIGNAL_SECONDS) continue;
    const signal = signalForBuilding(event, building.id);
    if (signal) return {
      ...signal,
      sequence: event.sequence,
      age: Number(age.toFixed(9)),
    };
  }
  return null;
}

function productionProgress(
  building: BattleBuilding,
  elapsed: number,
  race: BattleRace,
  sandboxProduction: SandboxProductionState | null,
): number | null {
  if (
    building.kind === "castle"
    || building.kind === "arrow-tower"
    || building.kind === "guard-tower"
    || building.status !== "active"
    || battleBuildingConstructionPhaseAt(building, elapsed) !== "operational"
  ) return null;
  if (
    building.kind === "barracks"
    || building.kind === "archery-range"
    || building.kind === "mage-tower"
    || building.kind === "siege-workshop"
  ) {
    if (sandboxProduction !== null) {
      const queue = sandboxProductionQueueFor(sandboxProduction, building.id);
      if (
        !queue
        || queue.faction !== building.faction
        || queue.producer !== building.kind
      ) return null;
      const head = queue.entries[0];
      if (!head) return null;
      if (head.status === "ready-blocked") return 1;
      return clamp01(
        head.trainingProgressSeconds
        / Math.max(0.001, sandboxTroopSpec(head.troopKind).trainingSeconds),
      );
    }
    // These kinds do not exist in legacy modes. Without an authoritative
    // sandbox queue they must not inherit the legacy barracks auto-spawn clock.
    if (building.kind !== "barracks") return null;
  }
  const barracksRules = barracksRulesForRace(race);
  const config = building.kind === "gold-mine"
    ? {
        first: GAME_RULES.buildings.goldMine.firstProductionSeconds,
        interval: GAME_RULES.buildings.goldMine.productionIntervalSeconds,
        maximum: Number.POSITIVE_INFINITY,
      }
    : {
        first: barracksRules.firstSpawnSeconds,
        interval: barracksRules.spawnIntervalSeconds,
        maximum: barracksRules.spawnCount,
      };
  if (building.productionSequence >= config.maximum) return null;
  const constructionCompletedAt = Number.isFinite(building.constructionCompletedAt)
    ? building.constructionCompletedAt
    : building.createdAt;
  const nextAt = constructionCompletedAt
    + config.first
    + building.productionSequence * config.interval;
  const cycleStart = building.productionSequence === 0
    ? constructionCompletedAt
    : nextAt - config.interval;
  return clamp01((elapsed - cycleStart) / Math.max(0.001, nextAt - cycleStart));
}

function signalForBuilding(
  event: BattleEvent,
  buildingId: string,
): BuildingSignalPayload | null {
  if (
    event.type === "deployment-succeeded"
    && event.entityType === "building"
    && event.buildingId === buildingId
  ) {
    return { kind: "deploy" };
  }
  if (event.type === "building-gold-produced" && event.buildingId === buildingId) {
    return {
      kind: event.creditedAmount > 0 ? "gold" : "gold-wasted",
      producedAmount: event.producedAmount,
      creditedAmount: event.creditedAmount,
      wastedAmount: event.wastedAmount,
    };
  }
  if (event.type === "building-unit-spawned" && event.buildingId === buildingId) {
    return { kind: "spawn" };
  }
  if (event.type === "building-destroyed" && event.buildingId === buildingId) {
    return { kind: "destroy" };
  }
  if (event.type === "castle-activated" && event.castleId === buildingId) {
    return { kind: "castle-active" };
  }
  return null;
}

function destructionProgress(building: BattleBuilding, elapsed: number): number {
  if (building.status !== "destroyed") return 0;
  if (building.diedAt === null || building.removeAt === null) return 1;
  return clamp01(
    (elapsed - building.diedAt) / Math.max(0.001, building.removeAt - building.diedAt),
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
