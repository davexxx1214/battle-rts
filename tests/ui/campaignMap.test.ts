import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CampaignMap } from "../../src/campaign/CampaignMap";
import {
  completeCampaignMission,
  createInitialCampaignProgress,
} from "../../src/campaign/campaign";

describe("campaign map", () => {
  it("shows the opening mission, locked arsenal and optional armament trials", () => {
    const markup = renderToStaticMarkup(createElement(CampaignMap, {
      mode: "campaign",
      progress: createInitialCampaignProgress(),
      onStartMission: () => undefined,
      onChangeMode: () => undefined,
    }));

    expect(markup).toContain("北境进军路线");
    expect(markup).toContain("初临战线");
    expect(markup).toContain("钢铁先锋");
    expect(markup).toContain("解锁：剑士");
    expect(markup).toContain("长枪兵");
    expect(markup).toContain("弓箭手");
    expect(markup).toContain("未解锁");
    expect(markup).toContain("开始任务");
  });

  it("reports completed stars and newly unlocked equipment", () => {
    const withStory = completeCampaignMission(createInitialCampaignProgress(), "story-01", 2);
    const progress = completeCampaignMission(withStory, "trial-swordsman", 3);
    const markup = renderToStaticMarkup(createElement(CampaignMap, {
      mode: "campaign",
      progress,
      onStartMission: () => undefined,
      onChangeMode: () => undefined,
    }));

    expect(markup).toContain("★★☆");
    expect(markup).toContain("★★★");
    expect(markup).toContain('data-unlocked="true"');
    expect(markup).toContain("1 / 8");
    expect(markup).toContain("剑士");
  });
});
