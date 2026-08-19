import { expect, test } from "vitest";

import {
  getTroopBalanceProfiles,
  runBalanceArenaMatch,
} from "../src/game/balanceArena";
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
