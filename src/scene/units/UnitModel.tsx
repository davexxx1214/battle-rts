import { useFrame, useLoader } from "@react-three/fiber";
import {
  type AnimationAction,
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useRef } from "react";

import type { BattleUnit, UnitRole, WorldPoint } from "../../game/battle";
import type { BattleRace } from "../../game/types";
import { terrainHeightAtMap } from "../../map/battlefield";
import { sceneColorsForFaction } from "../assets";
import { unitStatusModelTint } from "../effects/statusEffectPresentation";
import { CatapultUnitModel } from "./CatapultUnitModel";
import { BoneDragonUnitModel } from "./BoneDragonUnitModel";
import {
  CHARACTER_ANIMATION_URLS,
  characterAnimationForState,
  characterEquipmentFor,
  characterHiddenObjectNames,
  characterObjectNames,
  characterSceneAssetFor,
  characterTintStrength,
  sanitizeCharacterNodeName,
  type CharacterEquipment,
  type CharacterRole,
  type CharacterSceneAsset,
} from "./characterPresentation";
import { unitBaseRingGeometry } from "./unitRingPresentation";
import {
  faceHealthBarToCamera,
  shouldShowUnitHealthBar,
} from "./unitHealthPresentation";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

const CHARACTER_SCALE = 0.27;
const FAR_ANIMATION_STEP_SECONDS = 1 / 15;

export function UnitModel({
  race,
  undeadOpponent = false,
  ...props
}: {
  readonly unit: BattleUnit;
  readonly selected: boolean;
  readonly attackSequence?: number;
  readonly attackTime?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
  readonly race?: BattleRace;
  readonly undeadOpponent?: boolean;
  readonly ghostValid?: boolean;
}) {
  const resolvedRace: BattleRace = race
    ?? (undeadOpponent && props.unit.faction === "crimson" ? "undead" : "human");
  if (props.unit.role === "bone-dragon") {
    return <BoneDragonUnitModel {...props} race={resolvedRace} />;
  }
  if (props.unit.role === "catapult") {
    return <CatapultUnitModel {...props} race={resolvedRace} />;
  }
  return <CharacterUnitModel {...props} race={resolvedRace} />;
}

function CharacterUnitModel({
  unit,
  selected,
  attackSequence,
  battleTime,
  damageTime,
  damageSourcePosition,
  race,
  ghostValid,
}: {
  readonly unit: BattleUnit;
  readonly selected: boolean;
  readonly attackSequence?: number;
  readonly attackTime?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
  readonly race: BattleRace;
  readonly ghostValid?: boolean;
}) {
  const { map } = useBattlefieldDefinition();
  const role = unit.role as CharacterRole;
  const asset: CharacterSceneAsset = characterSceneAssetFor(
    role,
    unit.faction,
    race,
  );
  const visualScale = asset.visualScale ?? 1;
  const equipment = useMemo(
    () => characterEquipmentFor(asset, unit.faction),
    [asset, unit.faction],
  );
  const modelUrls = useMemo(
    () => [asset.modelUrl, ...equipment.map((piece) => piece.url)],
    [asset.modelUrl, equipment],
  );
  const loadedCharacterGltfs = useLoader(GLTFLoader, modelUrls);
  const characterGltfs = Array.isArray(loadedCharacterGltfs)
    ? loadedCharacterGltfs
    : [loadedCharacterGltfs];
  const gltf = characterGltfs[0]!;
  const loadedAnimationGltfs = useLoader(GLTFLoader, [...CHARACTER_ANIMATION_URLS]);
  const animationGltfs = Array.isArray(loadedAnimationGltfs)
    ? loadedAnimationGltfs
    : [loadedAnimationGltfs];
  const root = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const healthParentRotation = useMemo(() => new Quaternion(), []);
  const healthCameraRotation = useMemo(() => new Quaternion(), []);
  const activeAction = useRef<AnimationAction | null>(null);
  const model = useMemo(
    () => prepareCharacterModel(
      gltf.scene,
      unit.faction,
      role,
      race,
      visualScale,
      equipment.map((piece, index) => ({
        ...piece,
        source: characterGltfs[index + 1]!.scene,
      })),
    ),
    [equipment, gltf.scene, race, role, unit.faction, visualScale],
  );
  const animationGltfsRef = useRef(animationGltfs);
  animationGltfsRef.current = animationGltfs;
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const modelMaterials = useMemo(() => collectModelMaterials(model), [model]);
  const baseMaterialColors = useMemo(() => new Map(
    modelMaterials.map((material) => [material, material.color.clone()] as const),
  ), [modelMaterials]);
  const statusTintColor = useMemo(() => new Color(), []);
  const isGhost = ghostValid !== undefined;
  const animationAccumulator = useRef(0);
  const damageAge = damageTime === undefined ? Number.POSITIVE_INFINITY : battleTime - damageTime;
  const statusTint = ghostValid === undefined && unit.health > 0
    ? unitStatusModelTint(unit.statusEffects, battleTime)
    : null;
  const animationName = characterAnimationForState({
    id: unit.id,
    role,
    status: unit.status,
    attackSequence,
    damaged: damageAge < 0.2,
    race,
  });

  useEffect(() => {
    const available = animationGltfsRef.current.flatMap((animation) => animation.animations);
    const clip = available.find((candidate) => candidate.name === animationName)
      ?? available.find((candidate) => candidate.name === "Idle_A")
      ?? available[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    const previous = activeAction.current;
    if (previous && previous !== action) previous.fadeOut(0.12);
    action.reset();
    if (unit.status === "dead") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else if (animationName.startsWith("Hit_")) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
      action.clampWhenFinished = false;
    }
    action.fadeIn(0.12).play();
    activeAction.current = action;
  }, [animationName, attackSequence, damageTime, mixer, unit.status]);

  useEffect(() => () => {
    activeAction.current = null;
    mixer.stopAllAction();
  }, [mixer]);
  useEffect(() => {
    if (!isGhost) return;
    configureGhostMaterials(model);
    return () => disposeOwnedModelMaterials(model);
  }, [isGhost, model]);
  useFrame(({ camera }, delta) => {
    const isNearCamera = Math.hypot(
      camera.position.x - unit.position.x,
      camera.position.z - unit.position.z,
    ) <= 12;
    animationAccumulator.current += delta;
    if (isNearCamera || animationAccumulator.current >= FAR_ANIMATION_STEP_SECONDS) {
      mixer.update(animationAccumulator.current);
      animationAccumulator.current = 0;
    }
    const damageProgress = MathUtils.clamp(damageAge / 0.2, 0, 1);
    const recoilStrength = damageAge < 0.2 ? Math.sin(damageProgress * Math.PI) * 0.18 : 0;
    const recoilDirection = damageSourcePosition
      ? normalizedDirection(damageSourcePosition, unit.position)
      : { x: 0, z: 0 };
    const deathAge = unit.diedAt === null ? 0 : battleTime - unit.diedAt;
    const corpseOpacity = unit.diedAt === null
      ? 1
      : 1 - MathUtils.clamp((deathAge - 6) / 0.85, 0, 1);
    const ghostColor = ghostValid === false ? "#ff625e" : "#67dc9b";
    if (statusTint) statusTintColor.set(statusTint.color);
    for (const material of modelMaterials) {
      const baseColor = baseMaterialColors.get(material);
      if (baseColor) material.color.copy(baseColor);
      if (statusTint) material.color.lerp(statusTintColor, statusTint.colorMix);
      if (ghostValid !== undefined) {
        material.emissive.set(ghostColor);
        material.emissiveIntensity = 0.52;
      } else if (damageAge < 0.2) {
        material.emissive.set("#ffffff");
        material.emissiveIntensity = (1 - damageProgress) * 1.45;
      } else if (statusTint) {
        material.emissive.copy(statusTintColor);
        material.emissiveIntensity = statusTint.emissiveIntensity;
      } else {
        material.emissive.set("#ffffff");
        material.emissiveIntensity = 0;
      }
      material.opacity = ghostValid === undefined ? corpseOpacity : 0.42;
      if (ghostValid !== undefined) material.depthWrite = false;
    }
    if (root.current) {
      root.current.visible = unit.diedAt === null || deathAge < 6.85;
      if (ghostValid !== undefined) {
        root.current.position.set(
          unit.position.x,
          terrainHeightAtMap(map, unit.position) + 0.08,
          unit.position.z,
        );
        root.current.rotation.y = unit.facing;
      } else {
        root.current.position.x = MathUtils.damp(
          root.current.position.x,
          unit.position.x + recoilDirection.x * recoilStrength,
          11,
          delta,
        );
        root.current.position.y = MathUtils.damp(
          root.current.position.y,
          terrainHeightAtMap(map, unit.position) + 0.08,
          11,
          delta,
        );
        root.current.position.z = MathUtils.damp(
          root.current.position.z,
          unit.position.z + recoilDirection.z * recoilStrength,
          11,
          delta,
        );
        root.current.rotation.y = dampAngle(root.current.rotation.y, unit.facing, 13, delta);
      }
    }
    if (healthRoot.current) {
      faceHealthBarToCamera(
        healthRoot.current,
        camera,
        healthParentRotation,
        healthCameraRotation,
      );
    }
  });

  const healthRatio = MathUtils.clamp(unit.health / Math.max(1, unit.maxHealth), 0, 1);
  const factionColors = sceneColorsForFaction(unit.faction, race);
  const baseRing = unitBaseRingGeometry(unit.role);
  const healthWidth = 0.76 * visualScale * healthRatio;
  return (
    <group
      ref={root}
      position={[unit.position.x, terrainHeightAtMap(map, unit.position) + 0.08, unit.position.z]}
      rotation={[0, unit.facing, 0]}
    >
      <primitive object={model} />
      {ghostValid === undefined && unit.health > 0 && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[
              baseRing.innerRadius * visualScale,
              baseRing.outerRadius * visualScale,
              baseRing.segments,
            ]}
          />
          <meshBasicMaterial
            color={factionColors.accent}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}
      {selected && unit.health > 0 && (
        <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.49 * visualScale, 0.61 * visualScale, 32]} />
          <meshBasicMaterial color="#f1cf6a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {attackSequence !== undefined && unit.health > 0 && (
        <AttackPulse role={unit.role} race={race} visualScale={visualScale} key={attackSequence} />
      )}
      {shouldShowUnitHealthBar(unit.health, unit.maxHealth) && (
        <group ref={healthRoot} position={[0, 2.02 * visualScale, 0]}>
          <mesh renderOrder={140}>
            <planeGeometry args={[0.86 * visualScale, 0.1]} />
            <meshBasicMaterial color="#18140f" depthTest={false} depthWrite={false} />
          </mesh>
          <mesh
            position={[-(0.76 * visualScale - healthWidth) / 2, 0, 0.006]}
            renderOrder={141}
          >
            <planeGeometry args={[healthWidth, 0.064]} />
            <meshBasicMaterial
              color={factionColors.accent}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function AttackPulse({
  role,
  race,
  visualScale,
}: {
  readonly role: UnitRole;
  readonly race: BattleRace;
  readonly visualScale: number;
}) {
  const root = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.28, 0, 1);
    if (root.current) {
      root.current.scale.setScalar(1 + progress * 1.2);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = (1 - progress) * 0.82;
  });
  return (
    <mesh ref={root} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42 * visualScale, 0.49 * visualScale, 24]} />
      <meshBasicMaterial
        ref={material}
        color={role === "mage"
          ? race === "undead" ? "#c084ff" : "#75cfff"
          : "#ffd178"}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function prepareCharacterModel(
  source: Object3D,
  faction: BattleUnit["faction"],
  role: CharacterRole,
  race: BattleRace,
  visualScale: number,
  equipment: readonly (CharacterEquipment & { readonly source: Object3D })[],
): Object3D {
  const model = cloneSkeleton(source);
  sanitizeCharacterGraph(model);
  for (const [index, piece] of equipment.entries()) {
    const handSlot = findCharacterObject(model, piece.boneName);
    if (!handSlot) continue;
    const attached = piece.source.clone(true);
    attached.name = `${role}-equipment-${index}`;
    attached.position.set(...piece.position);
    attached.rotation.set(...piece.rotation);
    attached.scale.setScalar(piece.scale);
    handSlot.add(attached);
  }
  const isUndead = race === "undead";
  const hiddenObjects = new Set(
    characterHiddenObjectNames(role, isUndead).flatMap((name) => characterObjectNames(name)),
  );
  const tint = new Color(sceneColorsForFaction(faction, race).tint);
  model.scale.setScalar(CHARACTER_SCALE * visualScale);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  if (Number.isFinite(bounds.min.y)) model.position.y -= bounds.min.y;
  model.traverse((object) => {
    if (hiddenObjects.has(object.name)) object.visible = false;
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const tintStrength = characterTintStrength(role, object.name, isUndead);
    if (Array.isArray(object.material)) {
      object.material = object.material.map(
        (material) => tintMaterial(material, tint, tintStrength),
      );
    } else {
      object.material = tintMaterial(object.material, tint, tintStrength);
    }
    if (isUndead && object.name.endsWith("_Eyes")) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.emissive.set("#80ff5c");
        material.emissiveIntensity = 1.15;
      }
    }
  });
  return model;
}

function disposeOwnedModelMaterials(model: Object3D): void {
  const materials = new Set<Material>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const material of materials) material.dispose();
}

function configureGhostMaterials(model: Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });
}

function tintMaterial(material: Material, tint: Color, strength: number): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(tint, strength);
    clone.transparent = true;
  }
  return clone;
}

function collectModelMaterials(model: Object3D): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of candidates) {
      if (material instanceof MeshStandardMaterial) materials.push(material);
    }
  });
  return materials;
}

function normalizedDirection(origin: WorldPoint, destination: WorldPoint): WorldPoint {
  const x = destination.x - origin.x;
  const z = destination.z - origin.z;
  const length = Math.hypot(x, z);
  return length > 0.001 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

function sanitizeCharacterGraph(root: Object3D): void {
  root.traverse((object) => {
    if (object.name) object.name = sanitizeCharacterNodeName(object.name);
  });
}

function findCharacterObject(root: Object3D, name: string): Object3D | undefined {
  for (const candidate of characterObjectNames(name)) {
    const found = root.getObjectByName(candidate);
    if (found) return found;
  }
  return undefined;
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const deltaAngle = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}
