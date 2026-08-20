import type {
  AttackVisualKind,
  BattleRace,
  Faction,
  UnitCombatProfile,
  UnitRole,
} from "./types";
import {
  BONE_DRAGON_FROST_SLOW,
  HUMAN_MAGE_BURNING,
  type UnitStatusEffectApplication,
} from "./unitStatusEffects";

export const AI_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type AiDifficulty = typeof AI_DIFFICULTIES[number];
export type AiDeploymentPosture = "defensive" | "balanced" | "aggressive";

export const BATTLE_MATCH_MODES = [
  "campaign",
  "normal",
  "arena",
  "infinite",
] as const;
export type BattleMatchMode = typeof BATTLE_MATCH_MODES[number];
export type MatchBonusResource = "gold" | "experience";

export interface MatchFinalBonus {
  readonly resource: MatchBonusResource;
  readonly multiplier: number;
  readonly startsAtRemainingSeconds: number;
}

export interface MatchPolicy {
  readonly mode: BattleMatchMode;
  /** `null` is a serializable, explicit unlimited match. */
  readonly durationSeconds: number | null;
  readonly finalBonus: MatchFinalBonus | null;
  readonly timeoutResolution: "castle-health" | null;
}

export interface OpponentAiStrategy {
  readonly firstDecisionSeconds: number;
  readonly decisionIntervalSeconds: number;
  readonly buildingGoals: readonly {
    readonly kind: BuildingKind;
    readonly desiredActive: number;
  }[];
  readonly troopCycle: readonly TroopKind[];
  readonly deploymentPosture: AiDeploymentPosture;
}

export const DEFAULT_AI_DIFFICULTY: AiDifficulty = "easy";

export const DEPLOYABLE_CATEGORIES = {
  spearman: "troop",
  swordsman: "troop",
  archer: "troop",
  mage: "troop",
  catapult: "troop",
  "guard-tower": "building",
  "gold-mine": "building",
  barracks: "building",
} as const satisfies Readonly<Record<string, "troop" | "building">>;

export type DeployableKind = keyof typeof DEPLOYABLE_CATEGORIES;
export type BuildingKind = {
  [Kind in DeployableKind]: typeof DEPLOYABLE_CATEGORIES[Kind] extends "building"
    ? Kind
    : never;
}[DeployableKind];
export type TroopKind = Exclude<DeployableKind, BuildingKind>;

export const TROOP_KINDS: readonly TroopKind[] = (
  Object.keys(DEPLOYABLE_CATEGORIES) as DeployableKind[]
)
  .filter((kind): kind is TroopKind => DEPLOYABLE_CATEGORIES[kind] === "troop");

export interface UnitSpec {
  readonly attackMode: "melee" | "projectile" | "cone";
  readonly movementMode: "ground" | "flying";
  readonly attackVisualKind?: AttackVisualKind;
  readonly onHitStatusEffects?: readonly UnitStatusEffectApplication[];
  readonly coneAngleDegrees?: number;
  readonly maxHealth: number;
  readonly damage: number;
  readonly damageReduction: number;
  readonly attackRange: number;
  readonly attackCooldown: number;
  readonly moveSpeed: number;
  readonly aggroRange: number;
  readonly splashRadius: number;
  readonly projectileSpeed: number;
}

export interface GameRules {
  readonly match: Readonly<Record<BattleMatchMode, MatchPolicy>>;
  readonly economy: {
    readonly initialGold: number;
    readonly maximumGold: number;
    readonly goldPerRecovery: number;
    readonly normalRecoverySeconds: number;
    readonly doubleRecoverySeconds: number;
  };
  readonly deployment: {
    readonly costs: Readonly<Record<DeployableKind, number>>;
    readonly troopCounts: Readonly<Record<TroopKind, number>>;
  };
  readonly opponentAi: {
    readonly strategies: Readonly<Record<AiDifficulty, OpponentAiStrategy>>;
  };
  readonly targeting: {
    readonly routeCorridorWidth: number;
  };
  readonly buildings: {
    readonly destructionSeconds: number;
    readonly arrowTower: {
      readonly maxHealth: number;
      readonly damage: number;
      readonly attackRange: number;
      readonly attackCooldown: number;
      readonly projectileSpeed: number;
    };
    readonly guardTower: {
      readonly cost: number;
      readonly maxHealth: number;
      readonly lifetimeSeconds: number;
      readonly damage: number;
      readonly attackRange: number;
      readonly attackCooldown: number;
      readonly projectileSpeed: number;
      readonly maximumActivePerFaction: number;
    };
    readonly goldMine: {
      readonly cost: number;
      readonly maxHealth: number;
      readonly lifetimeSeconds: number;
      readonly firstProductionSeconds: number;
      readonly productionIntervalSeconds: number;
      readonly goldPerProduction: number;
      readonly maximumActivePerFaction: number;
    };
    readonly barracks: {
      readonly cost: number;
      readonly maxHealth: number;
      readonly lifetimeSeconds: number;
      readonly firstSpawnSeconds: number;
      readonly spawnIntervalSeconds: number;
      readonly spawnCount: number;
      readonly maximumActivePerFaction: number;
    };
  };
  readonly castle: {
    readonly maxHealth: number;
    readonly damage: number;
    readonly attackRange: number;
    readonly attackCooldown: number;
  };
  readonly units: Readonly<Record<UnitRole, UnitSpec>>;
}

export const UNIT_SPECS = {
  knight: {
    attackMode: "melee",
    movementMode: "ground",
    maxHealth: 230,
    damage: 6,
    damageReduction: 0.08,
    attackRange: 1.22,
    attackCooldown: 1.1,
    moveSpeed: 2.6,
    aggroRange: 7.5,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  spearman: {
    attackMode: "melee",
    movementMode: "ground",
    maxHealth: 140,
    damage: 5,
    damageReduction: 0,
    attackRange: 1.65,
    attackCooldown: 1.1,
    moveSpeed: 2.75,
    aggroRange: 7.5,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  ranger: {
    attackMode: "projectile",
    movementMode: "ground",
    maxHealth: 140,
    damage: 9,
    damageReduction: 0,
    attackRange: 7,
    attackCooldown: 1.35,
    moveSpeed: 2.85,
    aggroRange: 9,
    splashRadius: 0,
    projectileSpeed: 14,
  },
  mage: {
    attackMode: "projectile",
    movementMode: "ground",
    attackVisualKind: "fireball",
    onHitStatusEffects: [HUMAN_MAGE_BURNING],
    maxHealth: 180,
    damage: 11.75,
    damageReduction: 0.08,
    attackRange: 6.2,
    attackCooldown: 1.8,
    moveSpeed: 2.45,
    aggroRange: 8.5,
    splashRadius: 2.4,
    projectileSpeed: 9,
  },
  catapult: {
    attackMode: "projectile",
    movementMode: "ground",
    maxHealth: 380,
    damage: 47,
    damageReduction: 0.12,
    attackRange: 13.5,
    attackCooldown: 4,
    moveSpeed: 1.35,
    aggroRange: 13,
    splashRadius: 3,
    projectileSpeed: 7,
  },
  "bone-dragon": {
    attackMode: "cone",
    movementMode: "ground",
    onHitStatusEffects: [BONE_DRAGON_FROST_SLOW],
    coneAngleDegrees: 52,
    maxHealth: 480,
    damage: 34,
    damageReduction: 0.2,
    attackRange: 6.8,
    attackCooldown: 2.8,
    moveSpeed: 2.9,
    aggroRange: 10,
    splashRadius: 0,
    projectileSpeed: 0,
  },
} as const satisfies Readonly<Record<UnitRole, UnitSpec>>;

export const UNDEAD_UNIT_SPECS = {
  spearman: {
    attackMode: "melee",
    movementMode: "ground",
    maxHealth: 22,
    damage: 4,
    damageReduction: 0,
    attackRange: 1.35,
    attackCooldown: 0.68,
    moveSpeed: 3.15,
    aggroRange: 8,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  knight: {
    attackMode: "melee",
    movementMode: "ground",
    maxHealth: 540,
    damage: 16,
    damageReduction: 0.18,
    attackRange: 1.18,
    attackCooldown: 1.55,
    moveSpeed: 2.15,
    aggroRange: 7,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  ranger: {
    attackMode: "projectile",
    movementMode: "ground",
    maxHealth: 105,
    damage: 14,
    damageReduction: 0,
    attackRange: 8,
    attackCooldown: 2.1,
    moveSpeed: 2.45,
    aggroRange: 10.5,
    splashRadius: 0,
    projectileSpeed: 18,
  },
  mage: {
    attackMode: "projectile",
    movementMode: "ground",
    maxHealth: 135,
    damage: 8.5,
    damageReduction: 0,
    attackRange: 5.4,
    attackCooldown: 1.25,
    moveSpeed: 2.55,
    aggroRange: 8,
    splashRadius: 3.1,
    projectileSpeed: 7.5,
  },
  "bone-dragon": UNIT_SPECS["bone-dragon"],
} as const satisfies Readonly<Partial<Record<UnitRole, UnitSpec>>>;

export const TROOP_ROLE_BY_DEPLOYABLE = {
  spearman: "spearman",
  swordsman: "knight",
  archer: "ranger",
  mage: "mage",
  catapult: "catapult",
} as const satisfies Readonly<Record<TroopKind, UnitRole>>;

export const HUMAN_TROOP_COUNTS = {
  spearman: 2,
  swordsman: 3,
  archer: 2,
  mage: 2,
  catapult: 1,
} as const satisfies Readonly<Record<TroopKind, number>>;

export const HUMAN_TROOP_DESIGNS = {
  spearman: {
    name: "长枪兵",
    identity: "低费长柄近战",
  },
  swordsman: {
    name: "剑士",
    identity: "近战前锋",
  },
  archer: {
    name: "弓箭手",
    identity: "远程单体",
  },
  mage: {
    name: "法师",
    identity: "范围法术",
  },
  catapult: {
    name: "投石车",
    identity: "重型攻城",
  },
} as const satisfies Readonly<Record<
  TroopKind,
  { readonly name: string; readonly identity: string }
>>;

export const UNDEAD_TROOP_ROLE_BY_DEPLOYABLE = {
  spearman: "spearman",
  swordsman: "knight",
  archer: "ranger",
  mage: "mage",
  catapult: "bone-dragon",
} as const satisfies Readonly<Record<TroopKind, UnitRole>>;

export const UNDEAD_TROOP_COUNTS = {
  spearman: 5,
  swordsman: 1,
  archer: 2,
  mage: 2,
  catapult: 1,
} as const satisfies Readonly<Record<TroopKind, number>>;

export interface BarracksRaceRules {
  readonly cost: number;
  readonly firstSpawnSeconds: number;
  readonly spawnIntervalSeconds: number;
  readonly spawnCount: number;
}

export const BARRACKS_RULES_BY_RACE = {
  human: {
    cost: 500,
    firstSpawnSeconds: 5,
    spawnIntervalSeconds: 8,
    spawnCount: 4,
  },
  undead: {
    cost: 700,
    firstSpawnSeconds: 6,
    spawnIntervalSeconds: 12,
    spawnCount: 2,
  },
} as const satisfies Readonly<Record<BattleRace, BarracksRaceRules>>;

export const UNDEAD_TROOP_DESIGNS = {
  spearman: {
    name: "骸骨先锋",
    identity: "低血量、快速成群突进",
  },
  swordsman: {
    name: "墓穴卫士",
    identity: "高血量、重甲、慢速重击",
  },
  archer: {
    name: "骸骨弩手",
    identity: "超远射程、慢速高伤弩箭",
  },
  mage: {
    name: "亡魂术士",
    identity: "中短射程、快速大范围灵魂弹",
  },
  catapult: {
    name: "冰霜骨龙",
    identity: "地面重甲、高血量、范围冰霜喷吐",
  },
} as const satisfies Readonly<Record<
  TroopKind,
  { readonly name: string; readonly identity: string }
>>;

export const UNDEAD_AI_TROOP_CYCLES = {
  easy: ["spearman", "archer", "swordsman", "catapult"],
  normal: ["spearman", "swordsman", "catapult", "archer", "mage"],
  hard: ["catapult", "spearman", "swordsman", "archer", "mage"],
} as const satisfies Readonly<Record<AiDifficulty, readonly TroopKind[]>>;

export const HUMAN_AI_TROOP_CYCLES = {
  easy: ["spearman", "archer", "swordsman"],
  normal: ["spearman", "swordsman", "archer", "mage"],
  hard: ["spearman", "swordsman", "archer", "mage", "catapult"],
} as const satisfies Readonly<Record<AiDifficulty, readonly TroopKind[]>>;

export interface RaceDeploymentCatalog {
  readonly troopRoles: Readonly<Record<TroopKind, UnitRole>>;
  readonly troopCounts: Readonly<Record<TroopKind, number>>;
  readonly troopDesigns: Readonly<Record<
    TroopKind,
    { readonly name: string; readonly identity: string }
  >>;
  readonly barracks: {
    readonly name: string;
    readonly productionVerb: string;
    readonly spawnedUnit: TroopKind;
  };
  readonly aiTroopCycles: Readonly<Record<AiDifficulty, readonly TroopKind[]>>;
}

export const RACE_DEPLOYMENT_CATALOG = {
  human: {
    troopRoles: TROOP_ROLE_BY_DEPLOYABLE,
    troopCounts: HUMAN_TROOP_COUNTS,
    troopDesigns: HUMAN_TROOP_DESIGNS,
    barracks: {
      name: "兵营",
      productionVerb: "训练",
      spawnedUnit: "swordsman",
    },
    aiTroopCycles: HUMAN_AI_TROOP_CYCLES,
  },
  undead: {
    troopRoles: UNDEAD_TROOP_ROLE_BY_DEPLOYABLE,
    troopCounts: UNDEAD_TROOP_COUNTS,
    troopDesigns: UNDEAD_TROOP_DESIGNS,
    barracks: {
      name: "墓穴兵营",
      productionVerb: "召唤",
      spawnedUnit: "swordsman",
    },
    aiTroopCycles: UNDEAD_AI_TROOP_CYCLES,
  },
} as const satisfies Readonly<Record<BattleRace, RaceDeploymentCatalog>>;

export function unitSpecFor(
  role: UnitRole,
  combatProfile: UnitCombatProfile = "human",
): UnitSpec {
  if (combatProfile === "undead" && role in UNDEAD_UNIT_SPECS) {
    return UNDEAD_UNIT_SPECS[role as keyof typeof UNDEAD_UNIT_SPECS];
  }
  return UNIT_SPECS[role];
}

export function unitRoleForDeployment(
  kind: TroopKind,
  faction: Faction,
  undeadOpponent: boolean,
): UnitRole {
  return unitRoleForRace(
    kind,
    undeadOpponent && faction === "crimson" ? "undead" : "human",
  );
}

export function unitRoleForRace(kind: TroopKind, race: BattleRace): UnitRole {
  return RACE_DEPLOYMENT_CATALOG[race].troopRoles[kind];
}

export function troopCountForDeployment(
  kind: TroopKind,
  faction: Faction,
  undeadOpponent: boolean,
): number {
  return troopCountForRace(
    kind,
    undeadOpponent && faction === "crimson" ? "undead" : "human",
  );
}

export function troopCountForRace(kind: TroopKind, race: BattleRace): number {
  return RACE_DEPLOYMENT_CATALOG[race].troopCounts[kind];
}

export function troopDesignForRace(kind: TroopKind, race: BattleRace) {
  return RACE_DEPLOYMENT_CATALOG[race].troopDesigns[kind];
}

export function barracksDesignForRace(race: BattleRace) {
  return RACE_DEPLOYMENT_CATALOG[race].barracks;
}

export function barracksRulesForRace(race: BattleRace): BarracksRaceRules {
  return BARRACKS_RULES_BY_RACE[race];
}

export function deploymentCostForRace(
  kind: DeployableKind,
  race: BattleRace,
): number {
  return kind === "barracks"
    ? barracksRulesForRace(race).cost
    : GAME_RULES.deployment.costs[kind];
}

export function aiTroopCycleForRace(
  race: BattleRace,
  difficulty: AiDifficulty,
): readonly TroopKind[] {
  return RACE_DEPLOYMENT_CATALOG[race].aiTroopCycles[difficulty];
}

const GOLD_MINE_COST = 700;
const BARRACKS_COST = BARRACKS_RULES_BY_RACE.human.cost;
const GUARD_TOWER_COST = 300;
const CASTLE_MAX_HEALTH = 2000;

export const MATCH_POLICIES = {
  campaign: {
    mode: "campaign",
    durationSeconds: 180,
    finalBonus: {
      resource: "gold",
      multiplier: 2,
      startsAtRemainingSeconds: 60,
    },
    timeoutResolution: "castle-health",
  },
  normal: {
    mode: "normal",
    durationSeconds: 300,
    finalBonus: {
      resource: "experience",
      multiplier: 2,
      startsAtRemainingSeconds: 60,
    },
    timeoutResolution: "castle-health",
  },
  arena: {
    mode: "arena",
    durationSeconds: 300,
    finalBonus: {
      resource: "experience",
      multiplier: 2,
      startsAtRemainingSeconds: 60,
    },
    timeoutResolution: "castle-health",
  },
  infinite: {
    mode: "infinite",
    durationSeconds: null,
    finalBonus: null,
    timeoutResolution: null,
  },
} as const satisfies Readonly<Record<BattleMatchMode, MatchPolicy>>;

export const GAME_RULES = {
  match: MATCH_POLICIES,
  economy: {
    initialGold: 500,
    maximumGold: 1000,
    goldPerRecovery: 100,
    normalRecoverySeconds: 2.8,
    doubleRecoverySeconds: 1.4,
  },
  deployment: {
    costs: {
      spearman: 200,
      swordsman: 400,
      archer: 300,
      mage: 600,
      catapult: 800,
      "guard-tower": GUARD_TOWER_COST,
      "gold-mine": GOLD_MINE_COST,
      barracks: BARRACKS_COST,
    },
    troopCounts: HUMAN_TROOP_COUNTS,
  },
  opponentAi: {
    strategies: {
      easy: {
        firstDecisionSeconds: 4,
        decisionIntervalSeconds: 24,
        buildingGoals: [],
        troopCycle: HUMAN_AI_TROOP_CYCLES.easy,
        deploymentPosture: "defensive",
      },
      normal: {
        firstDecisionSeconds: 6,
        decisionIntervalSeconds: 10,
        buildingGoals: [
          { kind: "gold-mine", desiredActive: 1 },
        ],
        troopCycle: HUMAN_AI_TROOP_CYCLES.normal,
        deploymentPosture: "balanced",
      },
      hard: {
        firstDecisionSeconds: 1,
        decisionIntervalSeconds: 1,
        buildingGoals: [
          { kind: "gold-mine", desiredActive: 1 },
          { kind: "barracks", desiredActive: 1 },
          { kind: "guard-tower", desiredActive: 1 },
        ],
        troopCycle: HUMAN_AI_TROOP_CYCLES.hard,
        deploymentPosture: "aggressive",
      },
    },
  },
  targeting: {
    routeCorridorWidth: 3,
  },
  buildings: {
    destructionSeconds: 0.8,
    arrowTower: {
      maxHealth: CASTLE_MAX_HEALTH / 4,
      damage: UNIT_SPECS.ranger.damage,
      attackRange: UNIT_SPECS.ranger.attackRange,
      attackCooldown: UNIT_SPECS.ranger.attackCooldown,
      projectileSpeed: UNIT_SPECS.ranger.projectileSpeed,
    },
    guardTower: {
      cost: GUARD_TOWER_COST,
      maxHealth: 450,
      lifetimeSeconds: 20,
      damage: 7,
      attackRange: 7,
      attackCooldown: 1.35,
      projectileSpeed: 14,
      maximumActivePerFaction: 1,
    },
    goldMine: {
      cost: GOLD_MINE_COST,
      maxHealth: 900,
      lifetimeSeconds: 36,
      firstProductionSeconds: 4,
      productionIntervalSeconds: 4,
      goldPerProduction: 100,
      maximumActivePerFaction: 1,
    },
    barracks: {
      cost: BARRACKS_COST,
      maxHealth: 1200,
      lifetimeSeconds: 30,
      firstSpawnSeconds: BARRACKS_RULES_BY_RACE.human.firstSpawnSeconds,
      spawnIntervalSeconds: BARRACKS_RULES_BY_RACE.human.spawnIntervalSeconds,
      spawnCount: BARRACKS_RULES_BY_RACE.human.spawnCount,
      maximumActivePerFaction: 2,
    },
  },
  castle: {
    maxHealth: CASTLE_MAX_HEALTH,
    damage: 60,
    attackRange: 8,
    attackCooldown: 1.5,
  },
  units: UNIT_SPECS,
} as const satisfies GameRules;

export const BUILDING_ACTIVE_LIMITS = {
  "guard-tower": GAME_RULES.buildings.guardTower.maximumActivePerFaction,
  "gold-mine": GAME_RULES.buildings.goldMine.maximumActivePerFaction,
  barracks: GAME_RULES.buildings.barracks.maximumActivePerFaction,
} as const satisfies Readonly<Record<BuildingKind, number>>;

export function isBuildingDeployable(kind: DeployableKind): kind is BuildingKind {
  return DEPLOYABLE_CATEGORIES[kind] === "building";
}

export function validateGameRules(rules: GameRules): string[] {
  const errors: string[] = [];
  const {
    match,
    economy,
    deployment,
    opponentAi,
    targeting,
    buildings,
    castle,
    units,
  } = rules;

  for (const mode of BATTLE_MATCH_MODES) {
    const policy = match[mode];
    const path = `match.${mode}`;
    if (policy.mode !== mode) errors.push(`${path}.mode must match its configuration key`);
    if (policy.durationSeconds === null) {
      if (policy.finalBonus !== null) {
        errors.push(`${path}.finalBonus must be null when the match is unlimited`);
      }
      if (policy.timeoutResolution !== null) {
        errors.push(`${path}.timeoutResolution must be null when the match is unlimited`);
      }
      continue;
    }
    if (!isPositive(policy.durationSeconds)) {
      errors.push(`${path}.durationSeconds must be positive or null`);
    }
    if (policy.timeoutResolution !== "castle-health") {
      errors.push(`${path}.timeoutResolution must compare castle health`);
    }
    if (policy.finalBonus) {
      if (!isPositive(policy.finalBonus.multiplier) || policy.finalBonus.multiplier <= 1) {
        errors.push(`${path}.finalBonus.multiplier must be greater than one`);
      }
      if (
        !isPositive(policy.finalBonus.startsAtRemainingSeconds)
        || policy.finalBonus.startsAtRemainingSeconds > policy.durationSeconds
      ) {
        errors.push(`${path}.finalBonus must start inside the match duration`);
      }
    }
  }
  if (!isNonNegative(economy.initialGold) || economy.initialGold > economy.maximumGold) {
    errors.push("economy.initialGold must be between zero and maximumGold");
  }
  if (!isPositive(economy.maximumGold)) errors.push("economy.maximumGold must be positive");
  if (!isPositive(economy.goldPerRecovery)) errors.push("economy.goldPerRecovery must be positive");
  for (const [key, value] of [
    ["initialGold", economy.initialGold],
    ["maximumGold", economy.maximumGold],
    ["goldPerRecovery", economy.goldPerRecovery],
  ] as const) {
    if (!Number.isInteger(value) || value % 100 !== 0) {
      errors.push(`economy.${key} must be a multiple of 100`);
    }
  }
  if (!isPositive(economy.normalRecoverySeconds)) {
    errors.push("economy.normalRecoverySeconds must be positive");
  }
  if (!isPositive(economy.doubleRecoverySeconds)) {
    errors.push("economy.doubleRecoverySeconds must be positive");
  }
  if (
    isPositive(economy.normalRecoverySeconds)
    && isPositive(economy.doubleRecoverySeconds)
    && Math.abs(economy.normalRecoverySeconds / economy.doubleRecoverySeconds - 2) > 1e-9
  ) errors.push("double gold recovery must be exactly twice the normal rate");

  for (const [kind, cost] of Object.entries(deployment.costs)) {
    if (!Number.isInteger(cost) || cost < 100 || cost > 1000 || cost % 100 !== 0) {
      errors.push(`deployment.costs.${kind} must be a multiple of 100 from 100 to 1000`);
    }
  }
  for (const [kind, count] of Object.entries(deployment.troopCounts)) {
    if (!Number.isInteger(count) || count <= 0) {
      errors.push(`deployment.troopCounts.${kind} must be a positive integer`);
    }
  }
  if (deployment.costs["gold-mine"] !== buildings.goldMine.cost) {
    errors.push("gold mine deployment and building costs must match");
  }
  if (deployment.costs.barracks !== buildings.barracks.cost) {
    errors.push("barracks deployment and building costs must match");
  }
  if (deployment.costs["guard-tower"] !== buildings.guardTower.cost) {
    errors.push("guard tower deployment and building costs must match");
  }
  const activeLimitByBuilding = {
    "guard-tower": buildings.guardTower.maximumActivePerFaction,
    "gold-mine": buildings.goldMine.maximumActivePerFaction,
    barracks: buildings.barracks.maximumActivePerFaction,
  } satisfies Readonly<Record<BuildingKind, number>>;
  for (const difficulty of AI_DIFFICULTIES) {
    const strategy = opponentAi.strategies[difficulty];
    const prefix = `opponentAi.strategies.${difficulty}`;
    validatePositiveGroup(errors, prefix, strategy, [
      "firstDecisionSeconds",
      "decisionIntervalSeconds",
    ]);
    if (strategy.troopCycle.length === 0) {
      errors.push(`${prefix}.troopCycle must not be empty`);
    }
    const seenBuildingGoals = new Set<BuildingKind>();
    for (const goal of strategy.buildingGoals) {
      if (!Number.isInteger(goal.desiredActive) || goal.desiredActive <= 0) {
        errors.push("opponent AI desired active building counts must be positive integers");
      }
      const maximum = activeLimitByBuilding[goal.kind];
      if (goal.desiredActive > maximum) {
        errors.push("opponent AI preferred buildings must not exceed active limits");
      }
      if (seenBuildingGoals.has(goal.kind)) {
        errors.push(`${prefix}.buildingGoals must not repeat a building kind`);
      }
      seenBuildingGoals.add(goal.kind);
    }
  }
  for (const kind of ["spearman", "swordsman", "archer", "mage"] as const) {
    const cost = deployment.costs[kind];
    if (cost < 200 || cost > 700) errors.push(`${kind} cost must be from 200 to 700`);
  }
  if (deployment.costs.catapult < 700 || deployment.costs.catapult > 800) {
    errors.push("catapult cost must be from 700 to 800");
  }
  if (!isPositive(targeting.routeCorridorWidth)) {
    errors.push("targeting.routeCorridorWidth must be positive");
  }

  if (!isPositive(buildings.destructionSeconds)) {
    errors.push("buildings.destructionSeconds must be positive");
  }
  validatePositiveGroup(errors, "buildings.goldMine", buildings.goldMine, [
    "maxHealth",
    "lifetimeSeconds",
    "firstProductionSeconds",
    "productionIntervalSeconds",
    "goldPerProduction",
    "maximumActivePerFaction",
  ]);
  validatePositiveGroup(errors, "buildings.barracks", buildings.barracks, [
    "maxHealth",
    "lifetimeSeconds",
    "firstSpawnSeconds",
    "spawnIntervalSeconds",
    "spawnCount",
    "maximumActivePerFaction",
  ]);
  validatePositiveGroup(errors, "buildings.arrowTower", buildings.arrowTower, [
    "maxHealth",
    "damage",
    "attackRange",
    "attackCooldown",
    "projectileSpeed",
  ]);
  validatePositiveGroup(errors, "buildings.guardTower", buildings.guardTower, [
    "cost",
    "maxHealth",
    "lifetimeSeconds",
    "damage",
    "attackRange",
    "attackCooldown",
    "projectileSpeed",
    "maximumActivePerFaction",
  ]);
  if (buildings.goldMine.firstProductionSeconds > buildings.goldMine.lifetimeSeconds) {
    errors.push("gold mine must produce before its lifetime ends");
  }
  const finalSpawnSeconds = buildings.barracks.firstSpawnSeconds
    + (buildings.barracks.spawnCount - 1) * buildings.barracks.spawnIntervalSeconds;
  if (finalSpawnSeconds > buildings.barracks.lifetimeSeconds) {
    errors.push("barracks final spawn must happen before its lifetime ends");
  }
  if (!Number.isInteger(buildings.goldMine.maximumActivePerFaction)) {
    errors.push("gold mine maximumActivePerFaction must be an integer");
  }
  if (
    !Number.isInteger(buildings.barracks.maximumActivePerFaction)
    || !Number.isInteger(buildings.barracks.spawnCount)
  ) errors.push("barracks counts must be integers");
  if (!Number.isInteger(buildings.guardTower.maximumActivePerFaction)) {
    errors.push("guard tower maximumActivePerFaction must be an integer");
  }
  if (
    !Number.isInteger(buildings.goldMine.goldPerProduction)
    || buildings.goldMine.goldPerProduction % 100 !== 0
  ) errors.push("gold mine production must be a multiple of 100");
  validatePositiveGroup(errors, "castle", castle, [
    "maxHealth",
    "damage",
    "attackRange",
    "attackCooldown",
  ]);
  if (castle.attackRange < Math.max(units.ranger.attackRange, units.mage.attackRange)) {
    errors.push("castle.attackRange must reach ranger and mage attack ranges");
  }
  if (buildings.arrowTower.maxHealth !== castle.maxHealth / 4) {
    errors.push("arrow tower health must equal one-quarter castle health");
  }
  if (buildings.arrowTower.attackRange !== units.ranger.attackRange) {
    errors.push("arrow tower range must equal ranger attack range");
  }

  for (const [role, spec] of Object.entries(units)) {
    validatePositiveGroup(errors, `units.${role}`, spec, [
      "maxHealth",
      "damage",
      "attackRange",
      "attackCooldown",
      "moveSpeed",
      "aggroRange",
    ]);
    if (!isNonNegative(spec.splashRadius)) {
      errors.push(`units.${role}.splashRadius must not be negative`);
    }
    if (!isNonNegative(spec.damageReduction) || spec.damageReduction >= 1) {
      errors.push(`units.${role}.damageReduction must be from zero up to but not including one`);
    }
    if (spec.attackMode === "projectile" && !isPositive(spec.projectileSpeed)) {
      errors.push(`units.${role}.projectileSpeed must be positive for projectile attacks`);
    }
    if (
      spec.attackMode === "cone"
      && (
        !isPositive(spec.coneAngleDegrees)
        || spec.coneAngleDegrees > 180
      )
    ) errors.push(`units.${role}.coneAngleDegrees must be from zero to 180 for cone attacks`);
  }

  return errors;
}

function validatePositiveGroup(
  errors: string[],
  prefix: string,
  values: object,
  keys: readonly string[],
): void {
  const indexedValues = values as Readonly<Record<string, unknown>>;
  for (const key of keys) {
    if (!isPositive(indexedValues[key])) errors.push(`${prefix}.${key} must be positive`);
  }
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const configurationErrors = validateGameRules(GAME_RULES);
if (configurationErrors.length > 0) {
  throw new Error(`Invalid game rules:\n${configurationErrors.join("\n")}`);
}
