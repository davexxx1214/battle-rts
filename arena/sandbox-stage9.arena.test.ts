import { expect, test } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../src/game/battle";
import { advanceBattleSession } from "../src/game/battleSession";
import { sandboxUsedPopulation } from "../src/game/population";
import { issueSandboxSquadOrder } from "../src/game/sandboxOrders";
import type { FactionRaces, UnitRole } from "../src/game/types";
import { battlefieldDefinitionFor } from "../src/map/battlefieldDefinition";
import { SANDBOX_LARGE_ROUTES } from "../src/map/sandboxLargeBattlefield";
import { DEFAULT_CAMERA_VIEW } from "../src/scene/camera/cameraViewStore";
import { createSandboxMinimapModel } from "../src/ui/minimap/minimapModel";
import { createMinimapProjection } from "../src/ui/minimap/minimapProjection";

interface PlaytestMilestones {
  firstMine: number | null;
  firstBasicTroop: number | null;
  firstAdvancedBuilding: number | null;
  firstAdvancedTroop: number | null;
  firstContact: number | null;
  firstNeutralMineContest: number | null;
  end: number | null;
}

interface StressResult {
  readonly entities: number;
  readonly populationPerFaction: number;
  readonly p95Milliseconds: number;
  readonly maximumMilliseconds: number;
  readonly heapGrowthMegabytesPerMinute: number | null;
  readonly maximumEventWindow: number;
  readonly minimapP95Milliseconds: number;
}

const ENDURANCE_SECONDS = 1_800;
const STRESS_SECONDS = 300;
const STEP_SECONDS = 0.1;

test("records three deterministic 30-minute sandbox soak timelines", () => {
  const scenarios: readonly {
    name: string;
    route: "center" | "west" | "east";
    races: FactionRaces;
  }[] = [
    {
      name: "human mirror / center",
      route: "center",
      races: { verdant: "human", crimson: "human" },
    },
    {
      name: "mirrored starts / west",
      route: "west",
      races: { verdant: "undead", crimson: "human" },
    },
    {
      name: "mirrored starts / east",
      route: "east",
      races: { verdant: "human", crimson: "undead" },
    },
  ];

  const rows = scenarios.map((scenario) => runEnduranceScenario(scenario));
  console.log("\n阶段 9 · 三场 30 分钟灰盒里程碑（模拟秒）");
  console.table(rows.map(({ name, milestones, ...rest }) => ({
    场景: name,
    首矿: milestones.firstMine,
    首基础兵: milestones.firstBasicTroop,
    首高级建筑: milestones.firstAdvancedBuilding,
    首高级兵: milestones.firstAdvancedTroop,
    首次接敌: milestones.firstContact,
    首次中立矿争夺: milestones.firstNeutralMineContest,
    结束: milestones.end,
    ...rest,
  })));

  for (const row of rows) {
    expect(row.milestones.firstMine).not.toBeNull();
    expect(row.milestones.firstBasicTroop).not.toBeNull();
    expect(row.milestones.firstAdvancedBuilding).not.toBeNull();
    expect(row.milestones.firstAdvancedTroop).not.toBeNull();
    expect(row.milestones.firstContact).not.toBeNull();
    expect(row.milestones.firstNeutralMineContest).not.toBeNull();
    expect(row.milestones.firstMine!).toBeLessThanOrEqual(6);
    expect(row.milestones.firstBasicTroop!).toBeLessThanOrEqual(30);
    expect(row.milestones.firstAdvancedBuilding!).toBeLessThanOrEqual(90);
    expect(row.milestones.firstAdvancedTroop!).toBeLessThanOrEqual(240);
    expect(row.milestones.firstContact!).toBeLessThanOrEqual(120);
    expect(row.milestones.firstNeutralMineContest!).toBeLessThanOrEqual(180);
    expect(row.milestones.end).toBeGreaterThanOrEqual(ENDURANCE_SECONDS);
    expect(row.winner).toBe("crimson");
    expect(row.resolutionReason).toBe("castle-destroyed");
    expect(row.maximumEventWindow).toBeLessThanOrEqual(2_048);
    expect(row.aiLedgerEntries).toBeLessThanOrEqual(512);
    expect(row.remainingOre).toBeGreaterThanOrEqual(0);
    expect(row.crimsonPopulation).toBeLessThanOrEqual(60);
  }
}, 240_000);

test("profiles sustained 100-entity and 200-entity sandbox battles", () => {
  const results = [100, 200].map(runStressScenario);
  console.log("\n阶段 9 · 大地图持续战斗性能");
  console.table(results.map((result) => ({
    实体数: result.entities,
    每方人口: result.populationPerFaction,
    模拟步P95毫秒: result.p95Milliseconds,
    最大模拟步毫秒: result.maximumMilliseconds,
    每分钟堆增长MB: result.heapGrowthMegabytesPerMinute,
    最大事件窗口: result.maximumEventWindow,
    小地图P95毫秒: result.minimapP95Milliseconds,
  })));

  expect(results[0]!.p95Milliseconds).toBeLessThanOrEqual(8);
  expect(results[0]!.maximumMilliseconds).toBeLessThanOrEqual(50);
  expect(results[1]!.p95Milliseconds).toBeLessThanOrEqual(16);
  expect(results[1]!.maximumMilliseconds).toBeLessThanOrEqual(50);
  expect(results.every((result) => result.maximumEventWindow <= 2_048)).toBe(true);
  expect(results.every((result) => result.minimapP95Milliseconds <= 3)).toBe(true);
  for (const result of results) {
    if (result.heapGrowthMegabytesPerMinute !== null) {
      expect(result.heapGrowthMegabytesPerMinute).toBeLessThanOrEqual(10);
    }
  }
}, 240_000);

function runEnduranceScenario(scenario: {
  readonly name: string;
  readonly route: "center" | "west" | "east";
  readonly races: FactionRaces;
}) {
  let battle = createEnduranceBattle(scenario.route, scenario.races);
  const milestones: PlaytestMilestones = {
    firstMine: null,
    firstBasicTroop: null,
    firstAdvancedBuilding: null,
    firstAdvancedTroop: null,
    firstContact: null,
    firstNeutralMineContest: null,
    end: null,
  };
  let maximumEventWindow = 0;
  observeMilestones(battle, milestones);
  for (let second = 0; second < ENDURANCE_SECONDS; second += 1) {
    battle = advanceBattleSession(battle, "engaged", 10, STEP_SECONDS, "normal");
    maximumEventWindow = Math.max(maximumEventWindow, battle.events.length);
    observeMilestones(battle, milestones);
    if (battle.winner !== null) {
      throw new Error(`${scenario.name} ended before the 30-minute endurance gate.`);
    }
  }

  battle = {
    ...battle,
    buildings: battle.buildings.map((building) => (
      building.kind === "castle" && building.faction === "verdant"
        ? {
            ...building,
            health: 0,
            status: "destroyed" as const,
            diedAt: battle.elapsed,
            removeAt: battle.elapsed + 2,
          }
        : building
    )),
  };
  battle = stepBattle(battle, STEP_SECONDS);
  milestones.end = round(battle.matchElapsed);

  return {
    name: scenario.name,
    milestones,
    winner: battle.winner,
    resolutionReason: battle.resolutionReason,
    crimsonPopulation: sandboxUsedPopulation(battle.units, "crimson"),
    remainingOre: Object.values(battle.mining?.pitsById ?? {})
      .reduce((sum, pit) => sum + pit.remainingOre, 0),
    aiLedgerEntries: battle.sandboxAi?.ledger.length ?? 0,
    maximumEventWindow,
  };
}

function createEnduranceBattle(
  routeId: "center" | "west" | "east",
  races: FactionRaces,
): BattleState {
  const route = SANDBOX_LARGE_ROUTES.find((candidate) => candidate.id === routeId)!;
  const centerIndex = Math.floor(route.referencePath.length / 2);
  const defenderCells = route.referencePath.slice(
    Math.max(0, centerIndex - 5),
    centerIndex + 5,
  );
  const role: UnitRole = races.verdant === "undead" ? "knight" : "spearman";
  const defenders = defenderCells.map((cell, index) => {
    const unit = createBattleUnit({
      id: `endurance-${routeId}-defender-${index + 1}`,
      squadId: `endurance-${routeId}-squad-${Math.floor(index / 2) + 1}`,
      faction: "verdant",
      role,
      combatProfile: races.verdant,
      position: {
        x: 2 * cell.q + cell.r,
        z: Math.sqrt(3) * cell.r,
      },
    });
    return { ...unit, maxHealth: 1_000_000_000, health: 1_000_000_000 };
  });
  let battle = createBattleState(defenders, { modeId: "sandbox", factionRaces: races });
  battle = {
    ...battle,
    buildings: battle.buildings.map((building) => building.kind === "castle"
      ? { ...building, maxHealth: 1_000_000_000, health: 1_000_000_000 }
      : building),
  };
  const hold = issueSandboxSquadOrder(battle, {
    faction: "verdant",
    squadIds: battle.units
      .filter((unit) => unit.faction === "verdant")
      .map((unit) => unit.squadId),
    kind: "hold",
  });
  if (!hold.ok) throw new Error(`Could not prepare endurance defenders: ${hold.reason}`);
  return hold.battle;
}

function observeMilestones(
  battle: BattleState,
  milestones: PlaytestMilestones,
): void {
  const ledger = battle.sandboxAi?.ledger ?? [];
  const firstSuccessful = (predicate: (entry: typeof ledger[number]) => boolean) => (
    ledger.find((entry) => entry.outcome === "succeeded" && predicate(entry))?.decidedAt ?? null
  );
  milestones.firstMine ??= firstSuccessful((entry) => entry.action === "construct-mine");
  milestones.firstAdvancedBuilding ??= firstSuccessful((entry) => (
    entry.action === "construct-building"
    && ["archery-range", "mage-tower", "siege-workshop"].includes(entry.subjectId)
  ));

  const crimsonUnits = battle.units.filter((unit) => (
    unit.faction === "crimson" && unit.health > 0 && unit.status !== "dead"
  ));
  if (milestones.firstBasicTroop === null && crimsonUnits.some((unit) => (
    unit.role === "spearman" || unit.role === "knight"
  ))) milestones.firstBasicTroop = round(battle.matchElapsed);
  if (milestones.firstAdvancedTroop === null && crimsonUnits.some((unit) => (
    unit.role === "ranger"
    || unit.role === "mage"
    || unit.role === "catapult"
    || unit.role === "bone-dragon"
  ))) milestones.firstAdvancedTroop = round(battle.matchElapsed);

  if (milestones.firstContact === null && battle.events.some((event) => (
    event.type === "damage-applied" && event.sourceRole !== "castle"
  ))) milestones.firstContact = round(battle.matchElapsed);
  if (milestones.firstNeutralMineContest === null && Object.values(
    battle.mining?.pitsById ?? {},
  ).some((pit) => (
    pit.controller === "crimson" && pit.id.startsWith("N-")
  ))) milestones.firstNeutralMineContest = round(battle.matchElapsed);
}

function runStressScenario(totalEntities: number): StressResult {
  let battle = createStressBattle(totalEntities);
  for (let index = 0; index < 50; index += 1) {
    battle = advanceBattleSession(battle, "engaged", 1, STEP_SECONDS, "normal");
  }

  const gc = (globalThis as { gc?: () => void }).gc;
  const runtimeProcess = (globalThis as unknown as {
    process?: { memoryUsage: () => { heapUsed: number } };
  }).process;
  gc?.();
  const heapBefore = gc && runtimeProcess ? runtimeProcess.memoryUsage().heapUsed : null;
  const durations: number[] = [];
  let maximumEventWindow = battle.events.length;
  const steps = Math.round(STRESS_SECONDS / STEP_SECONDS);
  for (let index = 0; index < steps; index += 1) {
    const startedAt = performance.now();
    battle = advanceBattleSession(battle, "engaged", 1, STEP_SECONDS, "normal");
    durations.push(performance.now() - startedAt);
    maximumEventWindow = Math.max(maximumEventWindow, battle.events.length);
  }
  gc?.();
  const heapGrowthMegabytesPerMinute = heapBefore === null
    ? null
    : Math.max(0, runtimeProcess!.memoryUsage().heapUsed - heapBefore)
      / 1024
      / 1024
      / (STRESS_SECONDS / 60);

  const definition = battlefieldDefinitionFor(battle.mapId);
  const projection = createMinimapProjection(definition.worldBounds);
  const minimapDurations = Array.from({ length: 1_000 }, () => {
    const startedAt = performance.now();
    createSandboxMinimapModel(battle, definition, DEFAULT_CAMERA_VIEW, projection);
    return performance.now() - startedAt;
  });

  return {
    entities: totalEntities,
    populationPerFaction: sandboxUsedPopulation(battle.units, "verdant"),
    p95Milliseconds: percentile(durations, 0.95),
    maximumMilliseconds: Math.max(...durations),
    heapGrowthMegabytesPerMinute: heapGrowthMegabytesPerMinute === null
      ? null
      : round(heapGrowthMegabytesPerMinute),
    maximumEventWindow,
    minimapP95Milliseconds: percentile(minimapDurations, 0.95),
  };
}

function createStressBattle(totalEntities: number): BattleState {
  const perFaction = Math.min(totalEntities / 2, 60);
  if (!Number.isInteger(perFaction)) throw new Error("Stress entity count must be even.");
  const units = (["verdant", "crimson"] as const).flatMap((faction) => (
    Array.from({ length: perFaction }, (_, index) => {
      const row = Math.floor(index / 10);
      const column = index % 10;
      const side = faction === "verdant" ? 1 : -1;
      const unit = createBattleUnit({
        id: `stress-${faction}-${index + 1}`,
        squadId: `stress-${faction}-${Math.floor(index / 5) + 1}`,
        faction,
        role: "spearman",
        position: {
          x: side * (0.7 + column * 0.08),
          z: (row - Math.floor(perFaction / 20)) * 0.42,
        },
      });
      return { ...unit, maxHealth: 1_000_000, health: 1_000_000 };
    })
  ));
  const neutralCount = totalEntities - units.length;
  const neutralMonsters = Array.from({ length: neutralCount }, (_, index) => {
    const row = Math.floor(index / 10);
    const column = index % 10;
    const position = {
      x: (column - 4.5) * 0.18,
      z: (row - Math.floor(neutralCount / 20)) * 0.36,
    };
    const unit = createBattleUnit({
      id: `stress-neutral-${index + 1}`,
      squadId: `stress-neutral-${Math.floor(index / 5) + 1}`,
      faction: "neutral" as const,
      role: "spearman",
      combatProfile: "neutral-skeleton",
      neutralKind: "skeleton",
      position,
      guardAnchor: position,
      guardLeashCenter: position,
      guardRadiusCells: 20,
    });
    return { ...unit, maxHealth: 1_000_000, health: 1_000_000 };
  });
  const battle = createBattleState(units, { modeId: "sandbox" });
  return { ...battle, neutralMonsters };
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return round(sorted[Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * percentileValue),
  )] ?? 0);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
