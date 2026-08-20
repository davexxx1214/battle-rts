import { axialToWorld } from "../map/battlefield";
import { createBattleState, createBattleUnit, type BattleState } from "./battle";

const MAGE_COORDINATE = { q: 0, r: 2 } as const;
const BAIT_COORDINATES = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: -1, r: 0 },
] as const;
const PREVIEW_HEALTH = 10_000;

export function isFireballPreviewRequest(search: string): boolean {
  return new URLSearchParams(search).get("preview") === "fireball";
}

export function createFireballPreviewBattle(): BattleState {
  const mage = withPreviewHealth(createBattleUnit({
    id: "fireball-preview-mage",
    faction: "verdant",
    role: "mage",
    position: axialToWorld(MAGE_COORDINATE),
  }));
  const bait = BAIT_COORDINATES.map((coordinate, index) => withPreviewHealth(
    createBattleUnit({
      id: `fireball-preview-bait-${index + 1}`,
      faction: "crimson",
      role: "spearman",
      position: axialToWorld(coordinate),
    }),
  ));
  return createBattleState([mage, ...bait]);
}

function withPreviewHealth<T extends { readonly health: number; readonly maxHealth: number }>(
  unit: T,
): T {
  return { ...unit, health: PREVIEW_HEALTH, maxHealth: PREVIEW_HEALTH };
}
