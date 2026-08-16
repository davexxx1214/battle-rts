import { describe, expect, it } from "vitest";

import {
  CHARACTER_ANIMATION_URLS,
  CHARACTER_SCENE_ASSETS,
  characterAnimationForState,
  characterTintStrength,
} from "../../src/scene/units/characterPresentation";

describe("character presentation", () => {
  it("equips each medium-rig combat role with readable KayKit gear", () => {
    expect(CHARACTER_SCENE_ASSETS.knight.equipment).toEqual([
      {
        url: "/assets/kaykit/adventurers/equipment/sword_1handed.gltf",
        slot: "handslot.r",
      },
      {
        url: "/assets/kaykit/adventurers/equipment/shield_round_color.gltf",
        slot: "handslot.l",
      },
    ]);
    expect(CHARACTER_SCENE_ASSETS.ranger.equipment).toEqual([
      {
        url: "/assets/kaykit/adventurers/equipment/bow_withString.gltf",
        slot: "handslot.l",
      },
    ]);
    expect(CHARACTER_SCENE_ASSETS.mage.equipment).toEqual([
      {
        url: "/assets/kaykit/adventurers/equipment/staff.gltf",
        slot: "handslot.r",
      },
    ]);
  });

  it("loads the advanced movement library required by the bow-carry run", () => {
    expect(CHARACTER_ANIMATION_URLS).toContain(
      "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementAdvanced.glb",
    );
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
    expect(characterTintStrength("Knight_Head")).toBe(0);
    expect(characterTintStrength("Ranger_ArmLeft")).toBeLessThan(0.2);
    expect(characterTintStrength("Mage_Cape")).toBeGreaterThanOrEqual(0.55);
    expect(characterTintStrength("shield_round_color")).toBeGreaterThanOrEqual(0.7);
  });
});
