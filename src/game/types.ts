export type Faction = "verdant" | "crimson";
export type CombatFaction = Faction | "neutral";
export type BattleRace = "human" | "undead";
export type FactionRaces = Readonly<Record<Faction, BattleRace>>;
export type UnitRole =
  | "knight"
  | "spearman"
  | "ranger"
  | "mage"
  | "catapult"
  | "bone-dragon";
export type UnitCombatProfile =
  | "human"
  | "undead"
  | "neutral-skeleton"
  | "neutral-sharky"
  | "neutral-mako";
export type AttackVisualKind = "fireball" | "poison-cloud";

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}
