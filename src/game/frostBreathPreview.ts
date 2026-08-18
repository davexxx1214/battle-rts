import { axialToWorld } from "../map/battlefield";
import { createBattleState, createBattleUnit, type BattleState } from "./battle";

const DRAGON_COORDINATE = { q: 1, r: -1 } as const;
const BAIT_COORDINATES = [
  { q: 0, r: 2 },
  { q: 1, r: 2 },
  { q: -1, r: 2 },
] as const;

export function isFrostBreathPreviewRequest(search: string): boolean {
  return new URLSearchParams(search).get("preview") === "frost";
}

export function createFrostBreathPreviewBattle(): BattleState {
  const dragon = createBattleUnit({
    id: "frost-preview-dragon",
    faction: "crimson",
    role: "bone-dragon",
    combatProfile: "undead",
    position: axialToWorld(DRAGON_COORDINATE),
  });
  const bait = BAIT_COORDINATES.map((coordinate, index) => createBattleUnit({
    id: `frost-preview-bait-${index + 1}`,
    faction: "verdant",
    role: "spearman",
    position: axialToWorld(coordinate),
  }));
  return createBattleState([dragon, ...bait], { undeadOpponent: true });
}
