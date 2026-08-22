import type { Faction, UnitRole } from "./types";
import { SANDBOX_POPULATION_CAP } from "./battleMode";

export { SANDBOX_POPULATION_CAP };

export interface PopulationUnitSnapshot {
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly health: number;
  readonly status: string;
}

export interface FactionPopulationSnapshot {
  readonly usedPopulation: number;
  readonly reservedPopulation: number;
  readonly committedPopulation: number;
  readonly cap: number;
}

export function sandboxPopulationCostForUnitRole(role: UnitRole): number {
  if (role === "catapult" || role === "bone-dragon") return 4;
  return role === "mage" ? 2 : 1;
}

export function sandboxUsedPopulation(
  units: readonly PopulationUnitSnapshot[],
  faction: Faction,
  readyBlockedPopulation = 0,
): number {
  assertPopulationValue(readyBlockedPopulation, "readyBlockedPopulation");
  return units.reduce((used, unit) => (
    unit.faction === faction && unit.health > 0 && unit.status !== "dead"
      ? used + sandboxPopulationCostForUnitRole(unit.role)
      : used
  ), readyBlockedPopulation);
}

export function createFactionPopulationSnapshot(
  units: readonly PopulationUnitSnapshot[],
  faction: Faction,
  reservedPopulation = 0,
  readyBlockedPopulation = 0,
  cap = SANDBOX_POPULATION_CAP,
): FactionPopulationSnapshot {
  assertPopulationValue(reservedPopulation, "reservedPopulation");
  assertPopulationValue(readyBlockedPopulation, "readyBlockedPopulation");
  assertPopulationValue(cap, "cap");
  const usedPopulation = sandboxUsedPopulation(units, faction, readyBlockedPopulation);
  return Object.freeze({
    usedPopulation,
    reservedPopulation,
    committedPopulation: usedPopulation + reservedPopulation,
    cap,
  });
}

export function canCommitSandboxPopulation(
  snapshot: FactionPopulationSnapshot,
  requestedPopulation: number,
): boolean {
  assertPopulationValue(requestedPopulation, "requestedPopulation");
  return snapshot.committedPopulation + requestedPopulation <= snapshot.cap;
}

function assertPopulationValue(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
}
