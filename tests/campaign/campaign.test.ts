import { describe, expect, it } from "vitest";

import {
  CAMPAIGNS,
  CAMPAIGN_PROGRESS_STORAGE_KEY,
  completeCampaignMission,
  createCampaignBattle,
  createInitialCampaignProgress,
  evaluateCampaignMission,
  getCampaignDefinition,
  getCampaignMission,
  getMissionDeployables,
  getUnlockedDeployables,
  isCampaignMissionAvailable,
  loadCampaignProgress,
  saveCampaignProgress,
  type CampaignStorage,
} from "../../src/campaign/campaign";

describe("campaign progression", () => {
  it("defines two internally consistent campaign graphs", () => {
    const allMissionIds = CAMPAIGNS.flatMap(({ missions }) => (
      missions.map(({ id }) => id)
    ));
    expect(new Set(allMissionIds).size).toBe(allMissionIds.length);

    for (const campaign of CAMPAIGNS) {
      const missionIds = new Set(campaign.missions.map(({ id }) => id));
      const chapterIds = new Set<string>(campaign.chapters.map(({ id }) => id));
      expect(campaign.missions.filter(({ kind }) => kind === "story")).toHaveLength(8);
      expect(campaign.missions.filter(({ kind }) => kind === "challenge")).toHaveLength(6);
      for (const mission of campaign.missions) {
        expect(mission.campaignId).toBe(campaign.id);
        expect(mission.playerRace).toBe(campaign.playerRace);
        expect(mission.enemyRace).toBe(campaign.enemyRace);
        expect(chapterIds.has(mission.chapterId)).toBe(true);
        expect(mission.prerequisiteMissionIds.every((id) => missionIds.has(id))).toBe(true);
      }
    }
  });

  it("starts with exactly the cheap frontline and ranged squad", () => {
    expect(getUnlockedDeployables(createInitialCampaignProgress())).toEqual([
      "spearman",
      "archer",
    ]);
  });

  it("opens story nodes in sequence while keeping armament trials optional", () => {
    const initial = createInitialCampaignProgress();
    const firstStory = requiredMission("story-01");
    const swordTrial = requiredMission("trial-swordsman");
    const secondStory = requiredMission("story-02");

    expect(isCampaignMissionAvailable(firstStory, initial)).toBe(true);
    expect(isCampaignMissionAvailable(swordTrial, initial)).toBe(false);
    expect(isCampaignMissionAvailable(secondStory, initial)).toBe(false);

    const afterFirstStory = completeCampaignMission(initial, firstStory.id, 1);
    expect(isCampaignMissionAvailable(swordTrial, afterFirstStory)).toBe(true);
    expect(isCampaignMissionAvailable(secondStory, afterFirstStory)).toBe(true);
  });

  it("loans one focused reward in a trial and unlocks it permanently on completion", () => {
    const trial = requiredMission("trial-mage");
    const initial = createInitialCampaignProgress();

    expect(getMissionDeployables(trial, initial)).toEqual([
      "spearman",
      "archer",
      "mage",
    ]);
    expect(getUnlockedDeployables(initial)).not.toContain("mage");

    const completed = completeCampaignMission(initial, trial.id, 2);
    expect(getUnlockedDeployables(completed)).toContain("mage");
    expect(completed.missionStars[trial.id]).toBe(2);
    expect(completeCampaignMission(completed, trial.id, 1)).toBe(completed);
  });

  it("keeps human and undead armories independent", () => {
    const initial = createInitialCampaignProgress();
    const humanProgress = completeCampaignMission(initial, "trial-swordsman", 2);

    expect(getUnlockedDeployables(humanProgress, "human")).toContain("swordsman");
    expect(getUnlockedDeployables(humanProgress, "undead")).toEqual([
      "spearman",
      "archer",
    ]);

    const undeadProgress = completeCampaignMission(
      humanProgress,
      "undead-trial-mage",
      3,
    );
    expect(getUnlockedDeployables(undeadProgress, "undead")).toContain("mage");
    expect(getUnlockedDeployables(undeadProgress, "human")).not.toContain("mage");
  });

  it("uses a distinct undead teaching order", () => {
    const rewards = getCampaignDefinition("undead").missions.flatMap((mission) => (
      mission.reward ? [mission.reward] : []
    ));

    expect(rewards).toEqual([
      "mage",
      "swordsman",
      "gold-mine",
      "barracks",
      "guard-tower",
      "catapult",
    ]);
  });

  it("uses the mission opening treasury without changing the global rules", () => {
    const mineTrial = requiredMission("trial-gold-mine");
    const battle = createCampaignBattle(mineTrial);

    expect(battle.economy.accounts.verdant.gold).toBe(700);
    expect(battle.economy.accounts.crimson.gold).toBe(500);
    expect(battle.matchElapsed).toBe(0);
  });

  it("creates an undead-player battle against the human order", () => {
    const battle = createCampaignBattle(requiredMission("undead-story-01"));

    expect(battle.factionRaces).toEqual({
      verdant: "undead",
      crimson: "human",
    });
    expect(battle.economy.accounts.verdant.gold).toBe(500);
  });

  it("requires a challenge reward to be deployed before victory grants stars", () => {
    const trial = requiredMission("trial-catapult");
    const battle = createCampaignBattle(trial);
    const victoryWithoutCatapult = {
      ...battle,
      winner: "verdant" as const,
      matchElapsed: 100,
    };

    expect(evaluateCampaignMission(trial, victoryWithoutCatapult)).toEqual(
      expect.objectContaining({ success: false, stars: 0, primaryConditionMet: false }),
    );

    const victoryWithCatapult = {
      ...victoryWithoutCatapult,
      deploymentCounts: {
        ...victoryWithoutCatapult.deploymentCounts,
        verdant: {
          ...victoryWithoutCatapult.deploymentCounts.verdant,
          catapult: 1,
        },
      },
    };
    const result = evaluateCampaignMission(trial, victoryWithCatapult);

    expect(result.success).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.optionalResults.every(({ completed }) => completed)).toBe(true);
  });

  it("awards an undead swarm objective from deployment history", () => {
    const mission = requiredMission("undead-story-01");
    const battle = createCampaignBattle(mission);
    const result = evaluateCampaignMission(mission, {
      ...battle,
      winner: "verdant",
      matchElapsed: 120,
      deploymentCounts: {
        ...battle.deploymentCounts,
        verdant: {
          ...battle.deploymentCounts.verdant,
          spearman: 3,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.optionalResults).toEqual([
      { label: "150 秒内获胜", completed: true },
      { label: "至少召唤 3 批骸骨先锋", completed: true },
    ]);
  });

  it("sanitizes persisted progress and ignores unknown missions", () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1,
      missionStars: {
        "story-01": 8,
        "trial-swordsman": 2,
        "undead-story-01": 2,
        removedMission: 3,
        "story-02": "three",
      },
    }));
    const progress = loadCampaignProgress(storage);

    expect(progress.missionStars).toEqual({
      "story-01": 3,
      "trial-swordsman": 2,
      "undead-story-01": 2,
    });

    saveCampaignProgress(progress, storage);
    expect(JSON.parse(storage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY) ?? "null"))
      .toEqual(progress);
  });
});

function requiredMission(missionId: string) {
  const mission = getCampaignMission(missionId);
  if (!mission) throw new Error(`Missing campaign mission ${missionId}`);
  return mission;
}

function memoryStorage(initialValue: string): CampaignStorage {
  const values = new Map([[CAMPAIGN_PROGRESS_STORAGE_KEY, initialValue]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
