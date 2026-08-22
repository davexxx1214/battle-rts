import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { startSandboxBuildingConstruction } from "../../src/game/sandboxBattleTransactions";
import { enqueueSandboxBattleProduction } from "../../src/game/sandboxProductionTransactions";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BUILD_ANCHORS } from "../../src/map/sandboxLargeBattlefield";
import { SandboxCommandPanel } from "../../src/ui/SandboxCommandPanel";

describe("sandbox command panel", () => {
  it("shows the finite economy, population commitment, maintenance, and six buildings", () => {
    const markup = renderToStaticMarkup(createElement(SandboxCommandPanel, {
      battle: createInitialBattle({ modeId: "sandbox" }),
      selectedBuilding: "mine",
      onSelectBuilding: () => undefined,
      onEnqueueProduction: () => undefined,
    }));

    expect(markup).toContain('aria-label="沙盒指挥面板"');
    expect(markup).toContain("1000");
    expect(markup).toContain("0 + 0");
    expect(markup).toContain("100%");
    expect(markup).toContain("金矿");
    expect(markup).toContain("兵营");
    expect(markup).toContain("靶场");
    expect(markup).toContain("法师塔");
    expect(markup).toContain("攻城工坊");
    expect(markup).toContain("守卫塔");
    expect(markup.match(/aria-pressed=/g)).toHaveLength(6);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("点击地图放置");
    expect(markup.match(/data-unlocked="true"/g)).toHaveLength(2);
    expect(markup.match(/data-unlocked="false"/g)).toHaveLength(4);
    expect(markup.match(/ disabled/g)).toHaveLength(4);
    expect(markup).toContain("未解锁 · 需 兵营");
  });

  it("renders each real producer queue and its legal troop buttons", () => {
    let battle = constructBarracks(createInitialBattle({ modeId: "sandbox" }));
    battle = advanceSeconds(battle, 8);
    const enqueue = enqueueSandboxBattleProduction(battle, {
      faction: "verdant",
      buildingId: "verdant-barracks-1",
      troopKind: "spearman",
    });
    expect(enqueue.ok).toBe(true);
    if (!enqueue.ok) return;

    const markup = renderToStaticMarkup(createElement(SandboxCommandPanel, {
      battle: enqueue.battle,
      selectedBuilding: null,
      onSelectBuilding: () => undefined,
      onEnqueueProduction: () => undefined,
    }));

    expect(markup).toContain("生产队列");
    expect(markup).toContain("1/5");
    expect(markup).toContain("长枪兵");
    expect(markup).toContain("剑士");
    expect(markup).toContain("训练中");
    expect(markup).toContain("0 + 1");
    expect(markup).toContain("单次 1 个单位");
    expect(markup).toContain("完成后 used≥1");
    expect(markup).toContain("committed 2/100");
    expect(markup.match(/data-unlocked="true"/g)).toHaveLength(6);
    expect(markup).toContain("每栋独立训练 · 多栋并行");
    expect(markup).not.toContain(">弓箭手</span><strong>160 金");
  });

  it("uses the selected race presentation without changing rule slots", () => {
    const battle = createInitialBattle({
      modeId: "sandbox",
      factionRaces: { verdant: "undead", crimson: "human" },
    });
    const markup = renderToStaticMarkup(createElement(SandboxCommandPanel, {
      battle,
      selectedBuilding: null,
      disabled: true,
      onSelectBuilding: () => undefined,
      onEnqueueProduction: () => undefined,
    }));

    expect(markup).toContain("诅咒晶矿");
    expect(markup).toContain("墓穴兵营");
    expect(markup).toContain("骸骨弩场");
    expect(markup).toContain("亡魂塔");
    expect(markup.match(/ disabled/g)).toHaveLength(6);
  });
});

function constructBarracks(battle: BattleState): BattleState {
  const result = startSandboxBuildingConstruction(battle, {
    faction: "verdant",
    slot: "barracks",
    worldPosition: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant[0]!.coordinate),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.battle;
}

function advanceSeconds(battle: BattleState, seconds: number): BattleState {
  let next = battle;
  for (let step = 0; step < Math.round(seconds / 0.1); step += 1) {
    next = stepBattle(next, 0.1);
  }
  return next;
}
