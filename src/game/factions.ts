import type { BattleRace, Faction, FactionRaces } from "./types";

export const BATTLE_RACES = ["human", "undead"] as const satisfies readonly BattleRace[];

export const DEFAULT_FACTION_RACES: FactionRaces = {
  verdant: "human",
  crimson: "human",
};

export const HUMAN_VS_UNDEAD_FACTION_RACES: FactionRaces = {
  verdant: "human",
  crimson: "undead",
};

export const BATTLE_RACE_LABELS = {
  human: "人类",
  undead: "亡灵",
} as const satisfies Readonly<Record<BattleRace, string>>;

export function createFactionRaces(
  races: Partial<FactionRaces> = {},
): FactionRaces {
  return {
    verdant: races.verdant ?? DEFAULT_FACTION_RACES.verdant,
    crimson: races.crimson ?? DEFAULT_FACTION_RACES.crimson,
  };
}

export function legacyUndeadOpponentRaces(undeadOpponent = false): FactionRaces {
  return undeadOpponent ? HUMAN_VS_UNDEAD_FACTION_RACES : DEFAULT_FACTION_RACES;
}

export function raceForFaction(
  races: FactionRaces,
  faction: Faction,
): BattleRace {
  return races[faction];
}

export function factionUsesRace(
  races: FactionRaces,
  faction: Faction,
  race: BattleRace,
): boolean {
  return raceForFaction(races, faction) === race;
}

export function hasRace(races: FactionRaces, race: BattleRace): boolean {
  return BATTLE_RACES.some((candidate) => candidate === race && (
    races.verdant === candidate || races.crimson === candidate
  ));
}

export function resolveBattleRace(
  factionRaces: FactionRaces | undefined,
  faction: Faction,
  legacyUndeadOpponent = false,
): BattleRace {
  if (legacyUndeadOpponent && faction === "crimson") return "undead";
  return factionRaces?.[faction] ?? "human";
}
