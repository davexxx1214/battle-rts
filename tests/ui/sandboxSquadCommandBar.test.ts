import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SandboxSquadCommandBar } from "../../src/ui/SandboxSquadCommandBar";

describe("sandbox squad command bar", () => {
  it("provides all five orders and exposes the armed mobile command", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      selectedCount: 3,
      armedOrder: "attack-move",
      onArmOrder: () => undefined,
      onImmediateOrder: () => undefined,
    }));

    expect(markup).toContain('aria-label="沙盒兵团命令"');
    expect(markup).toContain("移动");
    expect(markup).toContain("攻击");
    expect(markup).toContain("攻移");
    expect(markup).toContain("停止");
    expect(markup).toContain("坚守");
    expect(markup.match(/<button/g)).toHaveLength(5);
    expect(markup).toContain('data-armed="true"');
    expect(markup).toContain("点击地图下达目标");
  });

  it("disables commands without a living selection", () => {
    const markup = renderToStaticMarkup(createElement(SandboxSquadCommandBar, {
      selectedCount: 0,
      armedOrder: null,
      onArmOrder: () => undefined,
      onImmediateOrder: () => undefined,
    }));

    expect(markup.match(/ disabled/g)).toHaveLength(5);
    expect(markup).toContain("右键地面移动");
  });
});
