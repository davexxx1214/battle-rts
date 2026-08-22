import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_AI_DIFFICULTY } from "../../src/game/rules";
import { AiDifficultySelector } from "../../src/ui/AiDifficultySelector";

describe("AI difficulty selector", () => {
  it("offers all three difficulties with easy selected by default", () => {
    const markup = renderToStaticMarkup(createElement(AiDifficultySelector, {
      difficulty: DEFAULT_AI_DIFFICULTY,
      onChange: () => undefined,
    }));

    expect(DEFAULT_AI_DIFFICULTY).toBe("easy");
    expect(markup).toContain("简单");
    expect(markup).toContain("普通");
    expect(markup).toContain("困难");
    expect(markup).not.toContain("疯狂");
    expect(markup).toContain('aria-label="对手难度"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>简单<\/button>/);
  });

  it("locks every difficulty button once battle has started", () => {
    const markup = renderToStaticMarkup(createElement(AiDifficultySelector, {
      difficulty: "normal",
      disabled: true,
      onChange: () => undefined,
    }));

    expect(markup).toContain('aria-disabled="true"');
    expect(markup.match(/disabled=""/g)).toHaveLength(3);
  });
});
