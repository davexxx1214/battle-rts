import { useMemo, useState } from "react";

import type { GameMode } from "../app/gameMode";
import type { DeployableKind } from "../game/rules";
import { GameModeSelector } from "../ui/GameModeSelector";
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_MISSIONS,
  getMissionDeployables,
  getUnlockedDeployables,
  isCampaignMissionAvailable,
  isCampaignMissionCompleted,
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

const DEPLOYABLE_ICONS = {
  spearman: "/assets/ui/deployables/spearman.png",
  swordsman: "/assets/ui/deployables/swordsman.png",
  archer: "/assets/ui/deployables/archer.png",
  mage: "/assets/ui/deployables/mage.png",
  catapult: "/assets/ui/deployables/catapult.png",
  "guard-tower": "/assets/ui/deployables/guard-tower.png",
  "gold-mine": "/assets/ui/deployables/gold-mine.png",
  barracks: "/assets/ui/deployables/barracks.png",
} as const satisfies Readonly<Record<DeployableKind, string>>;

export function CampaignMap({
  mode,
  progress,
  onStartMission,
  onChangeMode,
}: {
  readonly mode: GameMode;
  readonly progress: CampaignProgress;
  readonly onStartMission: (mission: CampaignMission) => void;
  readonly onChangeMode: (mode: GameMode) => void;
}) {
  const recommendedMission = useMemo(() => (
    CAMPAIGN_MISSIONS.find((mission) => (
      isCampaignMissionAvailable(mission, progress)
      && !isCampaignMissionCompleted(progress, mission.id)
    )) ?? CAMPAIGN_MISSIONS[0]
  ), [progress]);
  const [selectedMissionId, setSelectedMissionId] = useState(recommendedMission.id);
  const selectedMission = CAMPAIGN_MISSIONS.find(({ id }) => id === selectedMissionId)
    ?? recommendedMission;
  const unlocked = getUnlockedDeployables(progress);
  const missionDeployables = getMissionDeployables(selectedMission, progress);
  const selectedAvailable = isCampaignMissionAvailable(selectedMission, progress);
  const completedStoryMissions = CAMPAIGN_MISSIONS.filter((mission) => (
    mission.kind === "story" && isCampaignMissionCompleted(progress, mission.id)
  )).length;
  const totalStoryMissions = CAMPAIGN_MISSIONS.filter(({ kind }) => kind === "story").length;
  const totalStars = Object.values(progress.missionStars)
    .reduce((total, stars) => total + stars, 0);

  return (
    <section className={styles.campaign} aria-label="铁原战役地图">
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.sigil} aria-hidden="true">⚔</div>
          <div>
            <p>IRONFIELD · CAMPAIGN</p>
            <h1>铁原战役</h1>
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
              <span>THE NORTHERN MARCH</span>
              <h2>北境进军路线</h2>
            </div>
            <p>主线关卡推进战役；金色军备试炼可永久解锁新的兵种和建筑。</p>
            <small className={styles.mapGestureHint}>双指缩放 · 拖动查看路线</small>
          </div>

          <div className={styles.chapterList}>
            {CAMPAIGN_CHAPTERS.map((chapter) => {
              const missions = CAMPAIGN_MISSIONS.filter(({ chapterId }) => (
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
                    {missions.map((mission) => {
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
                          onClick={() => setSelectedMissionId(mission.id)}
                          key={mission.id}
                        >
                          <span className={styles.nodeMarker} aria-hidden="true">
                            {completed ? "✓" : available ? mission.sequence : "×"}
                          </span>
                          <span className={styles.nodeCopy}>
                            <small>{mission.kind === "challenge" ? "军备试炼" : `任务 ${mission.sequence}`}</small>
                            <strong>{mission.title}</strong>
                            {completed && <em>{"★".repeat(stars)}{"☆".repeat(3 - stars)}</em>}
                            {!completed && mission.reward && (
                              <em>解锁：{DEPLOYABLE_LABELS[mission.reward]}</em>
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

        <aside className={styles.missionBriefing} aria-label="任务简报">
          <div className={styles.briefingType} data-kind={selectedMission.kind}>
            <span>{selectedMission.kind === "challenge" ? "ARMAMENT TRIAL" : "CAMPAIGN MISSION"}</span>
            <strong>{selectedMission.kind === "challenge" ? "军备试炼" : "主线任务"}</strong>
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
              <img src={DEPLOYABLE_ICONS[selectedMission.reward]} alt="" />
              <div>
                <span>首次通关奖励</span>
                <strong>{DEPLOYABLE_LABELS[selectedMission.reward]}</strong>
                <small>{unlocked.includes(selectedMission.reward) ? "已收入永久军备" : "试炼中临时借用"}</small>
              </div>
            </section>
          )}

          <section className={styles.forceBlock}>
            <span>本关可用军备 · 开局 {selectedMission.startingGold} 金币</span>
            <div>
              {missionDeployables.map((kind) => (
                <span data-loaned={selectedMission.loanedDeployables?.includes(kind) ?? false} key={kind}>
                  {DEPLOYABLE_LABELS[kind]}
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
          <small>{selectedMission.kind === "challenge" ? "军备试炼" : "当前任务"}</small>
          <strong>{selectedMission.title}</strong>
        </div>
        <button
          type="button"
          disabled={!selectedAvailable}
          aria-label={`开始任务：${selectedMission.title}`}
          onClick={() => onStartMission(selectedMission)}
        >
          {selectedAvailable ? "开始任务" : "尚未解锁"}
        </button>
      </div>

      <footer className={styles.armory}>
        <span>军备库</span>
        {(Object.keys(DEPLOYABLE_LABELS) as DeployableKind[]).map((kind) => {
          const isUnlocked = unlocked.includes(kind);
          return (
            <div data-unlocked={isUnlocked} title={DEPLOYABLE_LABELS[kind]} key={kind}>
              <img src={DEPLOYABLE_ICONS[kind]} alt="" />
              <small>{isUnlocked ? DEPLOYABLE_LABELS[kind] : "未解锁"}</small>
            </div>
          );
        })}
      </footer>
    </section>
  );
}

export { DEPLOYABLE_LABELS };
