import type { BattlefieldSceneryKind } from "../map/battlefieldScenery";

export const SCENE_MODEL_URLS = {
  mobileCatapult: "/assets/generated/tripo/runtime/mobile-catapult.glb",
  catapultOperator: "/assets/kaykit/adventurers/characters/Knight.glb",
} as const;

export const MOBILE_CATAPULT_PARTS = {
  throwingArm: "tripo_part_3",
  wheels: ["tripo_part_1", "tripo_part_2", "tripo_part_5"],
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
} as const satisfies Readonly<Record<
  BattlefieldSceneryKind,
  { readonly url: string; readonly scale: number }
>>;

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

function kaykitBuilding(color: "blue" | "red", name: string, scale: number) {
  return {
    url: `/assets/kaykit/medieval-hex/buildings/${color}/building_${name}_${color}.gltf`,
    scale,
  } as const;
}
