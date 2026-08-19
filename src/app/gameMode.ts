import {
  DEFAULT_FACTION_RACES,
  HUMAN_VS_UNDEAD_FACTION_RACES,
} from "../game/factions";
import type { FactionRaces } from "../game/types";

export type GameMode = "campaign" | "normal" | "undead" | "arena";

export const DEFAULT_GAME_MODE: GameMode = "normal";

export function hasUndeadOpponent(mode: GameMode): boolean {
  return mode === "undead";
}

export function factionRacesForGameMode(mode: GameMode): FactionRaces {
  return mode === "undead"
    ? HUMAN_VS_UNDEAD_FACTION_RACES
    : DEFAULT_FACTION_RACES;
}

export function requiresSceneAssetReload(
  currentMode: GameMode,
  nextMode: GameMode,
  hasActiveCampaignMission: boolean,
): boolean {
  const currentShowsBattlefield = currentMode !== "campaign" || hasActiveCampaignMission;
  const nextShowsBattlefield = nextMode !== "campaign";
  return !currentShowsBattlefield && nextShowsBattlefield;
}
