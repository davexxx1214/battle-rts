export type GameMode = "campaign" | "normal" | "undead" | "arena";

export const DEFAULT_GAME_MODE: GameMode = "normal";

export function hasUndeadOpponent(mode: GameMode): boolean {
  return mode === "undead";
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
