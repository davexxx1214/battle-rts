import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SandboxSquadCommandBar } from "../../src/ui/SandboxSquadCommandBar";
import { createBattleState, createBattleUnit } from "../../src/game/battle";

describe("sandbox squad command bar", () => {
  it("replaces the five-command row with one click-to-advance instruction", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      selectedCount: 3,
    }));

    expect(markup).toContain('aria-label="沙盒单位控制"');
    expect(markup).toContain("点击战场任意地点");
    expect(markup).toContain("自动索敌前进");
    expect(markup).toContain("遇敌先战斗");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("坚守");
  });

  it("prompts for a selection without showing disabled commands", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      selectedCount: 0,
    }));

    expect(markup).toContain("选择单位");
    expect(markup).toContain("点击己方单位");
    expect(markup).not.toContain("<button");
  });

  it("keeps the empty-army shortcut disabled and unpressed", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      battle: createBattleState([], { modeId: "sandbox" }),
      onSelectSquads: () => undefined,
    }));

    expect(markup).toContain('aria-label="选中所有我方部队，共 0 个"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('data-has-army="false"');
    expect(markup).toContain("disabled");
  });

  it("shows each independently controlled unit and its current order", () => {
    const unit = createBattleUnit({
      id: "unit-1",
      faction: "verdant",
      role: "spearman",
      squadId: "unit-1",
      position: { x: 0, z: 0 },
    });
    const battle = {
      ...createBattleState([unit], { modeId: "sandbox" }),
      squadOrders: {
        nextSequence: 2,
        ordersBySquadId: {
          "unit-1": {
            squadId: "unit-1",
            faction: "verdant" as const,
            sequence: 1,
            kind: "attack-move" as const,
            destination: { x: 1, z: 1 },
            target: null,
            holdPosition: null,
          },
        },
      },
    };
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      battle,
      selectedSquadIds: ["unit-1"],
    }));
    expect(markup).toContain("unit-1");
    expect(markup).toContain("索敌前进");
  });

  it("offers one-click selection for the whole army and each present troop type", () => {
    const units = [
      createBattleUnit({
        id: "spearman-a",
        faction: "verdant",
        role: "spearman",
        squadId: "spearman-a",
        position: { x: 0, z: 0 },
      }),
      createBattleUnit({
        id: "spearman-b",
        faction: "verdant",
        role: "spearman",
        squadId: "spearman-b",
        position: { x: 1, z: 0 },
      }),
      createBattleUnit({
        id: "swordsman-a",
        faction: "verdant",
        role: "knight",
        squadId: "swordsman-a",
        position: { x: 2, z: 0 },
      }),
      createBattleUnit({
        id: "enemy-mage",
        faction: "crimson",
        role: "mage",
        squadId: "enemy-mage",
        position: { x: 3, z: 0 },
      }),
    ];
    const battle = createBattleState(units, { modeId: "sandbox" });
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      battle,
      selectedSquadIds: ["spearman-a", "spearman-b"],
      onSelectSquads: () => undefined,
    }));

    expect(markup).toContain('aria-label="快速选择部队"');
    expect(markup).toContain('aria-label="选中所有我方部队，共 3 个"');
    expect(markup).toContain("全选部队");
    expect(markup).toContain("全选长枪兵");
    expect(markup).toContain("全选剑士");
    expect(markup).not.toContain("全选法师");
    expect(markup).toContain('data-has-army="true"');
    expect(markup).toContain("⚔");
    expect(markup).toContain('aria-pressed="true"');
  });
});
