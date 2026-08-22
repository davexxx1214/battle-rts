import { describe, expect, it } from "vitest";

import type { BattleBuildingKind } from "../../src/game/buildings";
import {
  BATTLE_BUILDING_PRELOAD_KINDS,
  SCENE_SINGLE_GLTF_URLS,
} from "../../src/scene/SceneAssetPreloader";
import {
  BATTLE_BUILDING_DETAIL_URLS,
  BATTLE_BUILDING_ASSET_KEYS,
  FACTION_SCENE_COLORS,
  MINING_COIN_EFFECT_ASSET,
  NEUTRAL_MONSTER_SCENE_ASSETS,
  OASIS_SCENE_ASSETS,
  SANDBOX_WILDLIFE_SCENE_ASSETS,
  SCENERY_SCENE_ASSETS,
  SCENE_MODEL_URLS,
  STRUCTURE_SCENE_ASSETS,
  UNDEAD_BONE_DRAGON_ASSET,
  UNDEAD_DUNGEON_PACK_ASSETS,
  UNDEAD_ENVIRONMENT_SCENE_ASSETS,
  UNDEAD_FORTIFICATION_SCENE_ASSETS,
  UNDEAD_HALLOWEEN_ASSETS,
  UNDEAD_CASTLE_BATTLE_FLAG_ASSET,
  UNDEAD_SCENE_COLORS,
  UNDEAD_STRUCTURE_SCENE_ASSETS,
  UNDEAD_TRIPO_SCENE_ASSETS,
  UNIT_BASE_RING_GEOMETRY,
  battleBuildingDetailAssets,
  sceneColorsForFaction,
  structureSceneAssetFor,
} from "../../src/scene/assets";

describe("scene asset presentation", () => {
  it("preloads the Quaternius coin used by mine income effects", () => {
    expect(MINING_COIN_EFFECT_ASSET).toEqual({
      url: "/assets/quaternius/platformer-game-kit/coin.gltf",
      scale: 0.42,
    });
    expect(SCENE_SINGLE_GLTF_URLS).toContain(MINING_COIN_EFFECT_ASSET.url);
  });

  it("preloads distinct Pirate Kit monsters and the central oasis dressing", () => {
    expect(Object.keys(NEUTRAL_MONSTER_SCENE_ASSETS)).toEqual([
      "skeleton",
      "sharky",
      "mako",
    ]);
    for (const asset of Object.values(NEUTRAL_MONSTER_SCENE_ASSETS)) {
      expect(asset.url).toContain("/assets/quaternius/pirate-kit/");
      expect(asset.url).toMatch(/\.gltf$/);
      expect(asset.targetHeight).toBeGreaterThan(1);
      expect(SCENE_SINGLE_GLTF_URLS).toContain(asset.url);
    }
    expect(OASIS_SCENE_ASSETS.palms).toHaveLength(3);
    expect(SCENE_SINGLE_GLTF_URLS).toContain(OASIS_SCENE_ASSETS.water.url);
    for (const palm of OASIS_SCENE_ASSETS.palms) {
      expect(SCENE_SINGLE_GLTF_URLS).toContain(palm.url);
    }
  });

  it("preloads the stage 10 river kit and animated wildlife subset", () => {
    for (const kind of [
      "shallow-water",
      "river-bridge",
      "water-lily-a",
      "water-lily-b",
      "water-plant-a",
      "water-plant-c",
    ] as const) {
      const asset = SCENERY_SCENE_ASSETS[kind];
      expect(asset.url).toContain("/assets/kaykit/medieval-hex/");
      expect(SCENE_SINGLE_GLTF_URLS).toContain(asset.url);
    }
    expect(SCENERY_SCENE_ASSETS["shallow-water"].grounding).toBe("top");
    expect(Object.keys(SANDBOX_WILDLIFE_SCENE_ASSETS)).toEqual(["cow", "deer", "fox"]);
    for (const asset of Object.values(SANDBOX_WILDLIFE_SCENE_ASSETS)) {
      expect(asset.url).toContain("/assets/quaternius/animated-animals/");
      expect(asset.targetHeight).toBeGreaterThan(0.5);
      expect(SCENE_SINGLE_GLTF_URLS).toContain(asset.url);
    }
  });

  it("preloads faction-matched KayKit buildings for both castle settlements", () => {
    for (const kind of [
      "camp-church",
      "camp-market",
      "camp-tavern",
      "camp-well",
    ] as const) {
      const asset = SCENERY_SCENE_ASSETS[kind];
      expect(asset.renderMode).toBe("full-scene");
      expect(asset.url).toContain("/buildings/blue/");
      expect(asset.factionUrls?.verdant).toContain("/buildings/blue/");
      expect(asset.factionUrls?.crimson).toContain("/buildings/red/");
      expect(SCENE_SINGLE_GLTF_URLS).toContain(asset.factionUrls?.verdant);
      expect(SCENE_SINGLE_GLTF_URLS).toContain(asset.factionUrls?.crimson);
    }
  });

  it("maps and preloads every battle building for both presentation races", () => {
    const kinds = Object.keys(BATTLE_BUILDING_ASSET_KEYS) as BattleBuildingKind[];

    expect([...BATTLE_BUILDING_PRELOAD_KINDS].sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      const assetKey = BATTLE_BUILDING_ASSET_KEYS[kind];
      for (const faction of ["verdant", "crimson"] as const) {
        for (const race of ["human", "undead"] as const) {
          const asset = structureSceneAssetFor(faction, assetKey, race);
          expect(asset.url).toMatch(/\.gl(?:tf|b)$/);
          expect(asset.scale).toBeGreaterThan(0);
          expect(battleBuildingDetailAssets(faction, kind, race)).toBeInstanceOf(Array);
        }
      }
    }
  });

  it("uses faction-matched KayKit assets for both fortified camps", () => {
    const functionalKinds = ["castle", "blacksmith", "barracks", "arrow-tower", "mine"] as const;

    expect(SCENE_MODEL_URLS).not.toHaveProperty("siegeWorkshop");
    expect(SCENE_MODEL_URLS.undeadBoneDragon).toBe("/assets/mesh2motion/dragon.glb");
    expect(UNDEAD_BONE_DRAGON_ASSET.scale).toBe(0.45);
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

  it("gives every troop-producing building a distinct readable silhouette", () => {
    const producers = [
      "barracks",
      "archery-range",
      "mage-tower",
      "siege-workshop",
    ] as const satisfies readonly BattleBuildingKind[];

    expect(producers.map((kind) => BATTLE_BUILDING_ASSET_KEYS[kind]))
      .toEqual(["barracks", "archery-range", "mage-tower", "siege-workshop"]);
    for (const faction of ["verdant", "crimson"] as const) {
      const humanUrls = producers.map((kind) => structureSceneAssetFor(
        faction,
        BATTLE_BUILDING_ASSET_KEYS[kind],
        "human",
      ).url);
      const undeadUrls = producers.map((kind) => structureSceneAssetFor(
        faction,
        BATTLE_BUILDING_ASSET_KEYS[kind],
        "undead",
      ).url);
      expect(new Set(humanUrls).size).toBe(4);
      expect(new Set(undeadUrls).size).toBe(4);
    }

    expect(STRUCTURE_SCENE_ASSETS.verdant["archery-range"].url)
      .toContain("building_home_B_blue.gltf");
    expect(STRUCTURE_SCENE_ASSETS.verdant["mage-tower"].url)
      .toContain("building_tower_A_blue.gltf");
    expect(STRUCTURE_SCENE_ASSETS.verdant["siege-workshop"].url)
      .toContain("building_blacksmith_blue.gltf");
    expect(battleBuildingDetailAssets("verdant", "archery-range").map(({ id }) => id))
      .toEqual(expect.arrayContaining(["range-target-left", "range-target-right"]));
    expect(battleBuildingDetailAssets("verdant", "siege-workshop").map(({ id }) => id))
      .toEqual(expect.arrayContaining(["siege-cart", "siege-lumber"]));
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
    for (const kind of Object.keys(BATTLE_BUILDING_ASSET_KEYS) as BattleBuildingKind[]) {
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
    expect(UNDEAD_CASTLE_BATTLE_FLAG_ASSET).toEqual({
      url: "/assets/kaykit/halloween/post_skull.gltf",
      scale: 1.12,
    });
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.castle.url)
      .toBe(UNDEAD_HALLOWEEN_ASSETS.crypt.url);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.castle.scale).toBe(0.3);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.barracks.url)
      .toBe(UNDEAD_DUNGEON_PACK_ASSETS.stoneAltar.url);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.barracks.scale).toBe(1);
    expect(UNDEAD_STRUCTURE_SCENE_ASSETS.blacksmith).toEqual({
      ...UNDEAD_HALLOWEEN_ASSETS.coffinDecorated,
      scale: 0.74,
    });
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
      "camp-church",
      "camp-market",
      "camp-tavern",
      "camp-well",
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
      "mine-shaft",
      "river-bridge",
      "rock-hills",
      "shallow-water",
      "stone",
      "tent",
      "tree",
      "village-farm",
      "village-house",
      "village-market",
      "water-lily-a",
      "water-lily-b",
      "water-plant-a",
      "water-plant-c",
      "wheelbarrow",
    ]);
    for (const [kind, asset] of Object.entries(SCENERY_SCENE_ASSETS)) {
      expect(asset.url).toContain(kind.startsWith("village-")
        ? "/assets/kenney/hexagon-kit/"
        : "/assets/kaykit/");
      expect(asset.url).toMatch(/\.gl(?:tf|b)$/);
      expect(asset.scale).toBeGreaterThan(0);
    }
    expect(SCENERY_SCENE_ASSETS["mine-shaft"]).toMatchObject({
      url: "/assets/kaykit/medieval-hex/buildings/yellow/building_mine_yellow.gltf",
      renderMode: "full-scene",
    });
  });

  it("defines hollow faction rings for character and catapult bases", () => {
    expect(UNIT_BASE_RING_GEOMETRY).toEqual({
      character: { innerRadius: 0.3, outerRadius: 0.42, segments: 32 },
      catapult: { innerRadius: 0.6, outerRadius: 0.82, segments: 36 },
      boneDragon: { innerRadius: 1.12, outerRadius: 1.36, segments: 40 },
    });
    expect(FACTION_SCENE_COLORS.verdant.accent).toBe("#4fa7ff");
    expect(FACTION_SCENE_COLORS.crimson.accent).toBe("#df4c4f");
  });
});
