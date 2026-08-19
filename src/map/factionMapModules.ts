import type { BattlefieldScenery } from "./battlefieldScenery";
import type { BattlefieldCell, BattlefieldStructure } from "./battlefield";
import type { BattleRace, Faction, FactionRaces } from "../game/types";

export type FactionMapModuleId = BattleRace;

export interface FactionMapModuleDefinition {
  readonly id: FactionMapModuleId;
  readonly race: BattleRace;
  readonly label: string;
  readonly terrainTreatment: "original" | "desaturated-undead";
  readonly sceneryTreatment: "original" | "cemetery";
}

export interface MountedFactionMapModule {
  readonly faction: Faction;
  readonly definition: FactionMapModuleDefinition;
  readonly cells: readonly BattlefieldCell[];
  readonly structures: readonly BattlefieldStructure[];
  readonly scenery: readonly BattlefieldScenery[];
}

export interface ModularBattlefieldAssembly {
  readonly sharedCells: readonly BattlefieldCell[];
  readonly factions: Readonly<Record<Faction, MountedFactionMapModule>>;
}

export const FACTION_MAP_MODULES = {
  human: {
    id: "human",
    race: "human",
    label: "人类领地",
    terrainTreatment: "original",
    sceneryTreatment: "original",
  },
  undead: {
    id: "undead",
    race: "undead",
    label: "亡灵墓园",
    terrainTreatment: "desaturated-undead",
    sceneryTreatment: "cemetery",
  },
} as const satisfies Readonly<Record<BattleRace, FactionMapModuleDefinition>>;

export function factionForMapCoordinate(
  coordinate: { readonly r: number },
): Faction | null {
  if (coordinate.r >= 2) return "verdant";
  if (coordinate.r <= -2) return "crimson";
  return null;
}

export function coordinateBelongsToFactionModule(
  coordinate: { readonly r: number },
  faction: Faction,
): boolean {
  return factionForMapCoordinate(coordinate) === faction;
}

export function mapModuleForFaction(
  races: FactionRaces,
  faction: Faction,
): FactionMapModuleDefinition {
  return FACTION_MAP_MODULES[races[faction]];
}

/**
 * Undead art was authored once against the crimson slot. Mirroring this
 * reference frame lets the exact same module mount in the verdant slot.
 */
export function fromCrimsonModuleCoordinate<T extends { readonly q: number; readonly r: number }>(
  coordinate: T,
  faction: Faction,
): { readonly q: number; readonly r: number } {
  return faction === "crimson"
    ? { q: coordinate.q, r: coordinate.r }
    : { q: -coordinate.q, r: -coordinate.r };
}

export function toCrimsonModuleCoordinate(
  coordinate: { readonly q: number; readonly r: number },
  faction: Faction,
): { readonly q: number; readonly r: number } {
  return fromCrimsonModuleCoordinate(coordinate, faction);
}

export function fromCrimsonModuleOffset(
  offset: readonly [x: number, z: number],
  faction: Faction,
): readonly [x: number, z: number] {
  return faction === "crimson" ? offset : [-offset[0], -offset[1]];
}

export function fromCrimsonModuleRotation(rotationY: number, faction: Faction): number {
  return faction === "crimson" ? rotationY : rotationY + Math.PI;
}

export function assembleModularBattlefield(
  factionRaces: FactionRaces,
  cells: readonly BattlefieldCell[],
  structures: readonly BattlefieldStructure[],
  scenery: readonly BattlefieldScenery[],
): ModularBattlefieldAssembly {
  const mount = (faction: Faction): MountedFactionMapModule => ({
    faction,
    definition: mapModuleForFaction(factionRaces, faction),
    cells: cells.filter((cell) => cell.territory === faction),
    structures: structures.filter((structure) => structure.faction === faction),
    scenery: scenery.filter((item) => (
      item.faction === faction || coordinateBelongsToFactionModule(item.coordinate, faction)
    )),
  });
  return {
    sharedCells: cells.filter((cell) => cell.territory === null),
    factions: {
      verdant: mount("verdant"),
      crimson: mount("crimson"),
    },
  };
}
