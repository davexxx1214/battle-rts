import { useFrame, useLoader } from "@react-three/fiber";
import {
  AnimationMixer,
  Box3,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useRef } from "react";

import type { CombatBattleUnit, WorldPoint } from "../../game/battle";
import { terrainHeightAtMap } from "../../map/battlefield";
import { NEUTRAL_MONSTER_SCENE_ASSETS } from "../assets";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";
import {
  faceHealthBarToCamera,
  shouldShowUnitHealthBar,
} from "./unitHealthPresentation";

const NEUTRAL_RING_COLOR = "#f2c35b";
export const NEUTRAL_MONSTER_VISUAL_SCALE = 0.5;

export function NeutralMonsterModel({
  unit,
  attackSequence,
  battleTime,
  damageTime,
  damageSourcePosition,
}: {
  readonly unit: CombatBattleUnit;
  readonly attackSequence?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
}) {
  const { map } = useBattlefieldDefinition();
  const kind = unit.neutralKind ?? "skeleton";
  const asset = NEUTRAL_MONSTER_SCENE_ASSETS[kind];
  const gltf = useLoader(GLTFLoader, asset.url);
  const root = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const parentRotation = useMemo(() => new Quaternion(), []);
  const cameraRotation = useMemo(() => new Quaternion(), []);
  const model = useMemo(
    () => prepareNeutralMonsterModel(gltf.scene, asset.targetHeight),
    [asset.targetHeight, gltf.scene],
  );
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const activeClip = useRef("");
  const animationName = unit.status === "dead"
    ? "Death"
    : damageTime !== undefined && battleTime - damageTime < 0.22
      ? "HitReact"
      : unit.status === "attacking"
        ? "Sword"
        : unit.status === "moving" ? "Walk" : "Idle";
  const animationKey = animationName === "Sword"
    ? `${animationName}:${attackSequence ?? 0}`
    : animationName;

  useEffect(() => {
    if (activeClip.current === animationKey) return;
    const clip = gltf.animations.find((candidate) => candidate.name === animationName)
      ?? gltf.animations.find((candidate) => candidate.name === "Idle")
      ?? gltf.animations[0];
    if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset();
    if (animationName === "Death" || animationName === "HitReact") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = animationName === "Death";
    } else {
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    }
    action.fadeIn(0.1).play();
    activeClip.current = animationKey;
  }, [animationKey, animationName, gltf.animations, mixer]);

  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    disposeOwnedModelMaterials(model);
  }, [mixer, model]);

  useFrame(({ camera, clock }, delta) => {
    mixer.update(delta);
    const deathAge = unit.diedAt === null ? 0 : battleTime - unit.diedAt;
    const damageAge = damageTime === undefined
      ? Number.POSITIVE_INFINITY
      : battleTime - damageTime;
    const damageStrength = damageAge < 0.2
      ? Math.sin(MathUtils.clamp(damageAge / 0.2, 0, 1) * Math.PI) * 0.16
      : 0;
    const recoil = damageSourcePosition
      ? normalizedDirection(damageSourcePosition, unit.position)
      : { x: 0, z: 0 };
    if (root.current) {
      root.current.visible = unit.diedAt === null || deathAge < 6.85;
      root.current.position.x = MathUtils.damp(
        root.current.position.x,
        unit.position.x + recoil.x * damageStrength,
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
        unit.position.z + recoil.z * damageStrength,
        11,
        delta,
      );
      root.current.rotation.y = MathUtils.damp(
        root.current.rotation.y,
        unit.facing,
        13,
        delta,
      );
      const pulse = 0.94 + Math.sin(clock.elapsedTime * 2.4 + unit.id.length) * 0.04;
      root.current.scale.setScalar(
        (unit.health > 0 ? pulse : 1) * NEUTRAL_MONSTER_VISUAL_SCALE,
      );
    }
    if (healthRoot.current) {
      faceHealthBarToCamera(healthRoot.current, camera, parentRotation, cameraRotation);
    }
  });

  const healthRatio = MathUtils.clamp(unit.health / Math.max(1, unit.maxHealth), 0, 1);
  const healthWidth = 0.92 * healthRatio;
  const barHeight = kind === "mako" ? 1.95 : kind === "sharky" ? 1.6 : 1.4;
  const ringRadius = kind === "mako" ? 0.68 : kind === "sharky" ? 0.52 : 0.44;
  return (
    <group
      name={`neutral-monster-${kind}`}
      ref={root}
      position={[
        unit.position.x,
        terrainHeightAtMap(map, unit.position) + 0.08,
        unit.position.z,
      ]}
      rotation={[0, unit.facing, 0]}
      scale={NEUTRAL_MONSTER_VISUAL_SCALE}
    >
      <primitive object={model} />
      {unit.health > 0 && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringRadius, ringRadius + 0.09, 28]} />
          <meshBasicMaterial
            color={NEUTRAL_RING_COLOR}
            transparent
            opacity={0.92}
            depthWrite={false}
          />
        </mesh>
      )}
      {shouldShowUnitHealthBar(unit.health, unit.maxHealth) && (
        <group ref={healthRoot} position={[0, barHeight, 0]}>
          <mesh renderOrder={140}>
            <planeGeometry args={[1.02, 0.12]} />
            <meshBasicMaterial color="#18140f" depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[-(0.92 - healthWidth) / 2, 0, 0.006]} renderOrder={141}>
            <planeGeometry args={[healthWidth, 0.075]} />
            <meshBasicMaterial
              color={NEUTRAL_RING_COLOR}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function prepareNeutralMonsterModel(source: Object3D, targetHeight: number): Object3D {
  const model = cloneSkeleton(source);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const ownedMaterials = materials.map((material) => {
      const owned = material.clone();
      if (owned instanceof MeshStandardMaterial) {
        owned.roughness = Math.max(0.52, owned.roughness);
      }
      return owned;
    });
    object.material = Array.isArray(object.material) ? ownedMaterials : ownedMaterials[0]!;
  });
  const initialBounds = new Box3().setFromObject(model);
  const size = initialBounds.getSize(new Vector3());
  const scale = size.y > 1e-6 ? targetHeight / size.y : 1;
  model.scale.setScalar(scale);
  const bounds = new Box3().setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
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

function normalizedDirection(origin: WorldPoint, destination: WorldPoint): WorldPoint {
  const x = destination.x - origin.x;
  const z = destination.z - origin.z;
  const length = Math.hypot(x, z);
  return length > 1e-6 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}
