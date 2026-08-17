import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_PROGRESS_STORAGE_KEY,
  completeCampaignMission,
  createCampaignBattle,
  createInitialCampaignProgress,
  evaluateCampaignMission,
  getCampaignMission,
  getMissionDeployables,
  getUnlockedDeployables,
  isCampaignMissionAvailable,
  loadCampaignProgress,
  saveCampaignProgress,
  type CampaignStorage,
} from "../../src/campaign/campaign";

describe("campaign progression", () => {
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

  it("uses the mission opening treasury without changing the global rules", () => {
    const mineTrial = requiredMission("trial-gold-mine");
    const battle = createCampaignBattle(mineTrial);

    expect(battle.economy.accounts.verdant.gold).toBe(700);
    expect(battle.economy.accounts.crimson.gold).toBe(500);
    expect(battle.matchElapsed).toBe(0);
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

  it("sanitizes persisted progress and ignores unknown missions", () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1,
      missionStars: {
        "story-01": 8,
        "trial-swordsman": 2,
        removedMission: 3,
        "story-02": "three",
      },
    }));
    const progress = loadCampaignProgress(storage);

    expect(progress.missionStars).toEqual({
      "story-01": 3,
      "trial-swordsman": 2,
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
