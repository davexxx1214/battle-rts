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
    expect(markup.match(/<img /g)).toHaveLength(6);
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
});
