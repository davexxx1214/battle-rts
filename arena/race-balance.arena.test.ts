import { expect, test } from "vitest";

import {
  getTroopBalanceProfiles,
  runBalanceArenaMatch,
} from "../src/game/balanceArena";
import { createArenaBattle } from "../src/game/arenaBattle";
import { stepBattle, type BattleState } from "../src/game/battle";
import { troopDesignForRace, type TroopKind } from "../src/game/rules";
import type { BattleRace, Faction } from "../src/game/types";

const TROOPS = ["spearman", "archer", "swordsman", "mage", "catapult"] as const;
const LANES = ["west", "east"] as const;
const RACES = ["human", "undead"] as const;

interface RaceScore {
  matches: number;
  wins: number;
  draws: number;
  spentGold: number;
  troopDamage: number;
  castleDamage: number;
  spawnedUnits: number;
  livingUnits: number;
}

test("compares undead and human per-100-gold scores in a mirrored tournament", () => {
  const scores = new Map<string, RaceScore>();
  let matchCount = 0;
  for (const humanKind of TROOPS) {
    for (const undeadKind of TROOPS) {
      for (const lane of LANES) {
        for (const undeadFaction of ["verdant", "crimson"] as const) {
          const humanFaction = oppositeFaction(undeadFaction);
          const result = runBalanceArenaMatch({
            verdant: undeadFaction === "verdant" ? undeadKind : humanKind,
            crimson: undeadFaction === "crimson" ? undeadKind : humanKind,
            factionRaces: {
              [undeadFaction]: "undead",
              [humanFaction]: "human",
            },
            initialGold: 1000,
            durationSeconds: 180,
            deploymentIntervalSeconds: 1,
            lane,
          });
          addResult(scores, "undead", undeadKind, undeadFaction, result);
          addResult(scores, "human", humanKind, humanFaction, result);
          matchCount += 1;
        }
      }
    }
  }

  console.log("\n配置侧每 100 金币能力：人类 vs 亡灵");
  console.table(RACES.flatMap((race) => getTroopBalanceProfiles(race).map((profile) => ({
    种族: raceLabel(race),
    兵团: troopDesignForRace(profile.kind, race).name,
    费用: profile.cost,
    数量: profile.squadSize,
    每百金币生命: profile.totalHealthPer100Gold,
    每百金币有效生命: profile.effectiveHealthPer100Gold,
    每百金币单体秒伤: profile.singleTargetDpsPer100Gold,
    攻击范围: profile.attackRange,
    溅射范围: profile.splashRadius,
  }))));

  const rows = RACES.flatMap((race) => TROOPS.map((kind) => {
    const score = requiredScore(scores, race, kind);
    const per100 = 100 / score.spentGold;
    return {
      种族: raceLabel(race),
      兵团: troopDesignForRace(kind, race).name,
      场次: score.matches,
      胜: score.wins,
      平: score.draws,
      胜率: round(score.wins / score.matches),
      每百金币单位伤害: round(score.troopDamage * per100),
      每百金币城堡伤害: round(score.castleDamage * per100),
      每百金币总伤害分: round((score.troopDamage + score.castleDamage) * per100),
      存活率: round(score.livingUnits / score.spawnedUnits),
    };
  }));
  console.log(`\n${matchCount} 场跨种族换边竞技结果`);
  console.table(rows);

  expect(matchCount).toBe(100);
  expect(rows).toHaveLength(10);
  expect(rows.every((row) => (
    Number.isFinite(row.每百金币总伤害分)
    && row.每百金币总伤害分 > 0
    && row.场次 === 20
  ))).toBe(true);
}, 120_000);

test("compares complete equal-value arena armies with a side swap", () => {
  const rows = (["verdant", "crimson"] as const).map((undeadFaction) => {
    const humanFaction = oppositeFaction(undeadFaction);
    const result = runMixedArmyMatch(undeadFaction);
    return {
      亡灵方位: undeadFaction,
      胜者: result.state.winner,
      亡灵单位伤害: round(result.unitDamage[undeadFaction]),
      人类单位伤害: round(result.unitDamage[humanFaction]),
      亡灵建筑伤害: round(result.buildingDamage[undeadFaction]),
      人类建筑伤害: round(result.buildingDamage[humanFaction]),
      亡灵存活数: result.state.units.filter((unit) => (
        unit.faction === undeadFaction && unit.health > 0
      )).length,
      人类存活数: result.state.units.filter((unit) => (
        unit.faction === humanFaction && unit.health > 0
      )).length,
    };
  });

  console.log("\n竞技场等价混合军团换边结果");
  console.table(rows);
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => (
    Number.isFinite(row.亡灵单位伤害)
    && Number.isFinite(row.人类单位伤害)
    && row.亡灵单位伤害 > 0
    && row.人类单位伤害 > 0
  ))).toBe(true);
  expect(new Set(rows.map((row) => row.胜者))).toEqual(new Set(["verdant", "crimson"]));
  expect(rows.every((row) => (
    Math.max(row.亡灵单位伤害, row.人类单位伤害)
      / Math.min(row.亡灵单位伤害, row.人类单位伤害) <= 1.25
  ))).toBe(true);
  expect(rows.every((row) => Math.abs(row.亡灵存活数 - row.人类存活数) <= 2)).toBe(true);
}, 120_000);

function runMixedArmyMatch(undeadFaction: Faction): {
  readonly state: BattleState;
  readonly unitDamage: Readonly<Record<Faction, number>>;
  readonly buildingDamage: Readonly<Record<Faction, number>>;
} {
  const factionRaces: Readonly<Record<Faction, BattleRace>> = undeadFaction === "verdant"
    ? { verdant: "undead", crimson: "human" }
    : { verdant: "human", crimson: "undead" };
  let state = createArenaBattle(factionRaces);
  const factionsByUnitId = new Map(state.units.map((unit) => [unit.id, unit.faction] as const));
  const buildingKindsById = new Map(state.buildings.map((building) => (
    [building.id, building.kind] as const
  )));
  const unitDamage = { verdant: 0, crimson: 0 };
  const buildingDamage = { verdant: 0, crimson: 0 };
  let lastSequence = -1;
  while (
    state.winner === null
    && (
      state.matchPolicy.durationSeconds === null
      || state.matchElapsed < state.matchPolicy.durationSeconds
    )
  ) {
    state = stepBattle(state, 0.05);
    for (const event of state.events) {
      if (event.sequence <= lastSequence || event.type !== "damage-applied") continue;
      const faction = factionsByUnitId.get(event.sourceId);
      if (!faction) continue;
      if (event.targetType === "unit") unitDamage[faction] += event.amount;
      else if (buildingKindsById.get(event.targetId) === "castle") {
        buildingDamage[faction] += event.amount;
      }
    }
    lastSequence = state.nextEventSequence - 1;
  }
  return { state, unitDamage, buildingDamage };
}

function addResult(
  scores: Map<string, RaceScore>,
  race: BattleRace,
  kind: TroopKind,
  faction: Faction,
  result: ReturnType<typeof runBalanceArenaMatch>,
): void {
  const key = scoreKey(race, kind);
  const current = scores.get(key) ?? {
    matches: 0,
    wins: 0,
    draws: 0,
    spentGold: 0,
    troopDamage: 0,
    castleDamage: 0,
    spawnedUnits: 0,
    livingUnits: 0,
  };
  current.matches += 1;
  current.wins += Number(result.winner === faction);
  current.draws += Number(result.winner === "draw");
  current.spentGold += result.spentGold[faction];
  current.troopDamage += result.troopDamage[faction];
  current.castleDamage += result.castleDamage[faction];
  current.spawnedUnits += result.spawnedUnits[faction];
  current.livingUnits += result.livingUnits[faction];
  scores.set(key, current);
}

function requiredScore(
  scores: ReadonlyMap<string, RaceScore>,
  race: BattleRace,
  kind: TroopKind,
): RaceScore {
  const score = scores.get(scoreKey(race, kind));
  if (!score) throw new Error(`Missing ${race} ${kind} tournament score.`);
  return score;
}

function scoreKey(race: BattleRace, kind: TroopKind): string {
  return `${race}:${kind}`;
}

function oppositeFaction(faction: Faction): Faction {
  return faction === "verdant" ? "crimson" : "verdant";
}

function raceLabel(race: BattleRace): string {
  return race === "human" ? "人类" : "亡灵";
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
