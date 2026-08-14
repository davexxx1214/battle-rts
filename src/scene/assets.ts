export const SCENE_MODEL_URLS = {
  mobileCatapult: "/assets/generated/tripo/runtime/mobile-catapult.glb",
  siegeWorkshop: "/assets/generated/tripo/runtime/siege-workshop.glb",
  catapultOperator: "/assets/kaykit/adventurers/characters/Knight.glb",
} as const;

export const MOBILE_CATAPULT_PARTS = {
  throwingArm: "tripo_part_3",
  wheels: ["tripo_part_1", "tripo_part_2", "tripo_part_5"],
} as const;

export const STRUCTURE_SCENE_ASSETS = {
  "siege-workshop": {
    url: SCENE_MODEL_URLS.siegeWorkshop,
    scale: [2.3, 1.65, 2.3],
  },
} as const;
