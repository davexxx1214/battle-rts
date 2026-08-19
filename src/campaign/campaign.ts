import { createInitialBattle, type BattleState } from "../game/battle";
import {
  GAME_RULES,
  type AiDifficulty,
  type DeployableKind,
} from "../game/rules";
import type { BattleRace, FactionRaces } from "../game/types";

export type CampaignId = "human" | "undead";
export type CampaignMissionKind = "story" | "challenge";

export type CampaignObjective = {
  readonly kind: "victory-before" | "castle-health";
  readonly label: string;
  readonly threshold: number;
} | {
  readonly kind: "deploy-at-least";
  readonly label: string;
  readonly threshold: number;
  readonly deployableKind: DeployableKind;
};

export interface CampaignMission {
  readonly id: string;
  readonly campaignId: CampaignId;
  readonly playerRace: BattleRace;
  readonly enemyRace: BattleRace;
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

export interface CampaignDefinition {
  readonly id: CampaignId;
  readonly playerRace: BattleRace;
  readonly enemyRace: BattleRace;
  readonly label: string;
  readonly title: string;
  readonly englishTitle: string;
  readonly routeKicker: string;
  readonly routeTitle: string;
  readonly overview: string;
  readonly challengeLabel: string;
  readonly challengeKicker: string;
  readonly chapters: readonly CampaignChapter[];
  readonly missions: readonly CampaignMission[];
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

export const HUMAN_CAMPAIGN_CHAPTERS = [
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

export const HUMAN_CAMPAIGN_MISSIONS = [
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

export const UNDEAD_CAMPAIGN_CHAPTERS = [
  {
    id: "undead-awakening",
    number: "第一章",
    title: "墓园苏醒",
    subtitle: "驾驭骨潮，以数量和射程撕开第一道封锁",
  },
  {
    id: "undead-host",
    number: "第二章",
    title: "黑晶与骨潮",
    subtitle: "让诅咒矿脉和墓穴增援维持不死军势",
  },
  {
    id: "undead-rites",
    number: "第三章",
    title: "魂火与龙骸",
    subtitle: "用范围灵术和冰霜骨龙攻破圣火阵地",
  },
  {
    id: "undead-dawn",
    number: "终章",
    title: "永昼圣堂",
    subtitle: "潜入王城地宫，夺回被用于供养圣火的终墓之钥",
  },
] as const satisfies readonly CampaignChapter[];

export const UNDEAD_CAMPAIGN_MISSIONS = [
  undeadStory({
    id: "undead-story-01",
    chapterId: "undead-awakening",
    sequence: 1,
    title: "死者初醒",
    subtitle: "无名王庭再度集结",
    briefing: "猩红王室直属的黎明教团掘开沉眠墓园，盗走了维系亡者长眠的终墓之钥。让骸骨先锋成群缠住守军，再由骸骨弩手从远处击穿防线。",
    enemyIntel: "巡墓士兵只有基础近战与弓手。骸骨先锋十分脆弱，但一次召来的数量足以快速包围孤立目标。",
    primaryObjective: "突破墓园封锁并摧毁教团前哨",
    prerequisiteMissionIds: [],
    aiDifficulty: "easy",
    startingGold: 500,
    optionalObjectives: undeadSwarmObjectives(150, 3),
  }),
  undeadChallenge({
    id: "undead-trial-mage",
    chapterId: "undead-awakening",
    sequence: 2,
    title: "万魂初啼",
    subtitle: "亡魂术士冥契",
    briefing: "墓园上空尚有无数被惊醒的游魂。让骨潮聚拢人类步兵，再由亡魂术士的灵魂弹同时撕开整片敌阵。",
    enemyIntel: "巡墓士兵数量很多、阵形密集。亡魂术士施法迅速且波及范围很大，却经不起任何正面围攻。",
    primaryObjective: "至少召来一次亡魂术士并摧毁敌方城堡",
    prerequisiteMissionIds: ["undead-story-01"],
    aiDifficulty: "easy",
    startingGold: 600,
    allowedDeployables: [...BASE_TRIAL_FORCE, "mage"],
    loanedDeployables: ["mage"],
    requiredDeploymentKind: "mage",
    reward: "mage",
    optionalObjectives: objectives(145, 0.65),
  }),
  undeadStory({
    id: "undead-story-02",
    chapterId: "undead-awakening",
    sequence: 3,
    title: "灰河无渡",
    subtitle: "让骨潮同时漫过双桥",
    briefing: "教团把刻有亡者真名的石板运过灰河。用一路骨潮牵制守军，再从另一座桥放出弩手与第二批先锋；若已唤醒术士，就让他惩罚桥上的密集阵形。",
    enemyIntel: "守军会在两座桥之间调动。小股骸骨无法久战，错开召唤节奏才能让前线持续有人接敌。",
    primaryObjective: "穿越双桥并夺回真名石板",
    prerequisiteMissionIds: ["undead-story-01"],
    aiDifficulty: "easy",
    startingGold: 500,
    optionalObjectives: undeadSwarmObjectives(145, 4),
  }),
  undeadChallenge({
    id: "undead-trial-swordsman",
    chapterId: "undead-awakening",
    sequence: 4,
    title: "墓门不倒",
    subtitle: "墓穴卫士冥契",
    briefing: "古老墓门仍认得守卫者的誓言。唤醒一名墓穴卫士承受圣弓齐射，让成群先锋从他的身后越过战线。",
    enemyIntel: "教团弓手会优先消耗最先接战的单位。墓穴卫士行动缓慢，却能承受远超普通骸骨的伤害。",
    primaryObjective: "至少唤醒一次墓穴卫士并赢得战斗",
    prerequisiteMissionIds: ["undead-story-02"],
    aiDifficulty: "easy",
    startingGold: 500,
    allowedDeployables: [...BASE_TRIAL_FORCE, "swordsman"],
    loanedDeployables: ["swordsman"],
    requiredDeploymentKind: "swordsman",
    reward: "swordsman",
    optionalObjectives: objectives(145, 0.7),
  }),
  undeadStory({
    id: "undead-story-03",
    chapterId: "undead-awakening",
    sequence: 5,
    title: "猎巫长夜",
    subtitle: "熄灭追猎者的圣火",
    briefing: "教团猎巫团循着魂火追来。墓穴卫士若已苏醒，就让他压住正面；否则以连续骨潮分散敌人的混编军势。",
    enemyIntel: "猎巫团的部署更快，也开始投入坚韧前锋。不要让脆弱的骸骨弩手暴露在桥头。",
    primaryObjective: "击溃猎巫团并守住无名墓园",
    prerequisiteMissionIds: ["undead-story-02"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(135, 0.55),
  }),
  undeadChallenge({
    id: "undead-trial-gold-mine",
    chapterId: "undead-host",
    sequence: 6,
    title: "黑晶饥渴",
    subtitle: "诅咒晶矿冥契",
    briefing: "黑晶矿脉蕴藏着教团远征急需的财富。投入全部初始储备唤醒晶矿，守住它的第一轮产出，再把收益转化为新的骨潮。",
    enemyIntel: "守军开局攻势较弱，却会随时间积累兵力。晶矿只有持续运转并及时转化收益，才不是昂贵的墓碑。",
    primaryObjective: "至少唤醒一次诅咒晶矿并摧毁敌方城堡",
    prerequisiteMissionIds: ["undead-story-03"],
    aiDifficulty: "easy",
    startingGold: 700,
    allowedDeployables: [...BASE_TRIAL_FORCE, "gold-mine"],
    loanedDeployables: ["gold-mine"],
    requiredDeploymentKind: "gold-mine",
    reward: "gold-mine",
    optionalObjectives: objectives(150, 0.6),
  }),
  undeadStory({
    id: "undead-story-04",
    chapterId: "undead-host",
    sequence: 7,
    title: "亡者不息",
    subtitle: "让每一份储备成为第二次生命",
    briefing: "通往王城的道路漫长，单次冲锋无法淹没守军。若黑晶冥契已经应约，就判断何时投资、何时转为总攻；否则用错开的骨潮维持战线。",
    enemyIntel: "人类也会建立金矿维持远征。先摧毁他们的经济节点，可以延缓后续重装部队。",
    primaryObjective: "切断教团补给并延续不死军势",
    prerequisiteMissionIds: ["undead-story-03"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(135, 0.6),
  }),
  undeadChallenge({
    id: "undead-trial-barracks",
    chapterId: "undead-host",
    sequence: 8,
    title: "墓穴回声",
    subtitle: "墓穴兵营冥契",
    briefing: "打开一座行军墓穴，它会周期性唤来新的墓穴卫士。选好召唤位置，让缓慢的守卫沿正确路线抵达前线。",
    enemyIntel: "守军会尝试从另一座桥绕过主力。行军墓穴造价高昂、召唤缓慢，却能持续提供最可靠的前排。",
    primaryObjective: "至少打开一次墓穴兵营并摧毁敌方城堡",
    prerequisiteMissionIds: ["undead-story-04"],
    aiDifficulty: "normal",
    startingGold: 900,
    allowedDeployables: [...BASE_TRIAL_FORCE, "barracks"],
    loanedDeployables: ["barracks"],
    requiredDeploymentKind: "barracks",
    reward: "barracks",
    optionalObjectives: objectives(150, 0.55),
  }),
  undeadStory({
    id: "undead-story-05",
    chapterId: "undead-host",
    sequence: 9,
    title: "白骨潮汐",
    subtitle: "用不息增援吞没战线",
    briefing: "教团已在两岸建立稳定营地。已应约的黑晶与墓穴可以补充军费和前锋；即使没有这些冥契，也要用手中的召唤填补每一次阵亡留下的缺口。",
    enemyIntel: "敌人的金矿在城堡两翼持续补充军费。不断施压会迫使守军把金币花在前线，而不是扩大经济优势。",
    primaryObjective: "摧毁教团的持续作战体系",
    prerequisiteMissionIds: ["undead-story-04"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: undeadSwarmObjectives(130, 5),
  }),
  undeadChallenge({
    id: "undead-trial-guard-tower",
    chapterId: "undead-rites",
    sequence: 10,
    title: "魂火守望",
    subtitle: "魂火尖塔冥契",
    briefing: "把游荡魂火束缚在临时尖塔中。等敌军密集踏上桥头再完成仪式，让尖塔在消散前发挥全部火力。",
    enemyIntel: "教团先锋会在短暂集结后选择一座桥推进。魂火尖塔存在时间有限，先看清攻势方向再完成仪式。",
    primaryObjective: "至少召来一次魂火尖塔并赢得战斗",
    prerequisiteMissionIds: ["undead-story-05"],
    aiDifficulty: "normal",
    startingGold: 500,
    allowedDeployables: [...BASE_TRIAL_FORCE, "guard-tower"],
    loanedDeployables: ["guard-tower"],
    requiredDeploymentKind: "guard-tower",
    reward: "guard-tower",
    optionalObjectives: objectives(135, 0.55),
  }),
  undeadStory({
    id: "undead-story-06",
    chapterId: "undead-rites",
    sequence: 11,
    title: "圣火之下",
    subtitle: "保护脆弱的灵魂施术者",
    briefing: "教团用重甲前锋护送圣火弓手。用墓穴卫士或反复召来的骨潮固定战线，让弩手和术士从不同距离逐层瓦解阵形；若魂火尖塔已经应约，就让它守住最危险的桥头。",
    enemyIntel: "人类混编部队兼具耐久和远程火力。单一亡灵兵种会被克制，必须让每种单位承担适合自己的位置。",
    primaryObjective: "熄灭圣火营地并打开王城地宫的道路",
    prerequisiteMissionIds: ["undead-story-05"],
    aiDifficulty: "normal",
    startingGold: 500,
    optionalObjectives: objectives(125, 0.55),
  }),
  undeadChallenge({
    id: "undead-trial-catapult",
    chapterId: "undead-rites",
    sequence: 12,
    title: "龙骸复苏",
    subtitle: "冰霜骨龙冥契",
    briefing: "终墓之钥的气息唤醒了埋在冻土下的古龙。用前锋为它挡住集火，让冰霜吐息覆盖成群守军和城堡门户。",
    enemyIntel: "圣火阵地依托城堡与固定箭塔保护密集步兵。冰霜骨龙极其坚韧、吐息范围巨大，但高昂代价会让早期战线空虚。",
    primaryObjective: "至少唤醒一次冰霜骨龙并摧毁敌方城堡",
    prerequisiteMissionIds: ["undead-story-06"],
    aiDifficulty: "normal",
    startingGold: 900,
    allowedDeployables: [...BASE_TRIAL_FORCE, "catapult"],
    loanedDeployables: ["catapult"],
    requiredDeploymentKind: "catapult",
    reward: "catapult",
    optionalObjectives: objectives(135, 0.5),
  }),
  undeadStory({
    id: "undead-story-07",
    chapterId: "undead-rites",
    sequence: 13,
    title: "破晓关隘",
    subtitle: "让第一缕晨光照在废墟上",
    briefing: "猩红王城的外关布满箭塔、营房与祝圣武装。先用骨潮暴露火力，再保护已经应约的术士或骨龙拆开完整防线。",
    enemyIntel: "守关军会使用全部兵种与建筑，并迅速填补任何空缺。不要把昂贵单位独自送进箭塔交叉火力。",
    primaryObjective: "攻破破晓关隘并打开王城地宫",
    prerequisiteMissionIds: ["undead-story-06"],
    aiDifficulty: "hard",
    startingGold: 500,
    optionalObjectives: objectives(120, 0.45),
  }),
  undeadStory({
    id: "undead-story-08",
    chapterId: "undead-dawn",
    sequence: 14,
    title: "熄灭永昼",
    subtitle: "夺回终墓之钥",
    briefing: "苍蓝联军攻打城墙的同一夜，终墓之钥仍悬在王城地底的永昼圣堂，千万亡魂被迫成为圣火燃料。集结已经立下的冥契，让城上的猩红旗与城下的永昼火一同熄灭。",
    enemyIntel: "圣堂守军不会留下固定弱点。骨潮、重甲、远程、灵术、经济与骨龙，都可能成为最后一战的答案。",
    primaryObjective: "摧毁永昼圣堂并夺回终墓之钥",
    prerequisiteMissionIds: ["undead-story-07"],
    aiDifficulty: "hard",
    startingGold: 500,
    optionalObjectives: objectives(115, 0.4),
  }),
] as const satisfies readonly CampaignMission[];

/** @deprecated Prefer HUMAN_CAMPAIGN_CHAPTERS or getCampaignDefinition(). */
export const CAMPAIGN_CHAPTERS = HUMAN_CAMPAIGN_CHAPTERS;

export const CAMPAIGNS = [
  {
    id: "human",
    playerRace: "human",
    enemyRace: "human",
    label: "人族战役",
    title: "铁原战役",
    englishTitle: "IRONFIELD · CAMPAIGN",
    routeKicker: "THE NORTHERN MARCH",
    routeTitle: "北境进军路线",
    overview: "苍蓝联军沿北境反攻猩红军团。主线推进战役，军备试炼则会永久扩充这条战役的军备库。",
    challengeLabel: "军备试炼",
    challengeKicker: "ARMAMENT TRIAL",
    chapters: HUMAN_CAMPAIGN_CHAPTERS,
    missions: HUMAN_CAMPAIGN_MISSIONS,
  },
  {
    id: "undead",
    playerRace: "undead",
    enemyRace: "human",
    label: "亡灵战役",
    title: "冥誓战役",
    englishTitle: "IRONFIELD · GRAVEBOUND",
    routeKicker: "THE GRAVEBOUND MARCH",
    routeTitle: "归魂进军路线",
    overview: "苍蓝联军北进之时，猩红王室直属的黎明教团正沿旧战线掘墓，以终墓之钥抽取亡魂，供养黑墙与王城的永昼圣火。",
    challengeLabel: "冥契仪式",
    challengeKicker: "DEATHBOUND RITE",
    chapters: UNDEAD_CAMPAIGN_CHAPTERS,
    missions: UNDEAD_CAMPAIGN_MISSIONS,
  },
] as const satisfies readonly CampaignDefinition[];

/** @deprecated Prefer HUMAN_CAMPAIGN_MISSIONS or getCampaignDefinition(). */
export const CAMPAIGN_MISSIONS = HUMAN_CAMPAIGN_MISSIONS;

export const ALL_CAMPAIGN_MISSIONS = [
  ...HUMAN_CAMPAIGN_MISSIONS,
  ...UNDEAD_CAMPAIGN_MISSIONS,
] as const satisfies readonly CampaignMission[];

const MISSION_BY_ID = new Map(ALL_CAMPAIGN_MISSIONS.map((mission) => [mission.id, mission]));
const CAMPAIGN_BY_ID = new Map(CAMPAIGNS.map((campaign) => [campaign.id, campaign]));
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

export function getCampaignDefinition(campaignId: CampaignId): CampaignDefinition {
  return CAMPAIGN_BY_ID.get(campaignId) ?? CAMPAIGNS[0];
}

export function getCampaignFactionRaces(campaignId: CampaignId): FactionRaces {
  const campaign = getCampaignDefinition(campaignId);
  return {
    verdant: campaign.playerRace,
    crimson: campaign.enemyRace,
  };
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
  campaignId: CampaignId = "human",
): readonly DeployableKind[] {
  const unlocked = new Set<DeployableKind>(BASE_CAMPAIGN_DEPLOYABLES);
  for (const mission of getCampaignDefinition(campaignId).missions) {
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
  return mission.allowedDeployables ?? getUnlockedDeployables(progress, mission.campaignId);
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
  const battle = createInitialBattle({
    factionRaces: {
      verdant: mission.playerRace,
      crimson: mission.enemyRace,
    },
  });
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
    completed: success && campaignObjectiveCompleted(
      objective,
      battle,
      castleHealthFraction,
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

type CampaignMissionDraft = Omit<
  CampaignMission,
  "kind" | "campaignId" | "playerRace" | "enemyRace"
>;

function story(
  mission: CampaignMissionDraft,
): CampaignMission {
  return {
    ...mission,
    campaignId: "human",
    playerRace: "human",
    enemyRace: "human",
    kind: "story",
  };
}

function challenge(
  mission: CampaignMissionDraft,
): CampaignMission {
  return {
    ...mission,
    campaignId: "human",
    playerRace: "human",
    enemyRace: "human",
    kind: "challenge",
  };
}

function undeadStory(
  mission: CampaignMissionDraft,
): CampaignMission {
  return {
    ...mission,
    campaignId: "undead",
    playerRace: "undead",
    enemyRace: "human",
    kind: "story",
  };
}

function undeadChallenge(
  mission: CampaignMissionDraft,
): CampaignMission {
  return {
    ...mission,
    campaignId: "undead",
    playerRace: "undead",
    enemyRace: "human",
    kind: "challenge",
  };
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

function undeadSwarmObjectives(
  victoryBeforeSeconds: number,
  minimumDeployments: number,
): readonly [CampaignObjective, CampaignObjective] {
  return [
    {
      kind: "victory-before",
      threshold: victoryBeforeSeconds,
      label: `${victoryBeforeSeconds} 秒内获胜`,
    },
    {
      kind: "deploy-at-least",
      deployableKind: "spearman",
      threshold: minimumDeployments,
      label: `至少召唤 ${minimumDeployments} 批骸骨先锋`,
    },
  ];
}

function campaignObjectiveCompleted(
  objective: CampaignObjective,
  battle: BattleState,
  castleHealthFraction: number,
): boolean {
  switch (objective.kind) {
    case "victory-before":
      return battle.matchElapsed <= objective.threshold;
    case "castle-health":
      return castleHealthFraction >= objective.threshold;
    case "deploy-at-least":
      return battle.deploymentCounts.verdant[objective.deployableKind] >= objective.threshold;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): CampaignStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
