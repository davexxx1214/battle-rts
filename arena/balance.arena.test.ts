import { expect, test } from "vitest";

import {
  getTroopBalanceProfiles,
  runBalanceArenaMatch,
  summarizeBalanceArena,
  type BalanceArenaMatchResult,
} from "../src/game/balanceArena";
import { GAME_RULES, type TroopKind } from "../src/game/rules";

const TROOPS = ["archer", "swordsman", "mage", "catapult"] as const;
const LANES = ["west", "east"] as const;
const MAX_GOLD_EFFICIENCY_SPREAD = 1.2;

test("runs the mirrored troop balance tournament", () => {
  const results: BalanceArenaMatchResult[] = [];
  for (const verdant of TROOPS) {
    for (const crimson of TROOPS) {
      for (const lane of LANES) {
        results.push(runBalanceArenaMatch({
          verdant,
          crimson,
          initialGold: 1000,
          durationSeconds: 180,
          deploymentIntervalSeconds: 1,
          lane,
        }));
      }
    }
  }

  console.log("\n配置侧每 100 金币能力（范围与溅射需结合实战表判断）");
  console.table(getTroopBalanceProfiles().map((profile) => ({
    兵团: troopLabel(profile.kind),
    费用: profile.cost,
    数量: profile.squadSize,
    相对最低费用额外等待秒数: profile.additionalRecoveryWaitSeconds,
    攻击范围: profile.attackRange,
    溅射范围: profile.splashRadius,
    减伤百分比: profile.damageReductionPercent,
    每百金币生命: profile.totalHealthPer100Gold,
    每百金币有效生命: profile.effectiveHealthPer100Gold,
    每百金币单体秒伤: profile.singleTargetDpsPer100Gold,
  })));
  console.log("\n32 场换边竞技结果");
  const summaries = summarizeBalanceArena(results);
  console.table(summaries.map((summary) => ({
    兵团: troopLabel(summary.kind),
    场次: summary.matches,
    胜: summary.wins,
    平: summary.draws,
    负: summary.losses,
    总花费: summary.spentGold,
    每百金币单位伤害: summary.troopDamagePer100Gold,
    每百金币城堡伤害: summary.castleDamagePer100Gold,
    每百金币总伤害: summary.totalDamagePer100Gold,
    存活率: summary.survivalRate,
  })));

  expect(results).toHaveLength(TROOPS.length * TROOPS.length * LANES.length);
  expect(results.every((result) => (
    result.spentGold.verdant > 0
    && result.spentGold.crimson > 0
    && Number.isFinite(result.troopDamage.verdant)
    && Number.isFinite(result.troopDamage.crimson)
  ))).toBe(true);
  const efficiencyByCost = new Map<number, number[]>();
  for (const summary of summaries) {
    const cost = GAME_RULES.deployment.costs[summary.kind];
    efficiencyByCost.set(cost, [
      ...(efficiencyByCost.get(cost) ?? []),
      summary.totalDamagePer100Gold,
    ]);
  }
  const efficiencyTiers = [...efficiencyByCost.entries()]
    .sort(([firstCost], [secondCost]) => firstCost - secondCost)
    .map(([cost, efficiencies]) => ({
      cost,
      average: efficiencies.reduce((total, efficiency) => total + efficiency, 0)
        / efficiencies.length,
    }));
  for (let index = 1; index < efficiencyTiers.length; index += 1) {
    expect(efficiencyTiers[index]!.average)
      .toBeGreaterThan(efficiencyTiers[index - 1]!.average);
  }
  const troopEfficiencies = summaries.map((summary) => summary.totalDamagePer100Gold);
  expect(Math.max(...troopEfficiencies) / Math.min(...troopEfficiencies))
    .toBeLessThanOrEqual(MAX_GOLD_EFFICIENCY_SPREAD);
}, 120_000);

function troopLabel(kind: TroopKind): string {
  return {
    swordsman: "剑士",
    archer: "弓箭手",
    mage: "法师",
    catapult: "投石车",
  }[kind];
}
