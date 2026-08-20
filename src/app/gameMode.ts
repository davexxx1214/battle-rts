import { DEFAULT_FACTION_RACES } from "../game/factions";
import { battleModeDefinitionFor } from "../game/battleMode";
import type { MatchPolicy } from "../game/rules";
import type { FactionRaces } from "../game/types";

export const VISIBLE_GAME_MODES = ["campaign", "normal", "arena", "sandbox"] as const;
export type GameMode = typeof VISIBLE_GAME_MODES[number];

export const DEFAULT_GAME_MODE: GameMode = "normal";

export function matchPolicyForGameMode(mode: GameMode): MatchPolicy {
  return battleModeDefinitionFor(mode).clockPolicy;
}

export function factionRacesForGameMode(mode: GameMode): FactionRaces {
  const defaults: Readonly<Record<GameMode, FactionRaces>> = {
    campaign: DEFAULT_FACTION_RACES,
    normal: DEFAULT_FACTION_RACES,
    arena: DEFAULT_FACTION_RACES,
    sandbox: DEFAULT_FACTION_RACES,
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
