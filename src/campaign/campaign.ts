import { createInitialBattle, type BattleState } from "../game/battle";
import {
  GAME_RULES,
  type AiDifficulty,
  type DeployableKind,
} from "../game/rules";

export type CampaignMissionKind = "story" | "challenge";

export interface CampaignObjective {
  readonly kind: "victory-before" | "castle-health";
  readonly label: string;
  readonly threshold: number;
}

export interface CampaignMission {
  readonly id: string;
  readonly chapterId: string;
  readonly sequence: number;
  readonly kind: CampaignMissionKind;
  readonly title: string;
  readonly subtitle: string;
  readonly briefing: string;
  readonly enemyIntel: string;
  readonly primaryObjective: string;
  readonly optionalObjectives: readonly [CampaignObjective, CampaignObjective];
  readonly prerequisiteMissionIds: readonly string[];
  readonly aiDifficulty: AiDifficulty;
  readonly startingGold: number;
  readonly allowedDeployables?: readonly DeployableKind[];
  readonly loanedDeployables?: readonly DeployableKind[];
  readonly requiredDeploymentKind?: DeployableKind;
  readonly reward?: DeployableKind;
}

export interface CampaignChapter {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface CampaignProgress {
  readonly version: 1;
  readonly missionStars: Readonly<Record<string, number>>;
}

export interface CampaignMissionResult {
  readonly success: boolean;
  readonly stars: number;
  readonly primaryConditionMet: boolean;
  readonly optionalResults: readonly {
    readonly label: string;
    readonly completed: boolean;
  }[];
}

export interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CAMPAIGN_PROGRESS_STORAGE_KEY = "ironfield.campaign-progress.v1";

export const BASE_CAMPAIGN_DEPLOYABLES = [
  "spearman",
  "archer",
] as const satisfies readonly DeployableKind[];

export const CAMPAIGN_CHAPTERS = [
  {
    id: "borderlands",
    number: "第一章",
    title: "边境烽火",
    subtitle: "学习战线、前后排与桥头防御",
  },
  {
    id: "war-economy",
    number: "第二章",
    title: "黄金与战鼓",
    subtitle: "在即时兵力和长期投资之间做出选择",
  },
  {
    id: "siegecraft",
    number: "第三章",
    title: "烈焰攻城",
    subtitle: "使用范围火力和重型器械击碎阵地",
  },
  {
    id: "capital",
    number: "终章",
    title: "猩红王城",
    subtitle: "集结已经掌握的全部军备",
  },
] as const satisfies readonly CampaignChapter[];

const BASE_TRIAL_FORCE = ["spearman", "archer"] as const;

export const CAMPAIGN_MISSIONS = [
  story({
    id: "story-01",
    chapterId: "borderlands",
    sequence: 1,
    title: "初临战线",
    subtitle: "第一场交锋",
    briefing: "猩红军团刚刚越过河谷。用长枪兵挡住冲锋，让弓箭手在后方持续输出。",
    enemyIntel: "敌军只会部署基础步兵，行动迟缓，适合熟悉两座桥梁和部署区域。",
    primaryObjective: "摧毁猩红城堡",
    prerequisiteMissionIds: [],
    aiDifficulty: "easy",
    startingGold: 500,
    optionalObjectives: objectives(150, 0.7),
  }),
  challenge({
    id: "trial-swordsman",
    chapterId: "borderlands",
    sequence: 2,
    title: "钢铁先锋",
    subtitle: "剑士军备试炼",
    briefing: "军械官借调了一支剑士。让他们承受正面火力，再由弓箭手完成突破。",
    enemyIntel: "敌方远程火力集中在东桥，耐久的剑士能够为后排争取时间。",
    primaryObjective: "至少部署一次剑士并摧毁敌方城堡",
    prerequisiteMissionIds: ["story-01"],
    aiDifficulty: "easy",
    startingGold: 500,
    allowedDeployables: [...BASE_TRIAL_FORCE, "swordsman"],
    loanedDeployables: ["swordsman"],
    requiredDeploymentKind: "swordsman",
    reward: "swordsman",
    optionalObjectives: objectives(140, 0.65),
  }),
  story({
    id: "story-02",
    chapterId: "borderlands",
    sequence: 3,
    title: "双桥奔袭",
    subtitle: "识别敌人的薄弱路线",
    briefing: "敌军开始同时利用两座桥梁。观察兵力流向，在守住一路的同时从另一路推进。",
    enemyIntel: "敌军部署间隔仍然较长，但会在两条通路之间转换进攻方向。",
    primaryObjective: "突破双桥防线并摧毁城堡",
    prerequisiteMissionIds: ["story-01"],
    aiDifficulty: "easy",
    startingGold: 500,
    optionalObjectives: objectives(145, 0.6),
  }),
  challenge({
    id: "trial-guard-tower",
    chapterId: "borderlands",
    sequence: 4,
    title: "桥头堡垒",
    subtitle: "箭塔军备试炼",
    briefing: "箭塔只会存在短暂时间。把它部署在敌军真正发起冲锋的桥头，而不是过早浪费火力。",
    enemyIntel: "猩红先锋会在短暂集结后压向西桥，箭塔的位置和时机比数量更重要。",
    primaryObjective: "至少部署一次箭塔并赢得战斗",
    prerequisiteMissionIds: ["story-02"],
    aiDifficulty: "easy",
    startingGold: 500,
    allowedDeployables: [...BASE_TRIAL_FORCE, "guard-tower"],
    loanedDeployables: ["guard-tower"],
    requiredDeploymentKind: "guard-tower",
    reward: "guard-tower",
    optionalObjectives: objectives(145, 0.7),
  }),
  story({
    id: "story-03",
    chapterId: "borderlands",
    sequence: 5,
    title: "赤潮压境",
    subtitle: "边境决战",
    briefing: "猩红军团投入了更完整的混编部队。稳定前线，避免把所有金币一次投入同一路线。",
    enemyIntel: "敌军决策速度提升，并开始使用更昂贵的作战单位。",
    primaryObjective: "守住苍蓝城堡并结束边境攻势",
    prerequisiteMissionIds: ["story-02"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(135, 0.55),
  }),
  challenge({
    id: "trial-gold-mine",
    chapterId: "war-economy",
    sequence: 6,
    title: "黄金命脉",
    subtitle: "金矿军备试炼",
    briefing: "用全部开局储备建立金矿，并保护它完成投资回收。经济优势只有转化成军队才有意义。",
    enemyIntel: "敌军前期攻势较弱，但拖延太久会持续积累兵力。",
    primaryObjective: "至少建造一次金矿并摧毁敌方城堡",
    prerequisiteMissionIds: ["story-03"],
    aiDifficulty: "easy",
    startingGold: 700,
    allowedDeployables: [...BASE_TRIAL_FORCE, "gold-mine"],
    loanedDeployables: ["gold-mine"],
    requiredDeploymentKind: "gold-mine",
    reward: "gold-mine",
    optionalObjectives: objectives(150, 0.6),
  }),
  story({
    id: "story-04",
    chapterId: "war-economy",
    sequence: 7,
    title: "漫长战争",
    subtitle: "把收益转化为兵力",
    briefing: "双方都获得了更充足的作战时间。决定何时投资，何时停止投资并发起总攻。",
    enemyIntel: "敌军会优先建立一座金矿，摧毁它可以延缓后续攻势。",
    primaryObjective: "切断敌方经济并摧毁城堡",
    prerequisiteMissionIds: ["story-03"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(135, 0.6),
  }),
  challenge({
    id: "trial-barracks",
    chapterId: "war-economy",
    sequence: 8,
    title: "战鼓长鸣",
    subtitle: "兵营军备试炼",
    briefing: "兵营会持续派出剑士。把它放在安全位置，让生产出来的前锋为基础部队打开道路。",
    enemyIntel: "敌军会尝试从另一座桥绕开你的主力，兵营的位置将决定增援路线。",
    primaryObjective: "至少建造一次兵营并摧毁敌方城堡",
    prerequisiteMissionIds: ["story-04"],
    aiDifficulty: "normal",
    startingGold: 500,
    allowedDeployables: [...BASE_TRIAL_FORCE, "barracks"],
    loanedDeployables: ["barracks"],
    requiredDeploymentKind: "barracks",
    reward: "barracks",
    optionalObjectives: objectives(145, 0.55),
  }),
  story({
    id: "story-05",
    chapterId: "war-economy",
    sequence: 9,
    title: "战线不息",
    subtitle: "经济与生产的综合考验",
    briefing: "猩红军团已经建立稳定的经济与增援体系。袭击敌方建筑，别让他们安稳地完成生产周期。",
    enemyIntel: "金矿和兵营会分散在城堡两侧，直接冲锋未必是最快的胜利方式。",
    primaryObjective: "摧毁猩红军团的持续作战体系",
    prerequisiteMissionIds: ["story-04"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(130, 0.5),
  }),
  challenge({
    id: "trial-mage",
    chapterId: "siegecraft",
    sequence: 10,
    title: "奥术烈焰",
    subtitle: "法师军备试炼",
    briefing: "敌军正在密集通过桥梁。让长枪兵拖住他们，法师的范围攻击会同时击中整片目标。",
    enemyIntel: "敌方以低费步兵为主，数量很多，但缺少能够快速接近后排的单位。",
    primaryObjective: "至少部署一次法师并摧毁敌方城堡",
    prerequisiteMissionIds: ["story-05"],
    aiDifficulty: "normal",
    startingGold: 600,
    allowedDeployables: [...BASE_TRIAL_FORCE, "mage"],
    loanedDeployables: ["mage"],
    requiredDeploymentKind: "mage",
    reward: "mage",
    optionalObjectives: objectives(135, 0.55),
  }),
  story({
    id: "story-06",
    chapterId: "siegecraft",
    sequence: 11,
    title: "灰烬长路",
    subtitle: "保护高价值后排",
    briefing: "范围火力可以快速清理步兵，却经不起正面围攻。建立稳定前线，不要把法师孤独地送上桥梁。",
    enemyIntel: "敌军会混用耐久前锋与远程单位，单一兵种很难独立解决全部目标。",
    primaryObjective: "用混编军队推进至敌方城堡",
    prerequisiteMissionIds: ["story-05"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(125, 0.55),
  }),
  challenge({
    id: "trial-catapult",
    chapterId: "siegecraft",
    sequence: 12,
    title: "城墙粉碎者",
    subtitle: "投石车军备试炼",
    briefing: "投石车射程极远，但移动缓慢且费用高昂。用基础部队保护它完成第一次攻城齐射。",
    enemyIntel: "敌军拥有完整建筑体系。正面步兵会被持续消耗，重型攻城火力是破局关键。",
    primaryObjective: "至少部署一次投石车并摧毁敌方城堡",
    prerequisiteMissionIds: ["story-06"],
    aiDifficulty: "normal",
    startingGold: 800,
    allowedDeployables: [...BASE_TRIAL_FORCE, "catapult"],
    loanedDeployables: ["catapult"],
    requiredDeploymentKind: "catapult",
    reward: "catapult",
    optionalObjectives: objectives(130, 0.5),
  }),
  story({
    id: "story-07",
    chapterId: "siegecraft",
    sequence: 13,
    title: "黑墙之前",
    subtitle: "摧毁完整防御阵地",
    briefing: "城墙之外布满箭塔、兵营和远程火力。先保护攻城器械清除防线，再投入主力。",
    enemyIntel: "敌军会使用全部兵种与建筑，并以极快速度寻找部署机会。",
    primaryObjective: "击穿黑墙防线",
    prerequisiteMissionIds: ["story-06"],
    aiDifficulty: "hard",
    startingGold: 500,
    optionalObjectives: objectives(120, 0.45),
  }),
  story({
    id: "story-08",
    chapterId: "capital",
    sequence: 14,
    title: "猩红王城",
    subtitle: "最终决战",
    briefing: "这是对整场战役的最终检验。根据战况切换经济、防御、范围火力和攻城推进。",
    enemyIntel: "猩红军团不会留下明显弱点。已经完成的军备试炼会为你提供更多解法。",
    primaryObjective: "摧毁猩红王城，结束战争",
    prerequisiteMissionIds: ["story-07"],
    aiDifficulty: "hard",
    startingGold: 500,
    optionalObjectives: objectives(115, 0.4),
  }),
] as const satisfies readonly CampaignMission[];

const MISSION_BY_ID = new Map(CAMPAIGN_MISSIONS.map((mission) => [mission.id, mission]));
const DEPLOYABLE_KINDS = new Set<DeployableKind>([
  "spearman",
  "swordsman",
  "archer",
  "mage",
  "catapult",
  "guard-tower",
  "gold-mine",
  "barracks",
]);

export function createInitialCampaignProgress(): CampaignProgress {
  return { version: 1, missionStars: {} };
}

export function getCampaignMission(missionId: string): CampaignMission | undefined {
  return MISSION_BY_ID.get(missionId);
}

export function isCampaignMissionCompleted(
  progress: CampaignProgress,
  missionId: string,
): boolean {
  return (progress.missionStars[missionId] ?? 0) > 0;
}

export function isCampaignMissionAvailable(
  mission: CampaignMission,
  progress: CampaignProgress,
): boolean {
  return mission.prerequisiteMissionIds.every((missionId) => (
    isCampaignMissionCompleted(progress, missionId)
  ));
}

export function getUnlockedDeployables(
  progress: CampaignProgress,
): readonly DeployableKind[] {
  const unlocked = new Set<DeployableKind>(BASE_CAMPAIGN_DEPLOYABLES);
  for (const mission of CAMPAIGN_MISSIONS) {
    if (mission.reward && isCampaignMissionCompleted(progress, mission.id)) {
      unlocked.add(mission.reward);
    }
  }
  return [...unlocked];
}

export function getMissionDeployables(
  mission: CampaignMission,
  progress: CampaignProgress,
): readonly DeployableKind[] {
  return mission.allowedDeployables ?? getUnlockedDeployables(progress);
}

export function completeCampaignMission(
  progress: CampaignProgress,
  missionId: string,
  stars: number,
): CampaignProgress {
  if (!MISSION_BY_ID.has(missionId) || !Number.isInteger(stars) || stars < 1 || stars > 3) {
    return progress;
  }
  const previous = progress.missionStars[missionId] ?? 0;
  if (previous >= stars) return progress;
  return {
    version: 1,
    missionStars: { ...progress.missionStars, [missionId]: stars },
  };
}

export function createCampaignBattle(mission: CampaignMission): BattleState {
  const battle = createInitialBattle();
  const gold = Math.min(GAME_RULES.economy.maximumGold, Math.max(0, mission.startingGold));
  return {
    ...battle,
    economy: {
      ...battle.economy,
      accounts: {
        ...battle.economy.accounts,
        verdant: {
          ...battle.economy.accounts.verdant,
          gold,
          isFull: gold === GAME_RULES.economy.maximumGold,
        },
      },
    },
  };
}

export function evaluateCampaignMission(
  mission: CampaignMission,
  battle: BattleState,
): CampaignMissionResult {
  const primaryConditionMet = mission.requiredDeploymentKind === undefined
    || battle.deploymentCounts.verdant[mission.requiredDeploymentKind] > 0;
  const success = battle.winner === "verdant" && primaryConditionMet;
  const friendlyCastle = battle.buildings.find((building) => (
    building.kind === "castle" && building.faction === "verdant"
  ));
  const castleHealthFraction = friendlyCastle
    ? friendlyCastle.health / friendlyCastle.maxHealth
    : 0;
  const optionalResults = mission.optionalObjectives.map((objective) => ({
    label: objective.label,
    completed: success && (
      objective.kind === "victory-before"
        ? battle.matchElapsed <= objective.threshold
        : castleHealthFraction >= objective.threshold
    ),
  }));
  return {
    success,
    primaryConditionMet,
    optionalResults,
    stars: success
      ? 1 + optionalResults.filter((objective) => objective.completed).length
      : 0,
  };
}

export function loadCampaignProgress(
  storage: CampaignStorage | undefined = defaultStorage(),
): CampaignProgress {
  if (!storage) return createInitialCampaignProgress();
  try {
    const raw = storage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY);
    if (!raw) return createInitialCampaignProgress();
    const parsed = JSON.parse(raw) as { version?: unknown; missionStars?: unknown };
    if (parsed.version !== 1 || !isRecord(parsed.missionStars)) {
      return createInitialCampaignProgress();
    }
    const missionStars: Record<string, number> = {};
    for (const [missionId, stars] of Object.entries(parsed.missionStars)) {
      if (MISSION_BY_ID.has(missionId) && Number.isInteger(stars) && Number(stars) >= 1) {
        missionStars[missionId] = Math.min(3, Number(stars));
      }
    }
    return { version: 1, missionStars };
  } catch {
    return createInitialCampaignProgress();
  }
}

export function saveCampaignProgress(
  progress: CampaignProgress,
  storage: CampaignStorage | undefined = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage may be disabled or full. The current session still keeps its progress.
  }
}

export function isDeployableKind(value: string): value is DeployableKind {
  return DEPLOYABLE_KINDS.has(value as DeployableKind);
}

function story(
  mission: Omit<CampaignMission, "kind">,
): CampaignMission {
  return { ...mission, kind: "story" };
}

function challenge(
  mission: Omit<CampaignMission, "kind">,
): CampaignMission {
  return { ...mission, kind: "challenge" };
}

function objectives(
  victoryBeforeSeconds: number,
  castleHealthFraction: number,
): readonly [CampaignObjective, CampaignObjective] {
  return [
    {
      kind: "victory-before",
      threshold: victoryBeforeSeconds,
      label: `${victoryBeforeSeconds} 秒内获胜`,
    },
    {
      kind: "castle-health",
      threshold: castleHealthFraction,
      label: `城堡生命保持在 ${Math.round(castleHealthFraction * 100)}% 以上`,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): CampaignStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
