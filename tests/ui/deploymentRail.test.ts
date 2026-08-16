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
  });
});
