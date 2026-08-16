import { describe, expect, it } from "vitest";

import {
  FACTION_SCENE_COLORS,
  SCENERY_SCENE_ASSETS,
  SCENE_MODEL_URLS,
  STRUCTURE_SCENE_ASSETS,
  UNIT_BASE_RING_GEOMETRY,
} from "../../src/scene/assets";

describe("scene asset presentation", () => {
  it("uses faction-matched KayKit assets for both fortified camps", () => {
    const functionalKinds = ["castle", "blacksmith", "barracks", "arrow-tower", "mine"] as const;

    expect(SCENE_MODEL_URLS).not.toHaveProperty("siegeWorkshop");
    for (const faction of ["verdant", "crimson"] as const) {
      for (const kind of functionalKinds) {
        const asset = STRUCTURE_SCENE_ASSETS[faction][kind];
        expect(asset.url).toContain(faction === "verdant" ? "/blue/" : "/red/");
        expect(asset.url).toMatch(/\.gltf$/);
      }
    }
    expect(FACTION_SCENE_COLORS.verdant).toEqual({
      accent: "#4fa7ff",
      dark: "#173f68",
      tint: "#4f9ce8",
    });
  });

  it("provides KayKit walls and mining props instead of generated workshop art", () => {
    for (const kind of [
      "wall-straight",
      "wall-corner",
      "wall-gate",
      "mining-cart",
      "ore-pile",
    ] as const) {
      const asset = STRUCTURE_SCENE_ASSETS.neutral[kind];
      expect(asset.url).toContain("/assets/kaykit/medieval-hex/");
      expect(asset.url).toMatch(/\.gl(?:tf|b)$/);
    }
    expect(STRUCTURE_SCENE_ASSETS.neutral["wall-gate"].hiddenNodes).toEqual([
      "wall_straight_gate_door_left",
      "wall_straight_gate_door_right",
    ]);
  });

  it("maps every battlefield scenery kind to a local KayKit model", () => {
    expect(Object.keys(SCENERY_SCENE_ASSETS).sort()).toEqual([
      "bush",
      "farm-dirt",
      "farm-grain",
      "iron",
      "stone",
      "tent",
      "tree",
      "village-farm",
      "village-house",
      "village-market",
      "wheelbarrow",
    ]);
    for (const [kind, asset] of Object.entries(SCENERY_SCENE_ASSETS)) {
      expect(asset.url).toContain(kind.startsWith("village-")
        ? "/assets/kenney/hexagon-kit/"
        : "/assets/kaykit/");
      expect(asset.url).toMatch(/\.gl(?:tf|b)$/);
      expect(asset.scale).toBeGreaterThan(0);
    }
  });

  it("defines hollow faction rings for character and catapult bases", () => {
    expect(UNIT_BASE_RING_GEOMETRY).toEqual({
      character: { innerRadius: 0.3, outerRadius: 0.42, segments: 32 },
      catapult: { innerRadius: 0.6, outerRadius: 0.82, segments: 36 },
    });
    expect(FACTION_SCENE_COLORS.verdant.accent).toBe("#4fa7ff");
    expect(FACTION_SCENE_COLORS.crimson.accent).toBe("#df4c4f");
  });
});
