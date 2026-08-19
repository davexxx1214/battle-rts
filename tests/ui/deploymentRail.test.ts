import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createInitialBattle } from "../../src/game/battle";
import { DeploymentRail } from "../../src/ui/DeploymentRail";

describe("deployment rail", () => {
  it("lists combat units before military facilities", () => {
    const markup = renderToStaticMarkup(createElement(DeploymentRail, {
      session: { phase: "engaged", battle: createInitialBattle() },
      selectedKind: null,
      onSelect: () => undefined,
    }));

    expect(markup.indexOf("作战单位")).toBeLessThan(markup.indexOf("建筑工事"));
    expect(markup.match(/<img /g)).toHaveLength(8);
    expect(markup).toContain("长枪兵");
    expect(markup).toContain("箭塔");
    expect(markup).not.toContain(">⚔<");
    expect(markup).not.toContain(">➶<");
  });

  it("marks the full-gold reminder as active while the account stays capped", () => {
    const battle = createInitialBattle();
    const fullBattle = {
      ...battle,
      economy: {
        ...battle.economy,
        accounts: {
          ...battle.economy.accounts,
          verdant: {
            ...battle.economy.accounts.verdant,
            gold: 1000,
            isFull: true,
            fullPromptSequence: 1,
          },
        },
      },
    };
    const markup = renderToStaticMarkup(createElement(DeploymentRail, {
      session: { phase: "engaged", battle: fullBattle },
      selectedKind: null,
      onSelect: () => undefined,
    }));

    expect(markup).toContain('data-full="true"');
    expect(markup).toContain("金币已满，立即部署！");
    expect(markup).toContain("储备已封顶");
  });

  it("only presents deployables allowed by a campaign mission", () => {
    const markup = renderToStaticMarkup(createElement(DeploymentRail, {
      session: { phase: "engaged", battle: createInitialBattle() },
      selectedKind: null,
      allowedKinds: ["spearman", "archer"],
      onSelect: () => undefined,
    }));

    expect(markup.match(/<img /g)).toHaveLength(2);
    expect(markup).toContain("长枪兵");
    expect(markup).toContain("弓箭手");
    expect(markup).not.toContain("建筑工事");
    expect(markup).not.toContain("剑士");
  });

  it("presents the selected player race's troop identities and squad sizes", () => {
    const markup = renderToStaticMarkup(createElement(DeploymentRail, {
      session: {
        phase: "engaged",
        battle: createInitialBattle({
          factionRaces: { verdant: "undead", crimson: "human" },
        }),
      },
      selectedKind: null,
      onSelect: () => undefined,
    }));

    expect(markup).toContain("骸骨先锋");
    expect(markup).toContain("冰霜骨龙");
    expect(markup).toContain("魂火尖塔");
    expect(markup).toContain("诅咒晶矿");
    expect(markup).toContain("墓穴兵营");
    expect(markup).toContain("每 12 秒召唤 墓穴卫士");
    expect(markup).toContain("召唤 墓穴卫士");
    expect(markup).toContain("×5");
    expect(markup).toContain("×1");
    expect(markup).toContain(">700</b>");
    expect(new Set(
      markup.match(/\/assets\/ui\/deployables\/undead\/[^"]+\.png/g),
    ).size).toBe(8);
    expect(markup).not.toContain(">长枪兵<");
    expect(markup).not.toContain(">兵营<");
  });
});
