import { DEFAULT_FACTION_RACES } from "../game/factions";
import type { FactionRaces } from "../game/types";

export type GameMode = "campaign" | "normal" | "arena";

export const DEFAULT_GAME_MODE: GameMode = "normal";

export function factionRacesForGameMode(mode: GameMode): FactionRaces {
  const defaults: Readonly<Record<GameMode, FactionRaces>> = {
    campaign: DEFAULT_FACTION_RACES,
    normal: DEFAULT_FACTION_RACES,
    arena: DEFAULT_FACTION_RACES,
  };
  return defaults[mode];
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
