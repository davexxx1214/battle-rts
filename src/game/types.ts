export type Faction = "verdant" | "crimson";
export type UnitRole =
  | "knight"
  | "spearman"
  | "ranger"
  | "mage"
  | "catapult"
  | "bone-dragon";
export type UnitCombatProfile = "human" | "undead";

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}
