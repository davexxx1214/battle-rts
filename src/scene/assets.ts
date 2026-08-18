import type { BattlefieldSceneryKind } from "../map/battlefieldScenery";
import type { BattlefieldCloudKind } from "../map/battlefieldAtmosphere";
import type { BattleBuildingKind } from "../game/buildings";
import type { Faction } from "../game/types";

export interface BattleBuildingDetailAsset {
  readonly id: string;
  readonly url: string;
  readonly scale: number;
  readonly position: readonly [x: number, y: number, z: number];
  readonly rotationY: number;
}

export interface ScenerySceneAsset {
  readonly url: string;
  readonly scale: number;
  readonly renderMode?: "full-scene" | "instanced";
  readonly factionUrls?: Readonly<Partial<Record<Faction, string>>>;
}

export const BATTLEFIELD_CLOUD_SCENE_ASSETS = {
  big: {
    url: "/assets/kaykit/medieval-hex/decoration/nature/cloud_big.gltf",
    scale: 1,
  },
  small: {
    url: "/assets/kaykit/medieval-hex/decoration/nature/cloud_small.gltf",
    scale: 1,
  },
} as const satisfies Readonly<Record<BattlefieldCloudKind, ScenerySceneAsset>>;

export const SCENE_MODEL_URLS = {
  mobileCatapult: "/assets/generated/tripo/runtime/mobile-catapult.glb",
  catapultOperator: "/assets/kaykit/adventurers/characters/Knight.glb",
} as const;

export const MOBILE_CATAPULT_PARTS = {
  throwingArm: "tripo_part_3",
  wheels: ["tripo_part_1", "tripo_part_2", "tripo_part_5"],
} as const;

export const CASTLE_BATTLE_FLAG_ASSET = {
  url: "/assets/kenney/castle-kit/flag.glb",
  scale: 1.35,
} as const;

export const UNDEAD_CASTLE_BATTLE_FLAG_ASSET = {
  url: "/assets/kaykit/dungeon/banner_patternC_green.gltf",
  scale: 1.8,
} as const;

export const FACTION_SCENE_COLORS = {
  verdant: {
    accent: "#4fa7ff",
    dark: "#173f68",
    tint: "#4f9ce8",
  },
  crimson: {
    accent: "#df4c4f",
    dark: "#5d2024",
    tint: "#db5555",
  },
} as const;

export const UNDEAD_SCENE_COLORS = {
  accent: "#8ee56e",
  dark: "#261a34",
  tint: "#76529a",
} as const;

export function sceneColorsForFaction(faction: Faction, undeadOpponent = false) {
  return undeadOpponent && faction === "crimson"
    ? UNDEAD_SCENE_COLORS
    : FACTION_SCENE_COLORS[faction];
}

const HALLOWEEN_ASSET_ROOT = "/assets/kaykit/halloween";
const DUNGEON_PACK_ASSET_ROOT = "/assets/threejsassets/dungeon";

export const UNDEAD_HALLOWEEN_ASSETS = {
  arch: { url: `${HALLOWEEN_ASSET_ROOT}/arch.gltf`, scale: 0.42 },
  archGate: { url: `${HALLOWEEN_ASSET_ROOT}/arch_gate.gltf`, scale: 0.72 },
  benchDecorated: { url: `${HALLOWEEN_ASSET_ROOT}/bench_decorated.gltf`, scale: 0.9 },
  boneA: { url: `${HALLOWEEN_ASSET_ROOT}/bone_A.gltf`, scale: 1.15 },
  boneB: { url: `${HALLOWEEN_ASSET_ROOT}/bone_B.gltf`, scale: 1.15 },
  coffinDecorated: { url: `${HALLOWEEN_ASSET_ROOT}/coffin_decorated.gltf`, scale: 0.9 },
  crypt: { url: `${HALLOWEEN_ASSET_ROOT}/crypt.gltf`, scale: 0.72 },
  fenceGate: { url: `${HALLOWEEN_ASSET_ROOT}/fence_gate.gltf`, scale: 0.82 },
  fencePillar: { url: `${HALLOWEEN_ASSET_ROOT}/fence_pillar.gltf`, scale: 0.86 },
  fenceSeparate: { url: `${HALLOWEEN_ASSET_ROOT}/fence_seperate.gltf`, scale: 0.48 },
  fenceSeparateBroken: {
    url: `${HALLOWEEN_ASSET_ROOT}/fence_seperate_broken.gltf`,
    scale: 1,
  },
  floorDirtSmall: { url: `${HALLOWEEN_ASSET_ROOT}/floor_dirt_small.gltf`, scale: 0.88 },
  graveA: { url: `${HALLOWEEN_ASSET_ROOT}/grave_A.gltf`, scale: 0.95 },
  graveADestroyed: {
    url: `${HALLOWEEN_ASSET_ROOT}/grave_A_destroyed.gltf`,
    scale: 0.95,
  },
  graveB: { url: `${HALLOWEEN_ASSET_ROOT}/grave_B.gltf`, scale: 0.95 },
  graveMarkerA: { url: `${HALLOWEEN_ASSET_ROOT}/gravemarker_A.gltf`, scale: 1.1 },
  graveMarkerB: { url: `${HALLOWEEN_ASSET_ROOT}/gravemarker_B.gltf`, scale: 1.1 },
  gravePit: { url: `${HALLOWEEN_ASSET_ROOT}/floor_dirt_grave.gltf`, scale: 0.82 },
  graveStone: { url: `${HALLOWEEN_ASSET_ROOT}/gravestone.gltf`, scale: 1.05 },
  lanternStanding: {
    url: `${HALLOWEEN_ASSET_ROOT}/lantern_standing.gltf`,
    scale: 1.25,
  },
  postLantern: { url: `${HALLOWEEN_ASSET_ROOT}/post_lantern.gltf`, scale: 0.95 },
  postSkull: { url: `${HALLOWEEN_ASSET_ROOT}/post_skull.gltf`, scale: 0.95 },
  pumpkinOrangeSmall: {
    url: `${HALLOWEEN_ASSET_ROOT}/pumpkin_orange_small.gltf`,
    scale: 0.95,
  },
  pumpkinYellowJack: {
    url: `${HALLOWEEN_ASSET_ROOT}/pumpkin_yellow_jackolantern.gltf`,
    scale: 0.85,
  },
  pumpkinYellowSmall: {
    url: `${HALLOWEEN_ASSET_ROOT}/pumpkin_yellow_small.gltf`,
    scale: 0.95,
  },
  ribcage: { url: `${HALLOWEEN_ASSET_ROOT}/ribcage.gltf`, scale: 1.1 },
  shrine: { url: `${HALLOWEEN_ASSET_ROOT}/shrine.gltf`, scale: 1 },
  shrineCandles: { url: `${HALLOWEEN_ASSET_ROOT}/shrine_candles.gltf`, scale: 1 },
  skullCandle: { url: `${HALLOWEEN_ASSET_ROOT}/skull_candle.gltf`, scale: 1.05 },
  treeDeadLargeDecorated: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_dead_large_decorated.gltf`,
    scale: 0.86,
  },
  treeDeadMedium: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_dead_medium.gltf`,
    scale: 0.92,
  },
  treeDeadSmall: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_dead_small.gltf`,
    scale: 0.9,
  },
  treePineOrangeLarge: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_pine_orange_large.gltf`,
    scale: 0.4,
  },
  treePineOrangeMedium: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_pine_orange_medium.gltf`,
    scale: 0.46,
  },
  treePineYellowMedium: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_pine_yellow_medium.gltf`,
    scale: 0.46,
  },
  treePineYellowSmall: {
    url: `${HALLOWEEN_ASSET_ROOT}/tree_pine_yellow_small.gltf`,
    scale: 0.52,
  },
} as const;

export const UNDEAD_DUNGEON_PACK_ASSETS = {
  cursedCrystal: {
    url: `${DUNGEON_PACK_ASSET_ROOT}/dun_cursed_crystal.glb`,
    scale: 3,
  },
  skullCandelabra: {
    url: `${DUNGEON_PACK_ASSET_ROOT}/dun_skull_candelabra.glb`,
    scale: 3,
  },
  stoneAltar: {
    url: `${DUNGEON_PACK_ASSET_ROOT}/dun_stone_altar.glb`,
    scale: 1.25,
  },
} as const;

export const UNDEAD_TRIPO_SCENE_ASSETS = {
  shipwreck: {
    url: "/assets/generated/tripo/runtime/undead-shipwreck.glb",
    scale: 1,
  },
} as const;

export const UNDEAD_ENVIRONMENT_SCENE_ASSETS = {
  ...UNDEAD_HALLOWEEN_ASSETS,
  ...UNDEAD_DUNGEON_PACK_ASSETS,
  shipwreck: UNDEAD_TRIPO_SCENE_ASSETS.shipwreck,
} as const;

export const UNDEAD_FORTIFICATION_SCENE_ASSETS = {
  "wall-straight": {
    ...UNDEAD_HALLOWEEN_ASSETS.fenceSeparate,
    scale: 0.58,
  },
  "wall-corner": {
    ...UNDEAD_HALLOWEEN_ASSETS.fenceSeparate,
    scale: 0.55,
  },
  "wall-gate": {
    ...UNDEAD_HALLOWEEN_ASSETS.archGate,
    scale: 0.78,
    hiddenNodes: ["arch_gate_left", "arch_gate_right"],
  },
} as const;

export const UNIT_BASE_RING_GEOMETRY = {
  character: {
    innerRadius: 0.3,
    outerRadius: 0.42,
    segments: 32,
  },
  catapult: {
    innerRadius: 0.6,
    outerRadius: 0.82,
    segments: 36,
  },
} as const;

export const SCENERY_SCENE_ASSETS = {
  tree: {
    url: "/assets/kaykit/medieval-hex/decoration/nature/tree_single_A.gltf",
    scale: 1.34,
  },
  bush: {
    url: "/assets/kaykit/forest-nature/forage/Bush_1_B_Color1.gltf",
    scale: 0.9,
  },
  "bay-ship": {
    url: "/assets/kaykit/medieval-hex/units/blue/ship_blue_accent.gltf",
    scale: 1.28,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/units/blue/ship_blue_accent.gltf",
      crimson: "/assets/kaykit/medieval-hex/units/red/ship_red_accent.gltf",
    },
  },
  "grove-a": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/trees_A_medium.gltf",
    scale: 1.02,
  },
  "grove-b": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/trees_B_medium.gltf",
    scale: 1.02,
  },
  "hill-grove": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/hills_A_trees.gltf",
    scale: 1.04,
  },
  "rock-hills": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/hills_B.gltf",
    scale: 1.16,
  },
  "castle-rock": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/mountain_A_grass.gltf",
    scale: 1.08,
  },
  "mine-mountain-a": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/mountain_A.gltf",
    scale: 1.45,
  },
  "mine-mountain-b": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/mountain_B.gltf",
    scale: 1.36,
  },
  "mine-mountain-c": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/mountain_C.gltf",
    scale: 1.42,
  },
  "mine-rock-c": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/rock_single_C.gltf",
    scale: 4.8,
  },
  "mine-rock-e": {
    url: "/assets/kaykit/medieval-hex/decoration/nature/rock_single_E.gltf",
    scale: 4.4,
  },
  stone: {
    url: "/assets/kaykit/medieval-hex/decoration/props/resource_stone.gltf",
    scale: 2.35,
  },
  iron: {
    url: "/assets/kaykit/resource-bits/iron/Iron_Nuggets.gltf",
    scale: 0.92,
  },
  tent: {
    url: "/assets/kaykit/medieval-hex/decoration/props/tent.gltf",
    scale: 2.2,
  },
  wheelbarrow: {
    url: "/assets/kaykit/medieval-hex/decoration/props/wheelbarrow.gltf",
    scale: 1.9,
  },
  "farm-dirt": {
    url: "/assets/kaykit/medieval-hex/buildings/neutral/building_dirt.gltf",
    scale: 0.96,
  },
  "farm-grain": {
    url: "/assets/kaykit/medieval-hex/buildings/neutral/building_grain.gltf",
    scale: 0.96,
  },
  "farm-cargo-wagon": {
    url: "/assets/kaykit/medieval-hex/units/blue/cart_merchant_blue_accent.gltf",
    scale: 1.15,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/units/blue/cart_merchant_blue_accent.gltf",
      crimson: "/assets/kaykit/medieval-hex/units/red/cart_merchant_red_accent.gltf",
    },
  },
  "farm-windmill": {
    url: "/assets/kaykit/medieval-hex/buildings/blue/building_windmill_blue.gltf",
    scale: 1.15,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/buildings/blue/building_windmill_blue.gltf",
      crimson: "/assets/kaykit/medieval-hex/buildings/red/building_windmill_red.gltf",
    },
  },
  "farm-home-a": {
    url: "/assets/kaykit/medieval-hex/buildings/blue/building_home_A_blue.gltf",
    scale: 1.25,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/buildings/blue/building_home_A_blue.gltf",
      crimson: "/assets/kaykit/medieval-hex/buildings/red/building_home_A_red.gltf",
    },
  },
  "farm-home-b": {
    url: "/assets/kaykit/medieval-hex/buildings/blue/building_home_B_blue.gltf",
    scale: 1.15,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/buildings/blue/building_home_B_blue.gltf",
      crimson: "/assets/kaykit/medieval-hex/buildings/red/building_home_B_red.gltf",
    },
  },
  "farm-watermill": {
    url: "/assets/kaykit/medieval-hex/buildings/blue/building_watermill_blue.gltf",
    scale: 1.2,
    renderMode: "full-scene",
    factionUrls: {
      verdant: "/assets/kaykit/medieval-hex/buildings/blue/building_watermill_blue.gltf",
      crimson: "/assets/kaykit/medieval-hex/buildings/red/building_watermill_red.gltf",
    },
  },
  "village-house": {
    url: "/assets/kenney/hexagon-kit/building-house.glb",
    scale: 0.82,
  },
  "village-market": {
    url: "/assets/kenney/hexagon-kit/building-market.glb",
    scale: 0.82,
  },
  "village-farm": {
    url: "/assets/kenney/hexagon-kit/building-farm.glb",
    scale: 0.82,
  },
} as const satisfies Readonly<Record<
  BattlefieldSceneryKind,
  ScenerySceneAsset
>>;

export function scenerySceneAssetFor(
  kind: BattlefieldSceneryKind,
  faction?: Faction,
): ScenerySceneAsset {
  const asset: ScenerySceneAsset = SCENERY_SCENE_ASSETS[kind];
  const factionUrl = faction ? asset.factionUrls?.[faction] : undefined;
  return factionUrl ? { ...asset, url: factionUrl } : asset;
}

export const STRUCTURE_SCENE_ASSETS = {
  verdant: {
    castle: kaykitBuilding("blue", "castle", 0.76),
    blacksmith: kaykitBuilding("blue", "blacksmith", 0.94),
    barracks: kaykitBuilding("blue", "barracks", 0.86),
    "arrow-tower": kaykitBuilding("blue", "tower_A", 0.76),
    mine: kaykitBuilding("blue", "mine", 0.84),
  },
  crimson: {
    castle: kaykitBuilding("red", "castle", 0.8),
    blacksmith: kaykitBuilding("red", "blacksmith", 1.02),
    barracks: kaykitBuilding("red", "barracks", 0.9),
    "arrow-tower": kaykitBuilding("red", "tower_A", 0.82),
    mine: kaykitBuilding("red", "mine", 0.88),
  },
  neutral: {
    "wall-straight": {
      url: "/assets/kaykit/medieval-hex/buildings/neutral/wall_straight.gltf",
      scale: 0.98,
    },
    "wall-corner": {
      url: "/assets/kaykit/medieval-hex/buildings/neutral/wall_corner_A_outside.gltf",
      scale: 0.98,
    },
    "wall-gate": {
      url: "/assets/kaykit/medieval-hex/buildings/neutral/wall_straight_gate.gltf",
      scale: 0.98,
      hiddenNodes: [
        "wall_straight_gate_door_left",
        "wall_straight_gate_door_right",
      ],
    },
    "mining-cart": {
      url: "/assets/kaykit/medieval-hex/decoration/props/wheelbarrow.gltf",
      scale: 1.9,
    },
    "ore-pile": {
      url: "/assets/kaykit/medieval-hex/decoration/props/resource_stone.gltf",
      scale: 1.45,
    },
  },
} as const;

export const UNDEAD_STRUCTURE_SCENE_ASSETS = {
  castle: {
    url: UNDEAD_HALLOWEEN_ASSETS.crypt.url,
    scale: 0.3,
  },
  blacksmith: UNDEAD_DUNGEON_PACK_ASSETS.stoneAltar,
  barracks: UNDEAD_HALLOWEEN_ASSETS.crypt,
  "arrow-tower": UNDEAD_DUNGEON_PACK_ASSETS.skullCandelabra,
  mine: UNDEAD_DUNGEON_PACK_ASSETS.cursedCrystal,
} as const satisfies Readonly<Record<
  keyof typeof STRUCTURE_SCENE_ASSETS.crimson,
  { readonly url: string; readonly scale: number }
>>;

export function structureSceneAssetFor(
  faction: Faction,
  kind: keyof typeof STRUCTURE_SCENE_ASSETS.crimson,
  undeadOpponent = false,
) {
  return undeadOpponent && faction === "crimson"
    ? UNDEAD_STRUCTURE_SCENE_ASSETS[kind]
    : STRUCTURE_SCENE_ASSETS[faction][kind];
}

export const BATTLE_BUILDING_ASSET_KEYS = {
  castle: "castle",
  "arrow-tower": "arrow-tower",
  "guard-tower": "arrow-tower",
  "gold-mine": "mine",
  barracks: "barracks",
} as const satisfies Readonly<Record<
  BattleBuildingKind,
  "castle" | "arrow-tower" | "mine" | "barracks"
>>;

const BUILDING_PROP_ROOT = "/assets/kaykit/medieval-hex/decoration/props";

const BATTLE_BUILDING_DETAILS = {
  verdant: createBattleBuildingDetails("blue"),
  crimson: createBattleBuildingDetails("red"),
} as const satisfies Readonly<Record<
  Faction,
  Readonly<Record<BattleBuildingKind, readonly BattleBuildingDetailAsset[]>>
>>;

const UNDEAD_BATTLE_BUILDING_DETAILS = createUndeadBuildingDetails();

export const BATTLE_BUILDING_DETAIL_URLS = [
  ...new Set([
    ...Object.values(BATTLE_BUILDING_DETAILS).flatMap((factionDetails) => (
      Object.values(factionDetails).flatMap((details) => details.map(({ url }) => url))
    )),
    ...Object.values(UNDEAD_BATTLE_BUILDING_DETAILS).flatMap((details) => (
      details.map(({ url }) => url)
    )),
  ]),
] as readonly string[];

export function battleBuildingDetailAssets(
  faction: Faction,
  kind: BattleBuildingKind,
  undeadOpponent = false,
): readonly BattleBuildingDetailAsset[] {
  if (undeadOpponent && faction === "crimson") {
    return UNDEAD_BATTLE_BUILDING_DETAILS[kind];
  }
  return BATTLE_BUILDING_DETAILS[faction][kind];
}

function kaykitBuilding(color: "blue" | "red", name: string, scale: number) {
  return {
    url: `/assets/kaykit/medieval-hex/buildings/${color}/building_${name}_${color}.gltf`,
    scale,
  } as const;
}

function createBattleBuildingDetails(color: "blue" | "red") {
  const flag = `${BUILDING_PROP_ROOT}/flag_${color}.gltf`;
  return {
    castle: [
      buildingDetail("banner-left", flag, 3, [-0.5, 2.42, -0.18], -0.18),
      buildingDetail("banner-right", flag, 3, [0.5, 2.42, -0.18], 0.18),
      buildingDetail("castle-crate", `${BUILDING_PROP_ROOT}/crate_A_big.gltf`, 2.15, [
        -0.72, 0.09, 0.64,
      ], 0.16),
    ],
    "arrow-tower": [],
    "guard-tower": [],
    "gold-mine": [
      buildingDetail("ore-pile", `${BUILDING_PROP_ROOT}/resource_stone.gltf`, 1.45, [
        0.68, 0.08, 0.46,
      ], 0.4),
      buildingDetail("mine-cart", `${BUILDING_PROP_ROOT}/wheelbarrow.gltf`, 1.82, [
        -0.66, 0.08, 0.6,
      ], 0.52),
      buildingDetail("timber", `${BUILDING_PROP_ROOT}/resource_lumber.gltf`, 1.08, [
        -0.58, 0.08, -0.58,
      ], -0.22),
      buildingDetail("mine-barrel", `${BUILDING_PROP_ROOT}/barrel.gltf`, 1.85, [
        0.68, 0.08, -0.5,
      ], 0.2),
    ],
    barracks: [
      buildingDetail("barracks-banner", flag, 2.75, [0.68, 0.08, -0.5], 0.28),
      buildingDetail("weapon-rack", `${BUILDING_PROP_ROOT}/weaponrack.gltf`, 2.9, [
        -0.68, 0.08, 0.48,
      ], -0.42),
      buildingDetail("training-target", `${BUILDING_PROP_ROOT}/target.gltf`, 2.45, [
        0.68, 0.08, 0.52,
      ], 0.48),
      buildingDetail("supply-crate", `${BUILDING_PROP_ROOT}/crate_A_big.gltf`, 2.1, [
        -0.56, 0.08, -0.58,
      ], -0.16),
    ],
  } as const;
}

function createUndeadBuildingDetails(): Readonly<
  Record<BattleBuildingKind, readonly BattleBuildingDetailAsset[]>
> {
  return {
    castle: [],
    "arrow-tower": [],
    "guard-tower": [],
    "gold-mine": [],
    barracks: [],
  };
}

function buildingDetail(
  id: string,
  url: string,
  scale: number,
  position: readonly [x: number, y: number, z: number],
  rotationY: number,
): BattleBuildingDetailAsset {
  return { id, url, scale, position, rotationY };
}
