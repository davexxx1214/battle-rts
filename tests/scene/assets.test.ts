import { describe, expect, it } from "vitest";

import {
  BATTLE_BUILDING_DETAIL_URLS,
  BATTLE_BUILDING_ASSET_KEYS,
  FACTION_SCENE_COLORS,
  SCENERY_SCENE_ASSETS,
  SCENE_MODEL_URLS,
  STRUCTURE_SCENE_ASSETS,
  UNDEAD_DUNGEON_PACK_ASSETS,
  UNDEAD_ENVIRONMENT_SCENE_ASSETS,
  UNDEAD_FORTIFICATION_SCENE_ASSETS,
  UNDEAD_HALLOWEEN_ASSETS,
  UNDEAD_SCENE_COLORS,
  UNDEAD_STRUCTURE_SCENE_ASSETS,
  UNDEAD_TRIPO_SCENE_ASSETS,
  UNIT_BASE_RING_GEOMETRY,
  battleBuildingDetailAssets,
  sceneColorsForFaction,
  structureSceneAssetFor,
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

  it("builds readable one-hex compounds from the purchased KayKit detail set", () => {
    expect(new Set(BATTLE_BUILDING_DETAIL_URLS).size).toBe(BATTLE_BUILDING_DETAIL_URLS.length);
    expect(BATTLE_BUILDING_DETAIL_URLS).toEqual(expect.arrayContaining([
      "/assets/kaykit/medieval-hex/decoration/props/flag_blue.gltf",
      "/assets/kaykit/medieval-hex/decoration/props/flag_red.gltf",
      "/assets/kaykit/medieval-hex/decoration/props/target.gltf",
      "/assets/kaykit/medieval-hex/decoration/props/weaponrack.gltf",
      "/assets/kaykit/medieval-hex/decoration/props/crate_A_big.gltf",
      "/assets/kaykit/medieval-hex/decoration/props/barrel.gltf",
    ]));

    for (const faction of ["verdant", "crimson"] as const) {
      for (const kind of ["castle", "gold-mine", "barracks"] as const) {
        const details = battleBuildingDetailAssets(faction, kind);
        expect(details.length).toBeGreaterThanOrEqual(3);
        expect(new Set(details.map((detail) => detail.id)).size).toBe(details.length);
        expect(details.every((detail) => (
          detail.url.startsWith("/assets/kaykit/medieval-hex/")
          && detail.url.endsWith(".gltf")
          && detail.scale > 0
          && detail.position.length === 3
        ))).toBe(true);
      }
    }

    expect(battleBuildingDetailAssets("verdant", "castle").map(({ url }) => url))
      .toContain("/assets/kaykit/medieval-hex/decoration/props/flag_blue.gltf");
    expect(battleBuildingDetailAssets("crimson", "castle").map(({ url }) => url))
      .toContain("/assets/kaykit/medieval-hex/decoration/props/flag_red.gltf");
  });

  it("renders arrow towers through the authoritative battle-building asset path", () => {
    expect(BATTLE_BUILDING_ASSET_KEYS["arrow-tower"]).toBe("arrow-tower");
    expect(battleBuildingDetailAssets("verdant", "arrow-tower")).toEqual([]);
    expect(battleBuildingDetailAssets("crimson", "arrow-tower")).toEqual([]);
  });

  it("keeps only the used shipwreck from Tripo and mixes curated undead packs", () => {
    expect(sceneColorsForFaction("crimson", true)).toEqual(UNDEAD_SCENE_COLORS);
    expect(sceneColorsForFaction("verdant", true)).toEqual(FACTION_SCENE_COLORS.verdant);
    for (const kind of ["castle", "arrow-tower", "guard-tower", "gold-mine", "barracks"] as const) {
      expect(battleBuildingDetailAssets("crimson", kind, true)).toEqual([]);
    }
    expect(structureSceneAssetFor("crimson", "castle", true))
      .toEqual(UNDEAD_STRUCTURE_SCENE_ASSETS.castle);
    expect(structureSceneAssetFor("crimson", "arrow-tower", true))
      .toEqual(UNDEAD_STRUCTURE_SCENE_ASSETS["arrow-tower"]);
    expect(structureSceneAssetFor("crimson", "mine", true))
      .toEqual(UNDEAD_STRUCTURE_SCENE_ASSETS.mine);
    expect(structureSceneAssetFor("crimson", "blacksmith", true))
      .toEqual(UNDEAD_STRUCTURE_SCENE_ASSETS.blacksmith);
    expect(Object.keys(UNDEAD_TRIPO_SCENE_ASSETS).sort())
      .toEqual(["shipwreck"]);
    expect(Object.values(UNDEAD_TRIPO_SCENE_ASSETS)
      .every(({ url }) => url.startsWith("/assets/generated/tripo/runtime/undead-"))).toBe(true);
    expect(UNDEAD_ENVIRONMENT_SCENE_ASSETS.shipwreck)
      .toEqual(UNDEAD_TRIPO_SCENE_ASSETS.shipwreck);
    expect(Object.values(UNDEAD_ENVIRONMENT_SCENE_ASSETS)
      .filter(({ url }) => url.startsWith("/assets/generated/tripo/runtime/undead-")))
      .toHaveLength(1);
    expect(Object.values(UNDEAD_HALLOWEEN_ASSETS)
      .every(({ url }) => url.startsWith("/assets/kaykit/halloween/"))).toBe(true);
    expect(UNDEAD_HALLOWEEN_ASSETS.crypt.url)
      .toBe("/assets/kaykit/halloween/crypt.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.arch.url)
      .toBe("/assets/kaykit/halloween/arch.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.fenceSeparate.url)
      .toBe("/assets/kaykit/halloween/fence_seperate.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.shrine.url)
      .toBe("/assets/kaykit/halloween/shrine.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.treePineOrangeLarge.url)
      .toBe("/assets/kaykit/halloween/tree_pine_orange_large.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.fenceGate.url)
      .toBe("/assets/kaykit/halloween/fence_gate.gltf");
    expect(UNDEAD_HALLOWEEN_ASSETS.treeDeadLargeDecorated.url)
      .toBe("/assets/kaykit/halloween/tree_dead_large_decorated.gltf");
    expect(Object.values(UNDEAD_DUNGEON_PACK_ASSETS)
      .every(({ url }) => url.startsWith("/assets/threejsassets/dungeon/"))).toBe(true);
    expect(Object.values(UNDEAD_ENVIRONMENT_SCENE_ASSETS)
      .filter(({ url }) => url.startsWith("/assets/threejsassets/dungeon/")))
      .toHaveLength(3);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.castle.url)
      .toBe(UNDEAD_HALLOWEEN_ASSETS.crypt.url);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.castle.scale).toBe(0.3);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.barracks.url)
      .toBe(UNDEAD_HALLOWEEN_ASSETS.crypt.url);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.blacksmith)
      .toEqual(UNDEAD_DUNGEON_PACK_ASSETS.stoneAltar);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS["arrow-tower"])
      .toEqual(UNDEAD_DUNGEON_PACK_ASSETS.skullCandelabra);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.mine)
      .toEqual(UNDEAD_DUNGEON_PACK_ASSETS.cursedCrystal);
    expect(Object.values(UNDEAD_FORTIFICATION_SCENE_ASSETS)
      .every(({ url }) => url.startsWith("/assets/kaykit/halloween/"))).toBe(true);
    expect(UNDEAD_FORTIFICATION_SCENE_ASSETS["wall-straight"].url)
      .toBe("/assets/kaykit/halloween/fence_seperate.gltf");
    expect(UNDEAD_FORTIFICATION_SCENE_ASSETS["wall-corner"].url)
      .toBe("/assets/kaykit/halloween/fence_seperate.gltf");
    expect(UNDEAD_FORTIFICATION_SCENE_ASSETS["wall-gate"].url)
      .toBe("/assets/kaykit/halloween/arch_gate.gltf");
    expect(UNDEAD_FORTIFICATION_SCENE_ASSETS["wall-gate"].scale).toBe(0.78);
    expect(UNDEAD_FORTIFICATION_SCENE_ASSETS["wall-gate"].hiddenNodes).toEqual([
      "arch_gate_left",
      "arch_gate_right",
    ]);
  });

  it("maps every battlefield scenery kind to a local KayKit model", () => {
    expect(Object.keys(SCENERY_SCENE_ASSETS).sort()).toEqual([
      "bay-ship",
      "bush",
      "castle-rock",
      "farm-cargo-wagon",
      "farm-dirt",
      "farm-grain",
      "farm-home-a",
      "farm-home-b",
      "farm-watermill",
      "farm-windmill",
      "grove-a",
      "grove-b",
      "hill-grove",
      "iron",
      "mine-mountain-a",
      "mine-mountain-b",
      "mine-mountain-c",
      "mine-rock-c",
      "mine-rock-e",
      "rock-hills",
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
