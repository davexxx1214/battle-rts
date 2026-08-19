import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createFactionRaces } from "../../src/game/factions";
import { FactionRaceSelector } from "../../src/ui/FactionRaceSelector";

describe("faction race selector", () => {
  it("renders independent player and enemy race controls", () => {
    const markup = renderToStaticMarkup(createElement(FactionRaceSelector, {
      factionRaces: createFactionRaces({ verdant: "undead", crimson: "human" }),
      onChange: () => undefined,
    }));

    expect(markup).toContain('aria-label="双方种族"');
    expect(markup).toContain('aria-label="我方种族"');
    expect(markup).toContain('aria-label="敌方种族"');
    expect(markup.match(/>人类<\/button>/g)).toHaveLength(2);
    expect(markup.match(/>亡灵<\/button>/g)).toHaveLength(2);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it("locks both selectors after the battle starts", () => {
    const markup = renderToStaticMarkup(createElement(FactionRaceSelector, {
      disabled: true,
      factionRaces: createFactionRaces(),
      onChange: () => undefined,
    }));

    expect(markup.match(/ disabled=""/g)).toHaveLength(4);
  });
});
