import type { UnitRole } from "./types";

export type DeployableKind =
  | "swordsman"
  | "archer"
  | "mage"
  | "catapult"
  | "gold-mine"
  | "barracks";

export type BuildingKind = "gold-mine" | "barracks";
export type TroopKind = Exclude<DeployableKind, BuildingKind>;

export interface UnitSpec {
  readonly attackMode: "melee" | "projectile";
  readonly rangeResponse: "stand" | "skirmish";
  readonly maxHealth: number;
  readonly damage: number;
  readonly attackRange: number;
  readonly minimumRange: number;
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
    rangeResponse: "stand",
    maxHealth: 220,
    damage: 5.25,
    attackRange: 1.22,
    minimumRange: 0,
    attackCooldown: 1.1,
    moveSpeed: 3.25,
    aggroRange: 7.5,
    splashRadius: 0,
    projectileSpeed: 0,
  },
  ranger: {
    attackMode: "projectile",
    rangeResponse: "skirmish",
    maxHealth: 122,
    damage: 4,
    attackRange: 7,
    minimumRange: 5.5,
    attackCooldown: 1.4,
    moveSpeed: 3.55,
    aggroRange: 9,
    splashRadius: 0,
    projectileSpeed: 14,
  },
  mage: {
    attackMode: "projectile",
    rangeResponse: "skirmish",
    maxHealth: 102,
    damage: 5,
    attackRange: 6.2,
    minimumRange: 4.5,
    attackCooldown: 2,
    moveSpeed: 3.05,
    aggroRange: 8.5,
    splashRadius: 2.25,
    projectileSpeed: 8,
  },
  catapult: {
    attackMode: "projectile",
    rangeResponse: "stand",
    maxHealth: 360,
    damage: 42,
    attackRange: 13.5,
    minimumRange: 0,
    attackCooldown: 4,
    moveSpeed: 1.65,
    aggroRange: 13,
    splashRadius: 2.8,
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
const BARRACKS_COST = 700;

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
      swordsman: 300,
      archer: 300,
      mage: 400,
      catapult: 800,
      "gold-mine": GOLD_MINE_COST,
      barracks: BARRACKS_COST,
    },
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

export function validateGameRules(rules: GameRules): string[] {
  const errors: string[] = [];
  const { match, economy, deployment, buildings, castle, units } = rules;

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
  if (deployment.costs["gold-mine"] !== buildings.goldMine.cost) {
    errors.push("gold mine deployment and building costs must match");
  }
  if (deployment.costs.barracks !== buildings.barracks.cost) {
    errors.push("barracks deployment and building costs must match");
  }
  for (const kind of ["swordsman", "archer", "mage"] as const) {
    const cost = deployment.costs[kind];
    if (cost < 200 || cost > 700) errors.push(`${kind} cost must be from 200 to 700`);
  }
  if (deployment.costs.catapult < 700 || deployment.costs.catapult > 800) {
    errors.push("catapult cost must be from 700 to 800");
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

  for (const [role, spec] of Object.entries(units)) {
    validatePositiveGroup(errors, `units.${role}`, spec, [
      "maxHealth",
      "damage",
      "attackRange",
      "attackCooldown",
      "moveSpeed",
      "aggroRange",
    ]);
    if (!isNonNegative(spec.minimumRange) || spec.minimumRange > spec.attackRange) {
      errors.push(`units.${role}.minimumRange must be inside attack range`);
    }
    if (!isNonNegative(spec.splashRadius)) {
      errors.push(`units.${role}.splashRadius must not be negative`);
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
