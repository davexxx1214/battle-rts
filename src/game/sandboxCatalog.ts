import type { BattleRace, UnitRole } from "./types";
import type { TroopKind } from "./rules";

export const SANDBOX_BUILDING_SLOTS = [
  "mine",
  "barracks",
  "archery-range",
  "mage-tower",
  "siege-workshop",
  "guard-tower",
] as const;

export type SandboxBuildingSlot = typeof SANDBOX_BUILDING_SLOTS[number];
export type SandboxOrdinaryBuildingSlot = Exclude<SandboxBuildingSlot, "mine">;
export type SandboxProductionBuildingSlot = Exclude<
  SandboxOrdinaryBuildingSlot,
  "guard-tower"
>;
export type SandboxBuildingRuntimeKind =
  | "gold-mine"
  | SandboxOrdinaryBuildingSlot;
export type SandboxAdvancedBuildingKind = Exclude<
  SandboxOrdinaryBuildingSlot,
  "barracks" | "guard-tower"
>;

export interface SandboxCatalogDisplay {
  readonly name: string;
  readonly description: string;
}

export interface SandboxBuildingCatalogEntry {
  readonly slot: SandboxBuildingSlot;
  readonly kind: SandboxBuildingRuntimeKind;
  readonly cost: number;
  readonly constructionSeconds: number;
  readonly maxHealth: number;
  readonly prerequisites: readonly SandboxBuildingSlot[];
  readonly maximumActivePerFaction: number | null;
  readonly displayByRace: Readonly<Record<BattleRace, SandboxCatalogDisplay>>;
}

const HUMAN_BUILDING_DISPLAY: Readonly<Record<
  SandboxBuildingSlot,
  SandboxCatalogDisplay
>> = Object.freeze({
  mine: Object.freeze({ name: "金矿", description: "从受控矿坑开采有限原矿。" }),
  barracks: Object.freeze({ name: "兵营", description: "训练长枪兵和剑士，并解锁高级建筑。" }),
  "archery-range": Object.freeze({ name: "靶场", description: "训练弓箭手。" }),
  "mage-tower": Object.freeze({ name: "法师塔", description: "训练法师。" }),
  "siege-workshop": Object.freeze({ name: "攻城工坊", description: "训练重型攻城单位。" }),
  "guard-tower": Object.freeze({ name: "守卫塔", description: "提供固定区域防御，每方最多两座。" }),
});

const UNDEAD_BUILDING_DISPLAY: Readonly<Record<
  SandboxBuildingSlot,
  SandboxCatalogDisplay
>> = Object.freeze({
  mine: Object.freeze({ name: "诅咒晶矿", description: "从受控矿坑汲取有限晶矿。" }),
  barracks: Object.freeze({ name: "墓穴兵营", description: "召唤骸骨先锋和墓穴卫士，并解锁高级建筑。" }),
  "archery-range": Object.freeze({ name: "骸骨弩场", description: "召唤骸骨弩手。" }),
  "mage-tower": Object.freeze({ name: "亡魂塔", description: "召唤亡魂术士。" }),
  "siege-workshop": Object.freeze({ name: "霜骨巢穴", description: "召唤重型冰霜骨龙。" }),
  "guard-tower": Object.freeze({ name: "魂火尖塔", description: "提供固定区域防御，每方最多两座。" }),
});

function buildingDisplay(
  slot: SandboxBuildingSlot,
): Readonly<Record<BattleRace, SandboxCatalogDisplay>> {
  return Object.freeze({
    human: HUMAN_BUILDING_DISPLAY[slot],
    undead: UNDEAD_BUILDING_DISPLAY[slot],
  });
}

function buildingPrerequisites(
  ...slots: SandboxBuildingSlot[]
): readonly SandboxBuildingSlot[] {
  return Object.freeze(slots);
}

export const SANDBOX_BUILDING_CATALOG = Object.freeze({
  mine: Object.freeze({
    slot: "mine",
    kind: "gold-mine",
    cost: 400,
    constructionSeconds: 6,
    maxHealth: 900,
    prerequisites: buildingPrerequisites(),
    maximumActivePerFaction: null,
    displayByRace: buildingDisplay("mine"),
  }),
  barracks: Object.freeze({
    slot: "barracks",
    kind: "barracks",
    cost: 400,
    constructionSeconds: 8,
    maxHealth: 1_200,
    prerequisites: buildingPrerequisites(),
    maximumActivePerFaction: null,
    displayByRace: buildingDisplay("barracks"),
  }),
  "archery-range": Object.freeze({
    slot: "archery-range",
    kind: "archery-range",
    cost: 500,
    constructionSeconds: 10,
    maxHealth: 1_000,
    prerequisites: buildingPrerequisites("barracks"),
    maximumActivePerFaction: null,
    displayByRace: buildingDisplay("archery-range"),
  }),
  "mage-tower": Object.freeze({
    slot: "mage-tower",
    kind: "mage-tower",
    cost: 700,
    constructionSeconds: 12,
    maxHealth: 900,
    prerequisites: buildingPrerequisites("barracks"),
    maximumActivePerFaction: null,
    displayByRace: buildingDisplay("mage-tower"),
  }),
  "siege-workshop": Object.freeze({
    slot: "siege-workshop",
    kind: "siege-workshop",
    cost: 800,
    constructionSeconds: 16,
    maxHealth: 1_400,
    prerequisites: buildingPrerequisites("barracks"),
    maximumActivePerFaction: null,
    displayByRace: buildingDisplay("siege-workshop"),
  }),
  "guard-tower": Object.freeze({
    slot: "guard-tower",
    kind: "guard-tower",
    cost: 500,
    constructionSeconds: 8,
    maxHealth: 450,
    prerequisites: buildingPrerequisites("barracks"),
    maximumActivePerFaction: 2,
    displayByRace: buildingDisplay("guard-tower"),
  }),
} as const satisfies Readonly<Record<SandboxBuildingSlot, SandboxBuildingCatalogEntry>>);

export const SANDBOX_TROOP_SLOTS = [
  "spearman",
  "swordsman",
  "archer",
  "mage",
  "catapult",
] as const satisfies readonly TroopKind[];

export type SandboxTroopSlot = typeof SANDBOX_TROOP_SLOTS[number];

export interface SandboxTroopCatalogEntry {
  readonly slot: SandboxTroopSlot;
  readonly producer: SandboxProductionBuildingSlot;
  readonly cost: number;
  readonly trainingSeconds: number;
  readonly entityCount: number;
  readonly populationCost: number;
  readonly roleByRace: Readonly<Record<BattleRace, UnitRole>>;
  readonly displayByRace: Readonly<Record<BattleRace, SandboxCatalogDisplay>>;
}

function troopDisplay(
  humanName: string,
  humanDescription: string,
  undeadName: string,
  undeadDescription: string,
): Readonly<Record<BattleRace, SandboxCatalogDisplay>> {
  return Object.freeze({
    human: Object.freeze({ name: humanName, description: humanDescription }),
    undead: Object.freeze({ name: undeadName, description: undeadDescription }),
  });
}

export const SANDBOX_TROOP_CATALOG = Object.freeze({
  spearman: Object.freeze({
    slot: "spearman",
    producer: "barracks",
    cost: 200,
    trainingSeconds: 6,
    entityCount: 2,
    populationCost: 2,
    roleByRace: Object.freeze({ human: "spearman", undead: "spearman" }),
    displayByRace: troopDisplay(
      "长枪兵",
      "低费长柄近战兵团。",
      "骸骨先锋",
      "快速成群突进的亡灵兵团。",
    ),
  }),
  swordsman: Object.freeze({
    slot: "swordsman",
    producer: "barracks",
    cost: 400,
    trainingSeconds: 8,
    entityCount: 3,
    populationCost: 3,
    roleByRace: Object.freeze({ human: "knight", undead: "knight" }),
    displayByRace: troopDisplay(
      "剑士",
      "可靠的近战前锋兵团。",
      "墓穴卫士",
      "缓慢而坚韧的重甲亡灵。",
    ),
  }),
  archer: Object.freeze({
    slot: "archer",
    producer: "archery-range",
    cost: 300,
    trainingSeconds: 8,
    entityCount: 2,
    populationCost: 2,
    roleByRace: Object.freeze({ human: "ranger", undead: "ranger" }),
    displayByRace: troopDisplay(
      "弓箭手",
      "远程单体火力兵团。",
      "骸骨弩手",
      "远距离高伤弩手兵团。",
    ),
  }),
  mage: Object.freeze({
    slot: "mage",
    producer: "mage-tower",
    cost: 600,
    trainingSeconds: 12,
    entityCount: 2,
    populationCost: 2,
    roleByRace: Object.freeze({ human: "mage", undead: "mage" }),
    displayByRace: troopDisplay(
      "法师",
      "使用范围法术的远程兵团。",
      "亡魂术士",
      "释放范围灵魂弹的亡灵术士。",
    ),
  }),
  catapult: Object.freeze({
    slot: "catapult",
    producer: "siege-workshop",
    cost: 800,
    trainingSeconds: 18,
    entityCount: 1,
    populationCost: 3,
    roleByRace: Object.freeze({ human: "catapult", undead: "bone-dragon" }),
    displayByRace: troopDisplay(
      "投石车",
      "用于摧毁坚固目标的重型攻城单位。",
      "冰霜骨龙",
      "使用范围冰霜吐息的重型亡灵。",
    ),
  }),
} as const satisfies Readonly<Record<SandboxTroopSlot, SandboxTroopCatalogEntry>>);

export function sandboxBuildingSpec(
  slot: SandboxBuildingSlot,
): SandboxBuildingCatalogEntry {
  return SANDBOX_BUILDING_CATALOG[slot];
}

export function sandboxBuildingSlotForKind(
  kind: string,
): SandboxBuildingSlot | null {
  return SANDBOX_BUILDING_SLOTS.find((slot) => (
    SANDBOX_BUILDING_CATALOG[slot].kind === kind
  )) ?? null;
}

export function sandboxTroopSpec(
  slot: SandboxTroopSlot,
): SandboxTroopCatalogEntry {
  return SANDBOX_TROOP_CATALOG[slot];
}

export function isSandboxBuildingSlot(value: string): value is SandboxBuildingSlot {
  return (SANDBOX_BUILDING_SLOTS as readonly string[]).includes(value);
}

export function isSandboxOrdinaryBuildingSlot(
  value: string,
): value is SandboxOrdinaryBuildingSlot {
  return value !== "mine" && isSandboxBuildingSlot(value);
}
