import { describe, expect, it } from "vitest";

import {
  CHARACTER_ANIMATION_URLS,
  CHARACTER_SCENE_ASSETS,
  UNDEAD_CHARACTER_SCENE_ASSETS,
  characterAnimationForState,
  characterHiddenObjectNames,
  characterSceneAssetFor,
  characterTintStrength,
} from "../../src/scene/units/characterPresentation";

describe("character presentation", () => {
  it("uses dedicated battle-ready GLBs", () => {
    for (const role of ["knight", "ranger", "mage"] as const) {
      const modelUrl = CHARACTER_SCENE_ASSETS[role].modelUrl;
      expect(modelUrl).toMatch(/\/characters\/battle\/.+_Battle\.glb$/);
    }
  });

  it("builds the spearman from KayKit's medium knight rig and faction spear models", () => {
    const asset = CHARACTER_SCENE_ASSETS.spearman;
    expect(asset.modelUrl).toBe("/assets/kaykit/adventurers/characters/Knight.glb");
    expect(asset.equipment).toHaveLength(1);
    expect(asset.equipment?.[0]?.boneName).toBe("handslot.r");
    expect(asset.equipment?.[0]?.modelUrls).toEqual({
      verdant: "/assets/kaykit/medieval-hex/units/blue/spear_blue_accent.gltf",
      crimson: "/assets/kaykit/medieval-hex/units/red/spear_red_accent.gltf",
    });
    expect(characterAnimationForState({
      id: "blue-spearman",
      role: "spearman",
      status: "attacking",
    })).toBe("Melee_1H_Attack_Stab");
  });

  it("loads the advanced movement library required by the bow-carry run", () => {
    expect(CHARACTER_ANIMATION_URLS).toContain(
      "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementAdvanced.glb",
    );
    expect(CHARACTER_ANIMATION_URLS).toContain(
      "/assets/kaykit/character-animations/rig-medium/Rig_Medium_Special.glb",
    );
  });

  it("maps all enemy combat roles to KayKit skeleton models in undead mode", () => {
    for (const role of ["knight", "spearman", "ranger", "mage"] as const) {
      const asset = characterSceneAssetFor(role, "crimson", true);
      expect(asset).toBe(UNDEAD_CHARACTER_SCENE_ASSETS[role]);
      expect(asset.modelUrl).toMatch(/\/assets\/kaykit\/skeletons\/characters\/Skeleton_.+\.glb$/);
      expect(asset.equipment?.every((piece) => (
        piece.modelUrls.crimson?.startsWith("/assets/kaykit/skeletons/equipment/Skeleton_")
        && piece.modelUrls.verdant === piece.modelUrls.crimson
      ))).toBe(true);
    }
    expect(characterSceneAssetFor("knight", "verdant", true))
      .toBe(CHARACTER_SCENE_ASSETS.knight);
    expect(UNDEAD_CHARACTER_SCENE_ASSETS.knight.visualScale).toBe(1.35);
    expect(UNDEAD_CHARACTER_SCENE_ASSETS.spearman.visualScale).toBe(1);
    expect(characterHiddenObjectNames("mage", true)).toEqual(["Skeleton_Mage_Hat"]);
    expect(characterHiddenObjectNames("spearman", true)).toEqual(["Skeleton_Minion_Cloak"]);
    expect(characterHiddenObjectNames("mage")).toEqual([]);
    expect(characterHiddenObjectNames("knight", true)).toEqual([]);
    expect(UNDEAD_CHARACTER_SCENE_ASSETS.spearman.equipment).toEqual([
      {
        modelUrls: {
          verdant: "/assets/kaykit/skeletons/equipment/Skeleton_Blade.gltf",
          crimson: "/assets/kaykit/skeletons/equipment/Skeleton_Blade.gltf",
        },
        boneName: "handslot.r",
        scale: 1,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      {
        modelUrls: {
          verdant: "/assets/kaykit/skeletons/equipment/Skeleton_Shield_Small_A.gltf",
          crimson: "/assets/kaykit/skeletons/equipment/Skeleton_Shield_Small_A.gltf",
        },
        boneName: "handslot.l",
        scale: 1,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
    ]);
    expect(UNDEAD_CHARACTER_SCENE_ASSETS.mage.equipment).toEqual([
      {
        modelUrls: {
          verdant: "/assets/kaykit/skeletons/equipment/Skeleton_Staff.gltf",
          crimson: "/assets/kaykit/skeletons/equipment/Skeleton_Staff.gltf",
        },
        boneName: "handslot.r",
        scale: 1,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
    ]);
  });

  it("binds KayKit skeleton clips to every undead soldier", () => {
    expect(characterAnimationForState({
      id: "undead-minion",
      role: "spearman",
      status: "idle",
      race: "undead",
    })).toBe("Skeletons_Idle");
    expect(characterAnimationForState({
      id: "undead-minion",
      role: "spearman",
      status: "moving",
      race: "undead",
    })).toBe("Skeletons_Walking");
    expect(characterAnimationForState({
      id: "undead-guard",
      role: "knight",
      status: "dead",
      race: "undead",
    })).toBe("Skeletons_Death");
    expect(characterAnimationForState({
      id: "undead-rogue",
      role: "ranger",
      status: "moving",
      race: "undead",
    })).toBe("Running_HoldingRifle");
    expect(characterAnimationForState({
      id: "undead-rogue",
      role: "ranger",
      status: "attacking",
      race: "undead",
    })).toBe("Ranged_2H_Shoot");
    expect(characterAnimationForState({
      id: "undead-mage",
      role: "mage",
      status: "attacking",
      race: "undead",
    })).toBe("Ranged_Magic_Shoot");
    expect(characterAnimationForState({
      id: "undead-guard",
      role: "knight",
      status: "attacking",
      attackSequence: 0,
      race: "undead",
    })).toBe("Melee_1H_Attack_Chop");
  });

  it("selects role-specific movement and attack clips", () => {
    expect(characterAnimationForState({
      id: "blue-ranger",
      role: "ranger",
      status: "moving",
    })).toBe("Running_HoldingBow");
    expect(characterAnimationForState({
      id: "red-ranger",
      role: "ranger",
      status: "attacking",
      attackSequence: 4,
    })).toBe("Ranged_Bow_Release");
    expect(characterAnimationForState({
      id: "blue-mage",
      role: "mage",
      status: "attacking",
      attackSequence: 2,
    })).toBe("Ranged_Magic_Shoot");
    expect(new Set([0, 1, 2].map((attackSequence) => characterAnimationForState({
      id: "blue-knight",
      role: "knight",
      status: "attacking",
      attackSequence,
    })))).toEqual(new Set([
      "Melee_1H_Attack_Chop",
      "Melee_1H_Attack_Slice_Diagonal",
      "Melee_1H_Attack_Stab",
    ]));
  });

  it("uses hit and stable idle/death variations without overriding death", () => {
    expect(characterAnimationForState({
      id: "blue-knight",
      role: "knight",
      status: "attacking",
      damaged: true,
    })).toMatch(/^Hit_[AB]$/);
    expect(characterAnimationForState({
      id: "blue-knight",
      role: "knight",
      status: "dead",
      damaged: true,
    })).toMatch(/^Death_[AB]$/);
    expect(characterAnimationForState({
      id: "stable-unit",
      role: "mage",
      status: "idle",
    })).toBe(characterAnimationForState({
      id: "stable-unit",
      role: "mage",
      status: "idle",
    }));
  });

  it("keeps faces natural while committing capes and gear to faction colors", () => {
    expect(characterTintStrength("knight", "Knight_Head")).toBe(0);
    expect(characterTintStrength("ranger", "Ranger_ArmLeft")).toBeLessThan(0.2);
    expect(characterTintStrength("mage", "Mage_Cape")).toBeGreaterThanOrEqual(0.55);
    expect(characterTintStrength("knight", "shield_round_color")).toBeGreaterThanOrEqual(0.7);
    expect(characterTintStrength("knight", "VendorRenamedHead")).toBe(0);
  });
});
