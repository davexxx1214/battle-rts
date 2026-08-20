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
    expect(markup).toContain("双指缩放 · 拖动查看路线");
    expect(markup).toContain("初临战线");
    expect(markup).toContain("钢铁先锋");
    expect(markup).toContain("解锁：剑士");
    expect(markup).toContain("长枪兵");
    expect(markup).toContain("弓箭手");
    expect(markup).toContain("未解锁");
    expect(markup).toContain("开始任务");
    expect(markup).toContain('aria-label="开始任务：初临战线"');
    expect(markup).toContain('aria-label="选择战役阵营"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="campaign-mission-briefing"');
    expect(markup).toContain('aria-label="手机端战役进度"');
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

  it("renders the undead campaign as an independent gravebound route", () => {
    const humanProgress = completeCampaignMission(
      createInitialCampaignProgress(),
      "story-01",
      3,
    );
    const markup = renderToStaticMarkup(createElement(CampaignMap, {
      mode: "campaign",
      progress: humanProgress,
      campaignId: "undead",
      onStartMission: () => undefined,
      onSelectCampaign: () => undefined,
      onChangeMode: () => undefined,
    }));

    expect(markup).toContain('data-campaign="undead"');
    expect(markup).toContain('aria-label="冥誓战役地图"');
    expect(markup).toContain("归魂进军路线");
    expect(markup).toContain("亡灵战役");
    expect(markup).toContain("冥契仪式");
    expect(markup).toContain("死者初醒");
    expect(markup).toContain("解锁：亡魂术士");
    expect(markup).toContain("骸骨先锋");
    expect(markup).toContain("骸骨弩手");
    expect(markup).toContain("0 / 8");
    expect(markup).toContain("/assets/ui/deployables/undead/spearman.png");
    expect(markup).not.toContain("初临战线");
    expect(markup).not.toContain("3 / 8");
  });
});
