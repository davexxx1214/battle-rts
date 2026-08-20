import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
  Vector3,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { BattleUnit, WorldPoint } from "../../game/battle";
import type { BattleRace } from "../../game/types";
import { terrainHeightAtMap } from "../../map/battlefield";
import {
  sceneColorsForFaction,
  UNDEAD_BONE_DRAGON_ASSET,
} from "../assets";
import { boneDragonTerrainSupportHeight } from "../boneDragonPresentation";
import { unitStatusModelTint } from "../effects/statusEffectPresentation";
import { unitBaseRingGeometry } from "./unitRingPresentation";
import {
  faceHealthBarToCamera,
  shouldShowUnitHealthBar,
} from "./unitHealthPresentation";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

const CORPSE_VISIBLE_SECONDS = 6.85;
const ATTACK_POSE_SECONDS = 0.62;
const LOCAL_X_AXIS = new Vector3(1, 0, 0);

interface PreparedBoneDragon {
  readonly model: Object3D;
  readonly head: Object3D | null;
  readonly mouthLower: Object3D | null;
}

export function BoneDragonUnitModel({
  unit,
  selected,
  attackSequence,
  attackTime,
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
  const gltf = useLoader(GLTFLoader, UNDEAD_BONE_DRAGON_ASSET.url);
  const root = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const healthParentRotation = useMemo(() => new Quaternion(), []);
  const healthCameraRotation = useMemo(() => new Quaternion(), []);
  const activeAction = useRef<AnimationAction | null>(null);
  const headAttackRotation = useMemo(() => new Quaternion(), []);
  const mouthAttackRotation = useMemo(() => new Quaternion(), []);
  const lastHeadAttackAngle = useRef(0);
  const lastMouthAttackAngle = useRef(0);
  const dragon = useMemo(() => prepareBoneDragonModel(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new AnimationMixer(dragon.model), [dragon.model]);
  const modelMaterials = useMemo(() => collectMaterials(dragon.model), [dragon.model]);
  const baseMaterialColors = useMemo(() => new Map(
    modelMaterials.map((material) => [material, material.color.clone()] as const),
  ), [modelMaterials]);
  const statusTintColor = useMemo(() => new Color(), []);
  const isGhost = ghostValid !== undefined;
  const damageAge = damageTime === undefined
    ? Number.POSITIVE_INFINITY
    : battleTime - damageTime;
  const attackAge = attackTime === undefined
    ? Number.POSITIVE_INFINITY
    : battleTime - attackTime;
  const statusTint = ghostValid === undefined && unit.health > 0
    ? unitStatusModelTint(unit.statusEffects, battleTime)
    : null;
  const supportHeight = boneDragonTerrainSupportHeight(unit.position, unit.facing, map);
  const animationName = unit.status === "moving"
    ? "Walk"
    : unit.status === "dead" ? "Rest_Pose" : "Idle";

  useEffect(() => {
    const clip = gltf.animations.find((candidate) => candidate.name === animationName)
      ?? gltf.animations.find((candidate) => candidate.name === "Idle")
      ?? gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    const previous = activeAction.current;
    if (previous && previous !== action) previous.fadeOut(0.14);
    action.reset();
    action.setEffectiveTimeScale(animationName === "Walk" ? 1.15 : 1);
    if (animationName === "Rest_Pose") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
      action.clampWhenFinished = false;
    }
    action.fadeIn(0.14).play();
    activeAction.current = action;
  }, [animationName, gltf.animations, mixer]);

  useEffect(() => () => {
    activeAction.current = null;
    mixer.stopAllAction();
  }, [mixer]);
  useEffect(() => {
    if (!isGhost) return;
    dragon.model.traverse((object) => {
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
    return () => disposeOwnedModelMaterials(dragon.model);
  }, [dragon, isGhost]);

  useFrame(({ camera, clock }, delta) => {
    if (dragon.head && lastHeadAttackAngle.current !== 0) {
      headAttackRotation.setFromAxisAngle(LOCAL_X_AXIS, -lastHeadAttackAngle.current);
      dragon.head.quaternion.multiply(headAttackRotation);
    }
    if (dragon.mouthLower && lastMouthAttackAngle.current !== 0) {
      mouthAttackRotation.setFromAxisAngle(LOCAL_X_AXIS, -lastMouthAttackAngle.current);
      dragon.mouthLower.quaternion.multiply(mouthAttackRotation);
    }
    mixer.update(delta);
    const attackPose = unit.diedAt === null ? dragonAttackPose(attackAge) : 0;
    if (dragon.head) {
      lastHeadAttackAngle.current = attackPose * 0.14;
      headAttackRotation.setFromAxisAngle(LOCAL_X_AXIS, lastHeadAttackAngle.current);
      dragon.head.quaternion.multiply(headAttackRotation);
    }
    if (dragon.mouthLower) {
      lastMouthAttackAngle.current = attackPose * 0.46;
      mouthAttackRotation.setFromAxisAngle(LOCAL_X_AXIS, lastMouthAttackAngle.current);
      dragon.mouthLower.quaternion.multiply(mouthAttackRotation);
    }
    const deathAge = unit.diedAt === null ? 0 : battleTime - unit.diedAt;
    const alive = unit.diedAt === null;
    const fade = alive ? 1 : 1 - MathUtils.clamp((deathAge - 6) / 0.85, 0, 1);
    const damageProgress = MathUtils.clamp(damageAge / 0.2, 0, 1);
    const recoilStrength = damageAge < 0.2
      ? Math.sin(damageProgress * Math.PI) * 0.28
      : 0;
    const recoilDirection = damageSourcePosition
      ? normalizedDirection(damageSourcePosition, unit.position)
      : { x: 0, z: 0 };
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
        material.emissive.set("#eaffff");
        material.emissiveIntensity = (1 - damageProgress) * 1.65;
      } else if (statusTint) {
        material.emissive.copy(statusTintColor);
        material.emissiveIntensity = 0.12 + statusTint.emissiveIntensity;
      } else {
        material.emissive.set("#77dfff");
        material.emissiveIntensity = 0.12;
      }
      material.opacity = ghostValid === undefined ? fade : 0.42;
      if (ghostValid !== undefined) material.depthWrite = false;
    }
    if (root.current) {
      root.current.visible = alive || deathAge < CORPSE_VISIBLE_SECONDS;
      if (ghostValid !== undefined) {
        root.current.position.set(
          unit.position.x,
          supportHeight + UNDEAD_BONE_DRAGON_ASSET.groundOffset,
          unit.position.z,
        );
        root.current.rotation.set(0, unit.facing, 0);
      } else {
        root.current.position.x = MathUtils.damp(
          root.current.position.x,
          unit.position.x + recoilDirection.x * recoilStrength,
          10,
          delta,
        );
        root.current.position.y = MathUtils.damp(
          root.current.position.y,
          supportHeight + UNDEAD_BONE_DRAGON_ASSET.groundOffset,
          8,
          delta,
        );
        root.current.position.z = MathUtils.damp(
          root.current.position.z,
          unit.position.z + recoilDirection.z * recoilStrength,
          10,
          delta,
        );
        root.current.rotation.x = MathUtils.damp(root.current.rotation.x, 0, 10, delta);
        root.current.rotation.y = dampAngle(root.current.rotation.y, unit.facing, 10, delta);
        root.current.rotation.z = MathUtils.damp(
          root.current.rotation.z,
          alive ? Math.sin(clock.elapsedTime * 1.35 + stablePhase(unit.id)) * 0.012 : 0.42,
          6,
          delta,
        );
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
  const healthWidth = 1.22 * healthRatio;
  const factionColors = sceneColorsForFaction(unit.faction, race);
  const ring = unitBaseRingGeometry(unit.role);
  const groundY = terrainHeightAtMap(map, unit.position) + 0.06;
  return (
    <>
      {ghostValid === undefined && unit.health > 0 && (
        <group position={[unit.position.x, groundY, unit.position.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ring.innerRadius, ring.outerRadius, ring.segments]} />
            <meshBasicMaterial
              color={factionColors.accent}
              transparent
              opacity={0.72}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.08, 36]} />
            <meshBasicMaterial color="#132434" transparent opacity={0.24} depthWrite={false} />
          </mesh>
          {selected && (
            <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.42, 1.58, 40]} />
              <meshBasicMaterial color="#f1cf6a" transparent opacity={0.95} depthWrite={false} />
            </mesh>
          )}
        </group>
      )}
      <group
        ref={root}
        position={[
          unit.position.x,
          supportHeight + UNDEAD_BONE_DRAGON_ASSET.groundOffset,
          unit.position.z,
        ]}
        rotation={[0, unit.facing, 0]}
      >
        <primitive object={dragon.model} />
        {attackSequence !== undefined && unit.health > 0 && (
          <DragonAttackPulse key={attackSequence} />
        )}
        {shouldShowUnitHealthBar(unit.health, unit.maxHealth) && (
          <group ref={healthRoot} position={[0, 1.02, 0]}>
            <mesh renderOrder={140}>
              <planeGeometry args={[1.36, 0.13]} />
              <meshBasicMaterial color="#15131b" depthTest={false} depthWrite={false} />
            </mesh>
            <mesh position={[-(1.22 - healthWidth) / 2, 0, 0.006]} renderOrder={141}>
              <planeGeometry args={[healthWidth, 0.084]} />
              <meshBasicMaterial
                color={factionColors.accent}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        )}
      </group>
    </>
  );
}

function DragonAttackPulse() {
  const root = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / ATTACK_POSE_SECONDS,
      0,
      1,
    );
    if (root.current) {
      const pulse = Math.sin(progress * Math.PI);
      root.current.scale.setScalar(0.45 + pulse * 0.75);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = Math.sin(progress * Math.PI) * 0.88;
  });
  return (
    <mesh ref={root} position={[0, 0.38, 1.23]}>
      <sphereGeometry args={[0.14, 18, 12]} />
      <meshBasicMaterial
        ref={material}
        color="#8feaff"
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function prepareBoneDragonModel(source: Object3D): PreparedBoneDragon {
  const model = cloneSkeleton(source);
  model.scale.setScalar(UNDEAD_BONE_DRAGON_ASSET.scale);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone());
    } else {
      object.material = object.material.clone();
    }
  });
  return {
    model,
    head: model.getObjectByName("head") ?? null,
    mouthLower: model.getObjectByName("mouth_lower") ?? null,
  };
}

function dragonAttackPose(age: number): number {
  if (age < 0 || age >= ATTACK_POSE_SECONDS) return 0;
  if (age < 0.16) return MathUtils.smoothstep(age, 0, 0.16);
  if (age < 0.44) return 1;
  return 1 - MathUtils.smoothstep(age, 0.44, ATTACK_POSE_SECONDS);
}

function collectMaterials(model: Object3D): MeshStandardMaterial[] {
  const materials: MeshStandardMaterial[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const candidates = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of candidates) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.transparent = true;
      materials.push(material);
    }
  });
  return materials;
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

function normalizedDirection(origin: WorldPoint, destination: WorldPoint): WorldPoint {
  const x = destination.x - origin.x;
  const z = destination.z - origin.z;
  const length = Math.hypot(x, z);
  return length > 0.001 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const deltaAngle = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}

function stablePhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 628) / 100;
}
