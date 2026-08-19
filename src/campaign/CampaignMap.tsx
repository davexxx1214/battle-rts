import { useMemo, useState } from "react";

import type { GameMode } from "../app/gameMode";
import type { DeployableKind } from "../game/rules";
import { GameModeSelector } from "../ui/GameModeSelector";
import {
  deployableIconForRace,
  deployableLabelForRace,
} from "../ui/deployablePresentation";
import {
  CAMPAIGNS,
  getCampaignDefinition,
  getMissionDeployables,
  getUnlockedDeployables,
  isCampaignMissionAvailable,
  isCampaignMissionCompleted,
  type CampaignId,
  type CampaignMission,
  type CampaignProgress,
} from "./campaign";
import styles from "./CampaignMap.module.css";

const DEPLOYABLE_LABELS = {
  spearman: "长枪兵",
  swordsman: "剑士",
  archer: "弓箭手",
  mage: "法师",
  catapult: "投石车",
  "guard-tower": "箭塔",
  "gold-mine": "金矿",
  barracks: "兵营",
} as const satisfies Readonly<Record<DeployableKind, string>>;

export function CampaignMap({
  mode,
  progress,
  campaignId = "human",
  onStartMission,
  onSelectCampaign,
  onChangeMode,
}: {
  readonly mode: GameMode;
  readonly progress: CampaignProgress;
  readonly campaignId?: CampaignId;
  readonly onStartMission: (mission: CampaignMission) => void;
  readonly onSelectCampaign?: (campaignId: CampaignId) => void;
  readonly onChangeMode: (mode: GameMode) => void;
}) {
  const campaign = getCampaignDefinition(campaignId);
  const missions = campaign.missions;
  const recommendedMission = useMemo(() => (
    missions.find((mission) => (
      isCampaignMissionAvailable(mission, progress)
      && !isCampaignMissionCompleted(progress, mission.id)
    )) ?? missions[0]
  ), [missions, progress]);
  const [selectedMissionIds, setSelectedMissionIds] = useState<Partial<
    Record<CampaignId, string>
  >>({});
  const [mobileBriefingOpen, setMobileBriefingOpen] = useState(false);
  const selectedMissionId = selectedMissionIds[campaignId] ?? recommendedMission.id;
  const selectedMission = missions.find(({ id }) => id === selectedMissionId)
    ?? recommendedMission;
  const unlocked = getUnlockedDeployables(progress, campaignId);
  const missionDeployables = getMissionDeployables(selectedMission, progress);
  const selectedAvailable = isCampaignMissionAvailable(selectedMission, progress);
  const completedStoryMissions = missions.filter((mission) => (
    mission.kind === "story" && isCampaignMissionCompleted(progress, mission.id)
  )).length;
  const totalStoryMissions = missions.filter(({ kind }) => kind === "story").length;
  const totalStars = missions.reduce(
    (total, mission) => total + (progress.missionStars[mission.id] ?? 0),
    0,
  );
  const challengeLabel = campaign.challengeLabel;

  return (
    <section
      className={styles.campaign}
      data-campaign={campaign.id}
      aria-label={`${campaign.title}地图`}
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.sigil} aria-hidden="true">
            {campaign.playerRace === "undead" ? "☠" : "⚔"}
          </div>
          <div>
            <p>{campaign.englishTitle}</p>
            <h1>{campaign.title}</h1>
          </div>
        </div>
        <GameModeSelector mode={mode} onChange={onChangeMode} />
        <div className={styles.campaignProgress} aria-label="战役进度">
          <span>主线进度</span>
          <strong>{completedStoryMissions} / {totalStoryMissions}</strong>
          <em>★ {totalStars}</em>
        </div>
      </header>

      <div className={styles.body}>
        <main className={styles.mapPanel}>
          <div className={styles.mapHeading}>
            <div>
              <span>{campaign.routeKicker}</span>
              <h2>{campaign.routeTitle}</h2>
            </div>
            <nav className={styles.campaignSelector} aria-label="选择战役阵营">
              {CAMPAIGNS.map((candidate) => (
                <button
                  type="button"
                  data-active={candidate.id === campaign.id}
                  aria-pressed={candidate.id === campaign.id}
                  onClick={() => {
                    setMobileBriefingOpen(false);
                    onSelectCampaign?.(candidate.id);
                  }}
                  key={candidate.id}
                >
                  <span aria-hidden="true">{candidate.playerRace === "undead" ? "☠" : "⚔"}</span>
                  {candidate.label}
                </button>
              ))}
            </nav>
            <p>{campaign.overview}</p>
            <small className={styles.mapGestureHint}>双指缩放 · 拖动查看路线</small>
          </div>

          <div className={styles.chapterList}>
            {campaign.chapters.map((chapter) => {
              const chapterMissions = missions.filter(({ chapterId }) => (
                chapterId === chapter.id
              ));
              return (
                <section className={styles.chapter} data-chapter={chapter.id} key={chapter.id}>
                  <header>
                    <span>{chapter.number}</span>
                    <strong>{chapter.title}</strong>
                    <small>{chapter.subtitle}</small>
                  </header>
                  <div className={styles.missionRoute}>
                    {chapterMissions.map((mission) => {
                      const available = isCampaignMissionAvailable(mission, progress);
                      const completed = isCampaignMissionCompleted(progress, mission.id);
                      const selected = mission.id === selectedMission.id;
                      const stars = progress.missionStars[mission.id] ?? 0;
                      return (
                        <button
                          className={styles.missionNode}
                          data-kind={mission.kind}
                          data-state={completed ? "completed" : available ? "available" : "locked"}
                          data-selected={selected}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${mission.title}，${completed ? `已获得 ${stars} 星` : available ? "可出战" : "尚未解锁"}`}
                          onClick={() => {
                            setMobileBriefingOpen(false);
                            setSelectedMissionIds((current) => ({
                              ...current,
                              [campaignId]: mission.id,
                            }));
                          }}
                          key={mission.id}
                        >
                          <span className={styles.nodeMarker} aria-hidden="true">
                            {completed ? "✓" : available ? mission.sequence : "×"}
                          </span>
                          <span className={styles.nodeCopy}>
                            <small>{mission.kind === "challenge" ? challengeLabel : `任务 ${mission.sequence}`}</small>
                            <strong>{mission.title}</strong>
                            {completed && <em>{"★".repeat(stars)}{"☆".repeat(3 - stars)}</em>}
                            {!completed && mission.reward && (
                              <em>解锁：{deployableLabelForRace(mission.reward, campaign.playerRace)}</em>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </main>

        <aside
          className={styles.missionBriefing}
          data-mobile-open={mobileBriefingOpen}
          aria-label="任务简报"
        >
          <div className={styles.briefingType} data-kind={selectedMission.kind}>
            <span>{selectedMission.kind === "challenge"
              ? campaign.challengeKicker
              : "CAMPAIGN MISSION"}</span>
            <strong>{selectedMission.kind === "challenge" ? challengeLabel : "主线任务"}</strong>
          </div>
          <p className={styles.missionIndex}>NO. {String(selectedMission.sequence).padStart(2, "0")}</p>
          <h2>{selectedMission.title}</h2>
          <h3>{selectedMission.subtitle}</h3>
          <p className={styles.briefingText}>{selectedMission.briefing}</p>

          <section className={styles.intelBlock}>
            <span>敌情简报</span>
            <p>{selectedMission.enemyIntel}</p>
          </section>

          <section className={styles.objectiveBlock}>
            <span>作战目标</span>
            <strong>◆ {selectedMission.primaryObjective}</strong>
            {selectedMission.optionalObjectives.map((objective) => (
              <small key={objective.label}>◇ {objective.label}</small>
            ))}
          </section>

          {selectedMission.reward && (
            <section className={styles.rewardBlock}>
              <img
                src={deployableIconForRace(selectedMission.reward, campaign.playerRace)}
                alt=""
              />
              <div>
                <span>首次通关奖励</span>
                <strong>{deployableLabelForRace(selectedMission.reward, campaign.playerRace)}</strong>
                <small>{unlocked.includes(selectedMission.reward) ? "已收入永久军备" : "试炼中临时借用"}</small>
              </div>
            </section>
          )}

          <section className={styles.forceBlock}>
            <span>本关可用军备 · 开局 {selectedMission.startingGold} 金币</span>
            <div>
              {missionDeployables.map((kind) => (
                <span data-loaned={selectedMission.loanedDeployables?.includes(kind) ?? false} key={kind}>
                  {deployableLabelForRace(kind, campaign.playerRace)}
                </span>
              ))}
            </div>
          </section>

          {!selectedAvailable && (
            <p className={styles.lockedMessage}>完成前置主线任务后开放</p>
          )}
          <button
            className={styles.startButton}
            type="button"
            disabled={!selectedAvailable}
            onClick={() => onStartMission(selectedMission)}
          >
            <span>{isCampaignMissionCompleted(progress, selectedMission.id) ? "REPLAY MISSION" : "BEGIN MISSION"}</span>
            <strong>{isCampaignMissionCompleted(progress, selectedMission.id) ? "再次出战" : "开始任务"}</strong>
          </button>
        </aside>
      </div>

      <div className={styles.mobileMissionBar}>
        <div>
          <small>{selectedMission.kind === "challenge" ? challengeLabel : "当前任务"}</small>
          <strong>{selectedMission.title}</strong>
        </div>
        <div className={styles.mobileMissionActions}>
          <button
            className={styles.mobileBriefingButton}
            type="button"
            aria-expanded={mobileBriefingOpen}
            onClick={() => setMobileBriefingOpen((open) => !open)}
          >
            {mobileBriefingOpen ? "收起简报" : "任务简报"}
          </button>
          <button
            className={styles.mobileStartButton}
            type="button"
            disabled={!selectedAvailable}
            aria-label={`开始任务：${selectedMission.title}`}
            onClick={() => onStartMission(selectedMission)}
          >
            {selectedAvailable ? "开始任务" : "尚未解锁"}
          </button>
        </div>
      </div>

      <footer className={styles.armory}>
        <span>军备库</span>
        {(Object.keys(DEPLOYABLE_LABELS) as DeployableKind[]).map((kind) => {
          const isUnlocked = unlocked.includes(kind);
          return (
            <div
              data-unlocked={isUnlocked}
              title={deployableLabelForRace(kind, campaign.playerRace)}
              key={kind}
            >
              <img src={deployableIconForRace(kind, campaign.playerRace)} alt="" />
              <small>{isUnlocked
                ? deployableLabelForRace(kind, campaign.playerRace)
                : "未解锁"}</small>
            </div>
          );
        })}
      </footer>
    </section>
  );
}

export { DEPLOYABLE_LABELS };
