import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_GAME_MODE } from "../../src/app/gameMode";
import { GameModeSelector } from "../../src/ui/GameModeSelector";

describe("game mode selector", () => {
  it("defaults the combined game entry to normal mode", () => {
    expect(DEFAULT_GAME_MODE).toBe("normal");
  });

  it("presents normal mode as the default selected option", () => {
    const markup = renderToStaticMarkup(createElement(GameModeSelector, {
      mode: "normal",
      onChange: () => undefined,
    }));

    expect(markup).toContain("普通模式");
    expect(markup).toContain("竞技场模式");
    expect(markup).toContain('aria-label="游戏模式"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup.indexOf("普通模式")).toBeLessThan(markup.indexOf("竞技场"));
  });
});
