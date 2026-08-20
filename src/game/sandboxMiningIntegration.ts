import { worldToAxial } from "../map/battlefield";
import {
  battleBuildingConstructionPhaseAt,
  type BattleBuilding,
} from "./buildings";
import type { EconomyState } from "./economy";
import {
  updatePitCapture,
  type MineCapturedEvent,
  type MineCaptureOccupyingMineSummary,
} from "./mineCapture";
import {
  advanceSandboxMining,
  replaceMinePitState,
  SANDBOX_WALLET_CAPACITY,
  vacateMinePit,
  type MiningLedgerEvent,
  type SandboxMiningState,
} from "./miningEconomy";
import {
  createFactionPopulationSnapshot,
  type PopulationUnitSnapshot,
} from "./population";
import type { Faction, WorldPoint } from "./types";

const FACTIONS: readonly Faction[] = ["verdant", "crimson"];

export interface SandboxMiningSimulationUnit extends PopulationUnitSnapshot {
  readonly position: WorldPoint;
}

export interface AdvanceSandboxMiningSystemsInput {
  readonly mining: SandboxMiningState;
  readonly economy: EconomyState;
  readonly buildings: readonly BattleBuilding[];
  readonly units: readonly SandboxMiningSimulationUnit[];
  readonly elapsedSeconds: number;
  readonly deltaSeconds: number;
  readonly reservedPopulationByFaction?: Readonly<Record<Faction, number>>;
  readonly readyBlockedPopulationByFaction?: Readonly<Record<Faction, number>>;
}

export interface AdvanceSandboxMiningSystemsResult {
  readonly mining: SandboxMiningState;
  readonly economy: EconomyState;
  readonly ledgerEvents: readonly MiningLedgerEvent[];
  readonly captureEvents: readonly MineCapturedEvent[];
  readonly newlyFullFactions: readonly Faction[];
}

/**
 * Advances capture and finite mine income from post-combat snapshots.
 * Callers must pass the final unit/building state for the timestamp so deaths
 * and destroyed mines are settled before population and production are read.
 */
export function advanceSandboxMiningSystems(
  input: AdvanceSandboxMiningSystemsInput,
): AdvanceSandboxMiningSystemsResult {
  if (
    !Number.isFinite(input.elapsedSeconds)
    || input.elapsedSeconds < 0
    || !Number.isFinite(input.deltaSeconds)
    || input.deltaSeconds <= 0
  ) {
    return Object.freeze({
      mining: input.mining,
      economy: input.economy,
      ledgerEvents: Object.freeze([]),
      captureEvents: Object.freeze([]),
      newlyFullFactions: Object.freeze([]),
    });
  }
  let mining = synchronizeSandboxMineOccupancy(input.mining, input.buildings);
  const livingMines = livingGoldMineById(input.buildings);
  const captureEvents: MineCapturedEvent[] = [];
  const captureUnits = input.units.map((unit) => ({
    faction: unit.faction,
    coordinate: worldToAxial(unit.position),
    alive: unit.health > 0 && unit.status !== "dead",
  }));

  for (const pitId of Object.keys(mining.pitsById).sort()) {
    const pit = mining.pitsById[pitId]!;
    const occupyingBuilding = pit.occupyingMineId === null
      ? null
      : livingMines.get(pit.occupyingMineId) ?? null;
    const occupyingMine: MineCaptureOccupyingMineSummary | null = occupyingBuilding
      ? {
          id: occupyingBuilding.id,
          faction: occupyingBuilding.faction,
          active: true,
        }
      : null;
    const capture = updatePitCapture({
      state: pit,
      units: captureUnits,
      occupyingMine,
      deltaSeconds: input.deltaSeconds,
    });
    if (capture.state !== pit) {
      mining = replaceMinePitState(mining, capture.state);
    }
    if (capture.event) captureEvents.push(capture.event);
  }

  const populationByFaction = Object.fromEntries(FACTIONS.map((faction) => {
    const snapshot = createFactionPopulationSnapshot(
      input.units,
      faction,
      input.reservedPopulationByFaction?.[faction] ?? 0,
      input.readyBlockedPopulationByFaction?.[faction] ?? 0,
    );
    return [faction, {
      usedPopulation: snapshot.usedPopulation,
      reservedPopulation: snapshot.reservedPopulation,
    }] as const;
  })) as Readonly<Record<Faction, {
    readonly usedPopulation: number;
    readonly reservedPopulation: number;
  }>>;
  let economy = input.economy;
  const ledgerEvents: MiningLedgerEvent[] = [];
  const newlyFullFactions = new Set<Faction>();
  const endSeconds = input.elapsedSeconds + input.deltaSeconds;
  const boundaries = [
    input.elapsedSeconds,
    ...new Set([...livingMines.values()]
      .map((mine) => mine.constructionCompletedAt)
      .filter((time) => (
        Number.isFinite(time) && time > input.elapsedSeconds && time < endSeconds
      ))),
    endSeconds,
  ].sort((first, second) => first - second);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segmentStart = boundaries[index]!;
    const segmentEnd = boundaries[index + 1]!;
    if (segmentEnd <= segmentStart) continue;
    const settlement = advanceSandboxMining(mining, {
      elapsedSeconds: segmentStart,
      deltaSeconds: segmentEnd - segmentStart,
      walletGoldByFaction: {
        verdant: economy.accounts.verdant.gold,
        crimson: economy.accounts.crimson.gold,
      },
      populationByFaction,
      productionSources: productionSourcesAt(mining, livingMines, segmentStart),
    });
    mining = settlement.state;
    const wallet = applyMiningWallet(economy, settlement.walletGoldByFaction);
    economy = wallet.economy;
    for (const faction of wallet.newlyFullFactions) newlyFullFactions.add(faction);
    // The persistent battle ledger records resource transfers, not repeated
    // zero-value pause/depletion polls.
    ledgerEvents.push(...settlement.events.filter((event) => event.grossExtracted > 0));
  }

  return Object.freeze({
    mining,
    economy,
    ledgerEvents: Object.freeze(ledgerEvents),
    captureEvents: Object.freeze(captureEvents),
    newlyFullFactions: Object.freeze([...newlyFullFactions]),
  });
}

function productionSourcesAt(
  mining: SandboxMiningState,
  livingMines: ReadonlyMap<string, BattleBuilding>,
  elapsedSeconds: number,
) {
  return Object.values(mining.pitsById).flatMap((pit) => {
    if (pit.occupyingMineId === null || pit.depleted) return [];
    const mine = livingMines.get(pit.occupyingMineId);
    if (
      !mine
      || mine.faction !== pit.controller
      || battleBuildingConstructionPhaseAt(mine, elapsedSeconds) !== "operational"
    ) return [];
    return [{ pitId: pit.id, mineId: mine.id, faction: mine.faction }];
  });
}

export function synchronizeSandboxMineOccupancy(
  state: SandboxMiningState,
  buildings: readonly BattleBuilding[],
): SandboxMiningState {
  const mines = livingGoldMineById(buildings);
  let next = state;
  for (const pitId of Object.keys(state.pitsById).sort()) {
    const mineId = next.pitsById[pitId]!.occupyingMineId;
    if (mineId !== null && !mines.has(mineId)) {
      next = vacateMinePit(next, pitId, mineId).state;
    }
  }
  return next;
}

function livingGoldMineById(
  buildings: readonly BattleBuilding[],
): ReadonlyMap<string, BattleBuilding> {
  return new Map(buildings.flatMap((building) => (
    building.kind === "gold-mine"
      && building.status === "active"
      && building.health > 0
      ? [[building.id, building] as const]
      : []
  )));
}

function applyMiningWallet(
  economy: EconomyState,
  goldByFaction: Readonly<Record<Faction, number>>,
): {
  readonly economy: EconomyState;
  readonly newlyFullFactions: readonly Faction[];
} {
  const newlyFullFactions: Faction[] = [];
  const accounts = { ...economy.accounts };
  let changed = false;
  for (const faction of FACTIONS) {
    const account = economy.accounts[faction];
    const gold = goldByFaction[faction];
    const isFull = gold >= SANDBOX_WALLET_CAPACITY;
    const becameFull = isFull && !account.isFull;
    if (becameFull) newlyFullFactions.push(faction);
    changed ||= gold !== account.gold || isFull !== account.isFull || becameFull;
    accounts[faction] = {
      ...account,
      gold,
      isFull,
      fullPromptSequence: account.fullPromptSequence + (becameFull ? 1 : 0),
    };
  }
  return {
    economy: changed ? { ...economy, accounts } : economy,
    newlyFullFactions: Object.freeze(newlyFullFactions),
  };
}
