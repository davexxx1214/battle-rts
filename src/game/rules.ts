import type { UnitRole } from "./types";

export const DEPLOYABLE_CATEGORIES = {
  swordsman: "troop",
  archer: "troop",
  mage: "troop",
  catapult: "troop",
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
  readonly attackMode: "melee" | "projectile";
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
  readonly match: {
    readonly durationSeconds: number;
    readonly doubleGoldStartsAtSeconds: number;
  };
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
    readonly decisionIntervalSeconds: number;
    readonly buildingGoals: readonly {
      readonly kind: BuildingKind;
      readonly desiredActive: number;
    }[];
    readonly troopCycle: readonly TroopKind[];
  };
  readonly targeting: {
    readonly routeCorridorWidth: number;
  };
  readonly buildings: {
    readonly destructionSeconds: number;
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
      readonly spawnedUnit: TroopKind;
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
    maxHealth: 230,
    damage: 6,
    damageReduction: 0.08,
    attackRange: 1.22,
    attackCooldown: 1.1,
    moveSpeed: 3.25,
    aggroRange: 7.5,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  ranger: {
    attackMode: "projectile",
    maxHealth: 140,
    damage: 9,
    damageReduction: 0,
    attackRange: 7,
    attackCooldown: 1.35,
    moveSpeed: 3.55,
    aggroRange: 9,
    splashRadius: 0,
    projectileSpeed: 14,
  },
  mage: {
    attackMode: "projectile",
    maxHealth: 180,
    damage: 11.75,
    damageReduction: 0.08,
    attackRange: 6.2,
    attackCooldown: 1.8,
    moveSpeed: 3.05,
    aggroRange: 8.5,
    splashRadius: 2.4,
    projectileSpeed: 9,
  },
  catapult: {
    attackMode: "projectile",
    maxHealth: 380,
    damage: 47,
    damageReduction: 0.12,
    attackRange: 13.5,
    attackCooldown: 4,
    moveSpeed: 1.65,
    aggroRange: 13,
    splashRadius: 3,
    projectileSpeed: 7,
  },
} as const satisfies Readonly<Record<UnitRole, UnitSpec>>;

export const TROOP_ROLE_BY_DEPLOYABLE = {
  swordsman: "knight",
  archer: "ranger",
  mage: "mage",
  catapult: "catapult",
} as const satisfies Readonly<Record<TroopKind, UnitRole>>;

const GOLD_MINE_COST = 700;
const BARRACKS_COST = 600;

export const GAME_RULES = {
  match: {
    durationSeconds: 180,
    doubleGoldStartsAtSeconds: 120,
  },
  economy: {
    initialGold: 500,
    maximumGold: 1000,
    goldPerRecovery: 100,
    normalRecoverySeconds: 2.8,
    doubleRecoverySeconds: 1.4,
  },
  deployment: {
    costs: {
      swordsman: 400,
      archer: 300,
      mage: 600,
      catapult: 800,
      "gold-mine": GOLD_MINE_COST,
      barracks: BARRACKS_COST,
    },
    troopCounts: {
      swordsman: 3,
      archer: 2,
      mage: 2,
      catapult: 1,
    },
  },
  opponentAi: {
    decisionIntervalSeconds: 1,
    buildingGoals: [
      { kind: "gold-mine", desiredActive: 1 },
      { kind: "barracks", desiredActive: 1 },
    ],
    troopCycle: ["swordsman", "archer", "mage", "catapult"],
  },
  targeting: {
    routeCorridorWidth: 3,
  },
  buildings: {
    destructionSeconds: 0.8,
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
      firstSpawnSeconds: 5,
      spawnIntervalSeconds: 10,
      spawnCount: 3,
      spawnedUnit: "swordsman",
      maximumActivePerFaction: 2,
    },
  },
  castle: {
    maxHealth: 2000,
    damage: 60,
    attackRange: 8,
    attackCooldown: 1.5,
  },
  units: UNIT_SPECS,
} as const satisfies GameRules;

export const BUILDING_ACTIVE_LIMITS = {
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

  if (!isPositive(match.durationSeconds)) errors.push("match.durationSeconds must be positive");
  if (
    !isPositive(match.doubleGoldStartsAtSeconds)
    || match.doubleGoldStartsAtSeconds >= match.durationSeconds
  ) errors.push("match.doubleGoldStartsAtSeconds must be inside the match duration");
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
  validatePositiveGroup(errors, "opponentAi", opponentAi, ["decisionIntervalSeconds"]);
  if (opponentAi.troopCycle.length === 0) {
    errors.push("opponentAi.troopCycle must not be empty");
  }
  const activeLimitByBuilding = {
    "gold-mine": buildings.goldMine.maximumActivePerFaction,
    barracks: buildings.barracks.maximumActivePerFaction,
  } satisfies Readonly<Record<BuildingKind, number>>;
  const seenBuildingGoals = new Set<BuildingKind>();
  for (const goal of opponentAi.buildingGoals) {
    if (!Number.isInteger(goal.desiredActive) || goal.desiredActive <= 0) {
      errors.push("opponent AI desired active building counts must be positive integers");
    }
    const maximum = activeLimitByBuilding[goal.kind];
    if (goal.desiredActive > maximum) {
      errors.push("opponent AI preferred buildings must not exceed active limits");
    }
    if (seenBuildingGoals.has(goal.kind)) {
      errors.push("opponentAi.buildingGoals must not repeat a building kind");
    }
    seenBuildingGoals.add(goal.kind);
  }
  for (const kind of ["swordsman", "archer", "mage"] as const) {
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
