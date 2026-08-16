import type { UnitRole, UnitStatus } from "../../game/battle";

export type CharacterRole = Exclude<UnitRole, "catapult">;

export interface CharacterEquipmentAsset {
  readonly url: string;
  readonly slot: "handslot.l" | "handslot.r";
}

export interface CharacterSceneAsset {
  readonly modelUrl: string;
  readonly equipment: readonly CharacterEquipmentAsset[];
}

export const CHARACTER_SCENE_ASSETS = {
  knight: {
    modelUrl: "/assets/kaykit/adventurers/characters/Knight.glb",
    equipment: [
      {
        url: "/assets/kaykit/adventurers/equipment/sword_1handed.gltf",
        slot: "handslot.r",
      },
      {
        url: "/assets/kaykit/adventurers/equipment/shield_round_color.gltf",
        slot: "handslot.l",
      },
    ],
  },
  ranger: {
    modelUrl: "/assets/kaykit/adventurers/characters/Ranger.glb",
    equipment: [
      {
        url: "/assets/kaykit/adventurers/equipment/bow_withString.gltf",
        slot: "handslot.l",
      },
    ],
  },
  mage: {
    modelUrl: "/assets/kaykit/adventurers/characters/Mage.glb",
    equipment: [
      {
        url: "/assets/kaykit/adventurers/equipment/staff.gltf",
        slot: "handslot.r",
      },
    ],
  },
} as const satisfies Readonly<Record<CharacterRole, CharacterSceneAsset>>;

export const CHARACTER_EQUIPMENT_URLS = [
  "/assets/kaykit/adventurers/equipment/sword_1handed.gltf",
  "/assets/kaykit/adventurers/equipment/shield_round_color.gltf",
  "/assets/kaykit/adventurers/equipment/bow_withString.gltf",
  "/assets/kaykit/adventurers/equipment/staff.gltf",
] as const;

export const CHARACTER_ANIMATION_URLS = [
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_General.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementBasic.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementAdvanced.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatMelee.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatRanged.glb",
] as const;

const KNIGHT_ATTACKS = [
  "Melee_1H_Attack_Chop",
  "Melee_1H_Attack_Slice_Diagonal",
  "Melee_1H_Attack_Stab",
] as const;

export function characterAnimationForState({
  id,
  role,
  status,
  attackSequence = 0,
  damaged = false,
}: {
  readonly id: string;
  readonly role: CharacterRole;
  readonly status: UnitStatus;
  readonly attackSequence?: number;
  readonly damaged?: boolean;
}): string {
  const variation = stableVariation(id);
  if (status === "dead") return variation === 0 ? "Death_A" : "Death_B";
  if (damaged) return variation === 0 ? "Hit_A" : "Hit_B";
  if (status === "moving") {
    if (role === "ranger") return "Running_HoldingBow";
    if (role === "mage") return "Walking_C";
    return "Walking_B";
  }
  if (status === "attacking") {
    if (role === "knight") {
      return KNIGHT_ATTACKS[Math.abs(attackSequence) % KNIGHT_ATTACKS.length]!;
    }
    if (role === "ranger") return "Ranged_Bow_Release";
    return "Ranged_Magic_Shoot";
  }
  return variation === 0 ? "Idle_A" : "Idle_B";
}

export function characterTintStrength(objectName: string): number {
  const name = objectName.toLowerCase();
  if (name.includes("head")) return 0;
  if (name.includes("cape")) return 0.68;
  if (name.includes("shield")) return 0.78;
  if (name.includes("sword") || name.includes("bow") || name.includes("staff")) return 0.34;
  if (name.includes("body") || name.includes("helmet") || name.includes("hat")) return 0.46;
  if (name.includes("arm") || name.includes("leg")) return 0.12;
  return 0.28;
}

function stableVariation(id: string): 0 | 1 {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 0 : 1;
}
