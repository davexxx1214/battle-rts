import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAME_MODE,
  hasUndeadOpponent,
  requiresSceneAssetReload,
} from "../../src/app/gameMode";
import { GameModeSelector } from "../../src/ui/GameModeSelector";

describe("game mode selector", () => {
  it("defaults the combined game entry to free battle mode", () => {
    expect(DEFAULT_GAME_MODE).toBe("normal");
  });

  it("presents free battle as the default while keeping the campaign entry", () => {
    const markup = renderToStaticMarkup(createElement(GameModeSelector, {
      mode: "normal",
      onChange: () => undefined,
    }));

    expect(markup).toContain("战役模式");
    expect(markup).toContain("自由对战");
    expect(markup).toContain("人类对亡灵");
    expect(markup).toContain("竞技场模式");
    expect(markup).toContain('aria-label="游戏模式"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toMatch(/自由对战<\/button>/);
    expect(markup.indexOf("战役模式")).toBeLessThan(markup.indexOf("自由对战"));
  });

  it("exposes a dedicated human-versus-undead battlefield option", () => {
    expect(hasUndeadOpponent("undead")).toBe(true);
    expect(hasUndeadOpponent("normal")).toBe(false);
    expect(hasUndeadOpponent("campaign")).toBe(false);
  });

  it("only reloads scene assets when entering a newly mounted battlefield", () => {
    expect(requiresSceneAssetReload("normal", "arena", false)).toBe(false);
    expect(requiresSceneAssetReload("arena", "normal", false)).toBe(false);
    expect(requiresSceneAssetReload("campaign", "arena", false)).toBe(true);
    expect(requiresSceneAssetReload("campaign", "normal", true)).toBe(false);
    expect(requiresSceneAssetReload("normal", "campaign", false)).toBe(false);
  });
});
