import type { BattleState } from "../game/battle";
import { battleModeDefinitionFor } from "../game/battleMode";
import { battleBuildingConstructionPhaseAt } from "../game/buildings";
import {
  MAXIMUM_GROSS_ORE_PER_CYCLE,
  MINING_CYCLE_SECONDS,
  emergencyMinePermitEligibility,
  miningIncomeMultiplier,
} from "../game/miningEconomy";
import { sandboxUsedPopulation } from "../game/population";
import { sandboxBuildingSpec } from "../game/sandboxCatalog";
import {
  SANDBOX_PRODUCTION_POPULATION_CAP,
  sandboxProductionPopulation,
} from "../game/sandboxProductionQueue";
import type { Faction } from "../game/types";

export interface SandboxMineHudItem {
  readonly pitId: string;
  readonly remainingOre: number;
  readonly projectedNetValue: number;
  readonly roiWarning: boolean;
  readonly statusLabel: string;
}

export interface SandboxHudModel {
  readonly gold: number;
  readonly goldCap: number;
  readonly walletFull: boolean;
  readonly totalRemainingOre: number;
  readonly usedPopulation: number;
  readonly reservedPopulation: number;
  readonly committedPopulation: number;
  readonly populationCap: number;
  readonly incomeMultiplier: 1 | 0.8 | 0.6;
  readonly incomePercent: number;
  readonly upkeepPercent: number;
  readonly grossPerCycle: number;
  readonly upkeepPerCycle: number;
  readonly netPerCycle: number;
  readonly cycleSeconds: number;
  readonly nextThresholdLabel: string;
  readonly roiOreThreshold: number;
  readonly emergencyMinePermitAvailable: boolean;
  readonly mines: readonly SandboxMineHudItem[];
}

export function createSandboxHudModel(
  battle: BattleState,
  faction: Faction = "verdant",
): SandboxHudModel {
  const production = battle.production;
  const queuePopulation = production
    ? sandboxProductionPopulation(production, faction)
    : { reservedPopulation: 0, readyBlockedPopulation: 0, totalQueuePopulation: 0 };
  const usedPopulation = sandboxUsedPopulation(
    battle.units,
    faction,
    queuePopulation.readyBlockedPopulation,
  );
  const committedPopulation = usedPopulation + queuePopulation.reservedPopulation;
  const incomeMultiplier = miningIncomeMultiplier(usedPopulation);
  const incomePercent = Math.round(incomeMultiplier * 100);
  const upkeepPercent = 100 - incomePercent;
  const grossPerCycle = MAXIMUM_GROSS_ORE_PER_CYCLE;
  const netPerCycle = grossPerCycle * incomeMultiplier;
  const upkeepPerCycle = grossPerCycle - netPerCycle;
  const account = battle.economy.accounts[faction];
  const goldCap = battleModeDefinitionFor(battle.modeId).economyPolicy.maximumGold;
  const pits = battle.mining ? Object.values(battle.mining.pitsById) : [];
  const buildingById = new Map(battle.buildings.map((building) => [building.id, building]));
  const mines = pits
    .filter((pit) => {
      const occupying = pit.occupyingMineId ? buildingById.get(pit.occupyingMineId) : undefined;
      return pit.controller === faction || occupying?.faction === faction;
    })
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((pit): SandboxMineHudItem => {
      const occupying = pit.occupyingMineId ? buildingById.get(pit.occupyingMineId) : undefined;
      const projectedNetValue = Math.floor(pit.remainingOre * incomeMultiplier);
      let statusLabel = "已控制 · 待建金矿";
      if (pit.remainingOre <= 0) statusLabel = "矿脉枯竭";
      else if (occupying?.faction !== faction && occupying?.health && occupying.health > 0) {
        statusLabel = "敌方金矿仍在开采";
      } else if (occupying?.faction === faction) {
        const phase = battleBuildingConstructionPhaseAt(occupying, battle.matchElapsed);
        statusLabel = phase === "constructing"
          ? "金矿建造中"
          : phase === "operational"
            ? "金矿开采中"
            : "金矿已摧毁";
      }
      return {
        pitId: pit.id,
        remainingOre: pit.remainingOre,
        projectedNetValue,
        roiWarning: pit.remainingOre > 0
          && projectedNetValue < sandboxBuildingSpec("mine").cost,
        statusLabel,
      };
    });
  const emergencyMinePermitAvailable = battle.mining !== null
    && emergencyMinePermitEligibility(battle.mining, {
      faction,
      walletGold: account.gold,
      mineCost: sandboxBuildingSpec("mine").cost,
      mineBuildings: battle.buildings
        .filter((building) => building.kind === "gold-mine")
        .map((building) => {
          const phase = battleBuildingConstructionPhaseAt(building, battle.matchElapsed);
          return {
            id: building.id,
            faction: building.faction,
            status: phase === "operational" ? "active" as const : phase,
          };
        }),
    }).eligible;

  return {
    gold: account.gold,
    goldCap,
    walletFull: account.isFull,
    totalRemainingOre: pits.reduce((sum, pit) => sum + pit.remainingOre, 0),
    usedPopulation,
    reservedPopulation: queuePopulation.reservedPopulation,
    committedPopulation,
    populationCap: SANDBOX_PRODUCTION_POPULATION_CAP,
    incomeMultiplier,
    incomePercent,
    upkeepPercent,
    grossPerCycle,
    upkeepPerCycle,
    netPerCycle,
    cycleSeconds: MINING_CYCLE_SECONDS,
    nextThresholdLabel: nextIncomeThresholdLabel(usedPopulation),
    roiOreThreshold: Math.ceil(sandboxBuildingSpec("mine").cost / incomeMultiplier),
    emergencyMinePermitAvailable,
    mines,
  };
}

export function nextIncomeThresholdLabel(usedPopulation: number): string {
  if (usedPopulation <= 50) return `再增加 ${51 - usedPopulation} 人，收入降至 80%`;
  if (usedPopulation <= 80) return `再增加 ${81 - usedPopulation} 人，收入降至 60%`;
  return "当前已处于最低收入档";
}
