import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createInitialBattle, stepBattle, type BattleState } from "../../src/game/battle";
import { startSandboxBuildingConstruction } from "../../src/game/sandboxBattleTransactions";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BUILD_ANCHORS } from "../../src/map/sandboxLargeBattlefield";
import { SandboxActionDock } from "../../src/ui/SandboxActionDock";

describe("sandbox action dock", () => {
  it("shows one compact row containing all buildings and troops", () => {
    const markup = renderDock(createInitialBattle({ modeId: "sandbox" }));

    expect(markup).toContain('aria-label="沙盒快捷建造与生产栏"');
    expect(markup).toContain("点击选择 · 向上拖到战场");
    expect(markup.match(/data-category="building"/g)).toHaveLength(6);
    expect(markup.match(/data-category="troop"/g)).toHaveLength(5);
    expect(markup).toContain("金矿");
    expect(markup).toContain("兵营");
    expect(markup).toContain("弓箭手");
    expect(markup).toContain("投石车");
    expect(markup).toContain('/assets/ui/deployables/gold-mine.png');
    expect(markup).toContain('/assets/ui/deployables/spearman.png');
  });

  it("greys out locked buildings and troops without an operational producer", () => {
    const markup = renderDock(createInitialBattle({ modeId: "sandbox" }));

    expect(markup.match(/ disabled/g)).toHaveLength(9);
    expect(markup).toContain("靶场未解锁");
    expect(markup).toContain("长枪兵未解锁");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("enables barracks troops after construction finishes", () => {
    const battle = advanceSeconds(constructBarracks(
      createInitialBattle({ modeId: "sandbox" }),
    ), 8);
    const markup = renderDock(battle);

    expect(markup).toContain("长枪兵：点击训练，或拖到战场训练并设置集结点");
    expect(markup).toContain("剑士：点击训练，或拖到战场训练并设置集结点");
    expect(markup).toContain('aria-label="长枪兵，100 金币，现有 0 个"');
  });
});

function renderDock(battle: BattleState): string {
  return renderToStaticMarkup(createElement(SandboxActionDock, {
    battle,
    selectedBuilding: "mine",
    onSelectBuilding: () => undefined,
    onEnqueueTroop: () => undefined,
    onDragAction: () => undefined,
  }));
}

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
