import { DEFAULT_FACTION_RACES } from "../game/factions";
import {
  MATCH_POLICIES,
  type BattleMatchMode,
  type MatchPolicy,
} from "../game/rules";
import type { FactionRaces } from "../game/types";

export type GameMode = Exclude<BattleMatchMode, "infinite">;

export const DEFAULT_GAME_MODE: GameMode = "normal";

export function matchPolicyForGameMode(mode: GameMode): MatchPolicy {
  return MATCH_POLICIES[mode];
}

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
