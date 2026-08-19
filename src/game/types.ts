export type Faction = "verdant" | "crimson";
export type BattleRace = "human" | "undead";
export type FactionRaces = Readonly<Record<Faction, BattleRace>>;
export type UnitRole =
  | "knight"
  | "spearman"
  | "ranger"
  | "mage"
  | "catapult"
  | "bone-dragon";
export type UnitCombatProfile = "human" | "undead";
export type AttackVisualKind = "poison-cloud";

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}
