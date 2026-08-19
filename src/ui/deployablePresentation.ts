import {
  barracksDesignForRace,
  troopDesignForRace,
  type DeployableKind,
  type TroopKind,
} from "../game/rules";
import type { BattleRace } from "../game/types";

export const DEPLOYABLE_ICON_SOURCES = {
  human: {
    spearman: "/assets/ui/deployables/spearman.png",
    swordsman: "/assets/ui/deployables/swordsman.png",
    archer: "/assets/ui/deployables/archer.png",
    mage: "/assets/ui/deployables/mage.png",
    catapult: "/assets/ui/deployables/catapult.png",
    "guard-tower": "/assets/ui/deployables/guard-tower.png",
    "gold-mine": "/assets/ui/deployables/gold-mine.png",
    barracks: "/assets/ui/deployables/barracks.png",
  },
  undead: {
    spearman: "/assets/ui/deployables/undead/spearman.png",
    swordsman: "/assets/ui/deployables/undead/swordsman.png",
    archer: "/assets/ui/deployables/undead/archer.png",
    mage: "/assets/ui/deployables/undead/mage.png",
    catapult: "/assets/ui/deployables/undead/catapult.png",
    "guard-tower": "/assets/ui/deployables/undead/guard-tower.png",
    "gold-mine": "/assets/ui/deployables/undead/gold-mine.png",
    barracks: "/assets/ui/deployables/undead/barracks.png",
  },
} as const satisfies Readonly<Record<
  BattleRace,
  Readonly<Record<DeployableKind, string>>
>>;

const BUILDING_LABELS = {
  human: {
    "guard-tower": "箭塔",
    "gold-mine": "金矿",
  },
  undead: {
    "guard-tower": "魂火尖塔",
    "gold-mine": "诅咒晶矿",
  },
} as const;

export function deployableLabelForRace(
  kind: DeployableKind,
  race: BattleRace,
): string {
  switch (kind) {
    case "guard-tower":
    case "gold-mine":
      return BUILDING_LABELS[race][kind];
    case "barracks":
      return barracksDesignForRace(race).name;
    default:
      return troopDesignForRace(kind as TroopKind, race).name;
  }
}

export function deployableIconForRace(
  kind: DeployableKind,
  race: BattleRace,
): string {
  return DEPLOYABLE_ICON_SOURCES[race][kind];
}
