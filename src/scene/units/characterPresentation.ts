import type { UnitRole, UnitStatus } from "../../game/battle";
import type { BattleRace, Faction } from "../../game/types";

export type CharacterRole = Exclude<UnitRole, "catapult" | "bone-dragon">;

export interface CharacterEquipment {
  readonly modelUrls: Readonly<Partial<Record<Faction, string>>>;
  readonly boneName: string;
  readonly scale: number;
  readonly position: readonly [x: number, y: number, z: number];
  readonly rotation: readonly [x: number, y: number, z: number];
}

export interface CharacterSceneAsset {
  readonly modelUrl: string;
  readonly visualScale?: number;
  readonly hiddenObjectNames?: readonly string[];
  readonly tintStrengthByMesh: Readonly<Record<string, number>>;
  readonly equipment?: readonly CharacterEquipment[];
}

export const CHARACTER_SCENE_ASSETS = {
  knight: {
    modelUrl: "/assets/kaykit/adventurers/characters/battle/Knight_Battle.glb",
    tintStrengthByMesh: {
      Knight_ArmLeft: 0.12,
      Knight_ArmRight: 0.12,
      Knight_Body: 0.46,
      Knight_Cape: 0.68,
      Knight_Head: 0,
      Knight_Helmet: 0.46,
      Knight_HelmetVisor: 0.46,
      Knight_LegLeft: 0.12,
      Knight_LegRight: 0.12,
      sword_1handed: 0.34,
      shield_round_color: 0.78,
    },
  },
  spearman: {
    modelUrl: "/assets/kaykit/adventurers/characters/Knight.glb",
    tintStrengthByMesh: {
      Knight_ArmLeft: 0.12,
      Knight_ArmRight: 0.12,
      Knight_Body: 0.46,
      Knight_Cape: 0.68,
      Knight_Head: 0,
      Knight_Helmet: 0.46,
      Knight_HelmetVisor: 0.46,
      Knight_LegLeft: 0.12,
      Knight_LegRight: 0.12,
    },
    equipment: [{
      modelUrls: {
        verdant: "/assets/kaykit/medieval-hex/units/blue/spear_blue_accent.gltf",
        crimson: "/assets/kaykit/medieval-hex/units/red/spear_red_accent.gltf",
      },
      boneName: "handslot.r",
      scale: 3,
      position: [0, 0.2908, 0],
      rotation: [Math.PI / 2, 0, 0],
    }],
  },
  ranger: {
    modelUrl: "/assets/kaykit/adventurers/characters/battle/Ranger_Battle.glb",
    tintStrengthByMesh: {
      Ranger_ArmLeft: 0.12,
      Ranger_ArmRight: 0.12,
      Ranger_Body: 0.46,
      Ranger_Cape: 0.68,
      Ranger_Head: 0,
      Ranger_LegLeft: 0.12,
      Ranger_LegRight: 0.12,
      Ranger_Quiver: 0.34,
      bow_withString: 0.34,
    },
  },
  mage: {
    modelUrl: "/assets/kaykit/adventurers/characters/battle/Mage_Battle.glb",
    tintStrengthByMesh: {
      Mage_ArmLeft: 0.12,
      Mage_ArmRight: 0.12,
      Mage_Body: 0.46,
      Mage_Cape: 0.68,
      Mage_Hat: 0.46,
      Mage_Head: 0,
      Mage_LegLeft: 0.12,
      Mage_LegRight: 0.12,
      staff: 0.34,
    },
  },
} as const satisfies Readonly<Record<CharacterRole, CharacterSceneAsset>>;

export const UNDEAD_CHARACTER_SCENE_ASSETS = {
  knight: undeadCharacter({
    character: "Skeleton_Warrior",
    loadout: [{ file: "Skeleton_Axe", boneName: "handslot.r" }],
    visualScale: 1.35,
  }),
  spearman: undeadCharacter({
    character: "Skeleton_Minion",
    loadout: [
      { file: "Skeleton_Blade", boneName: "handslot.r" },
      { file: "Skeleton_Shield_Small_A", boneName: "handslot.l" },
    ],
    hiddenObjectNames: ["Skeleton_Minion_Cloak"],
  }),
  ranger: undeadCharacter({
    character: "Skeleton_Rogue",
    loadout: [{ file: "Skeleton_Crossbow", boneName: "handslot.r" }],
  }),
  mage: undeadCharacter({
    character: "Skeleton_Mage",
    loadout: [{ file: "Skeleton_Staff", boneName: "handslot.r" }],
    hiddenObjectNames: ["Skeleton_Mage_Hat"],
  }),
} as const satisfies Readonly<Record<CharacterRole, CharacterSceneAsset>>;

export function characterSceneAssetFor(
  role: CharacterRole,
  faction: Faction,
  raceOrLegacyUndeadOpponent: BattleRace | boolean = false,
): CharacterSceneAsset {
  const undead = typeof raceOrLegacyUndeadOpponent === "string"
    ? raceOrLegacyUndeadOpponent === "undead"
    : raceOrLegacyUndeadOpponent && faction === "crimson";
  return undead
    ? UNDEAD_CHARACTER_SCENE_ASSETS[role]
    : CHARACTER_SCENE_ASSETS[role];
}

export const CHARACTER_ANIMATION_URLS = [
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_General.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementBasic.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementAdvanced.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatMelee.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatRanged.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_Special.glb",
] as const;

export const CATAPULT_OPERATOR_ANIMATION_URLS = [
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_General.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementBasic.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_Tools.glb",
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
  race = "human",
}: {
  readonly id: string;
  readonly role: CharacterRole;
  readonly status: UnitStatus;
  readonly attackSequence?: number;
  readonly damaged?: boolean;
  readonly race?: BattleRace;
}): string {
  if (race === "undead") {
    return undeadCharacterAnimationForState({
      id,
      role,
      status,
      attackSequence,
      damaged,
    });
  }
  const variation = stableVariation(id);
  if (status === "dead") return variation === 0 ? "Death_A" : "Death_B";
  if (damaged) return variation === 0 ? "Hit_A" : "Hit_B";
  if (status === "moving") {
    if (role === "ranger") return "Running_HoldingBow";
    if (role === "mage") return "Walking_C";
    return "Walking_B";
  }
  if (status === "attacking") {
    if (role === "spearman") return "Melee_1H_Attack_Stab";
    if (role === "knight") {
      return KNIGHT_ATTACKS[Math.abs(attackSequence) % KNIGHT_ATTACKS.length]!;
    }
    if (role === "ranger") return "Ranged_Bow_Release";
    return "Ranged_Magic_Shoot";
  }
  return variation === 0 ? "Idle_A" : "Idle_B";
}

export function characterAnimationLoops(name: string): boolean {
  return !name.startsWith("Death_")
    && !name.startsWith("Hit_")
    && name !== "Skeletons_Death";
}

function undeadCharacterAnimationForState({
  id,
  role,
  status,
  attackSequence,
  damaged,
}: {
  readonly id: string;
  readonly role: CharacterRole;
  readonly status: UnitStatus;
  readonly attackSequence: number;
  readonly damaged: boolean;
}): string {
  const variation = stableVariation(id);
  if (status === "dead") return "Skeletons_Death";
  if (damaged) return variation === 0 ? "Hit_A" : "Hit_B";
  if (status === "moving") {
    if (role === "ranger") return "Running_HoldingRifle";
    return "Skeletons_Walking";
  }
  if (status === "attacking") {
    if (role === "spearman") return "Melee_1H_Attack_Stab";
    if (role === "knight") {
      return KNIGHT_ATTACKS[Math.abs(attackSequence) % KNIGHT_ATTACKS.length]!;
    }
    if (role === "ranger") return "Ranged_2H_Shoot";
    return "Ranged_Magic_Shoot";
  }
  return "Skeletons_Idle";
}

export function sanitizeCharacterNodeName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
}

export function characterObjectNames(name: string): readonly string[] {
  return [...new Set([name, sanitizeCharacterNodeName(name), name.replaceAll(".", "_")])];
}

export function characterEquipmentFor(
  asset: CharacterSceneAsset,
  faction: Faction,
): readonly (CharacterEquipment & { readonly url: string })[] {
  return (asset.equipment ?? []).flatMap((piece) => {
    const url = piece.modelUrls[faction];
    return url ? [{ ...piece, url }] : [];
  });
}

export function characterHiddenObjectNames(
  role: CharacterRole,
  undeadOpponent = false,
): readonly string[] {
  const asset: CharacterSceneAsset = undeadOpponent
    ? UNDEAD_CHARACTER_SCENE_ASSETS[role]
    : CHARACTER_SCENE_ASSETS[role];
  return asset.hiddenObjectNames ?? [];
}

export function characterTintStrength(
  role: CharacterRole,
  objectName: string,
  undeadOpponent = false,
): number {
  const strengths: Readonly<Record<string, number>> = (
    undeadOpponent
      ? UNDEAD_CHARACTER_SCENE_ASSETS[role].tintStrengthByMesh
      : CHARACTER_SCENE_ASSETS[role].tintStrengthByMesh
  );
  return strengths[objectName] ?? 0;
}

function undeadCharacter({
  character,
  loadout,
  visualScale = 1,
  hiddenObjectNames = [],
}: {
  readonly character: "Skeleton_Warrior" | "Skeleton_Minion" | "Skeleton_Rogue" | "Skeleton_Mage";
  readonly loadout: readonly { readonly file: string; readonly boneName: string }[];
  readonly visualScale?: number;
  readonly hiddenObjectNames?: readonly string[];
}): CharacterSceneAsset {
  const tintStrengthByMesh: Record<string, number> = {
    [`${character}_Body`]: 0.72,
    [`${character}_Cloak`]: 0.78,
    [`${character}_Cape`]: 0.78,
    [`${character}_Hood`]: 0.64,
    [`${character}_Hat`]: 0.64,
    [`${character}_Helmet`]: 0.64,
    [`${character}_Eyes`]: 0.18,
  };
  for (const { file } of loadout) tintStrengthByMesh[file] = 0.34;
  return {
    modelUrl: `/assets/kaykit/skeletons/characters/${character}.glb`,
    visualScale,
    hiddenObjectNames,
    tintStrengthByMesh,
    equipment: loadout.map(({ file, boneName }) => ({
      modelUrls: undeadEquipmentUrls(file),
      boneName,
      scale: 1,
      position: [0, 0, 0] as const,
      rotation: [0, 0, 0] as const,
    })),
  };
}

function undeadEquipmentUrls(file: string): Readonly<Record<Faction, string>> {
  const url = `/assets/kaykit/skeletons/equipment/${file}.gltf`;
  return { verdant: url, crimson: url };
}

function stableVariation(id: string): 0 | 1 {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 0 : 1;
}
