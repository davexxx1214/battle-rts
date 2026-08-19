import { useFrame, useLoader } from "@react-three/fiber";
import {
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
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

import type { BattleUnit, WorldPoint } from "../../game/battle";
import type { BattleRace } from "../../game/types";
import { terrainHeightAt } from "../../map/battlefield";
import {
  MOBILE_CATAPULT_PARTS,
  SCENE_MODEL_URLS,
  UNIT_BASE_RING_GEOMETRY,
  sceneColorsForFaction,
} from "../assets";
import {
  catapultMotionPose,
  operatorAnimationForStatus,
  wheelRotationForTravel,
} from "./catapultAnimation";
import { CATAPULT_OPERATOR_ANIMATION_URLS } from "./characterPresentation";
import {
  faceHealthBarToCamera,
  shouldShowUnitHealthBar,
} from "./unitHealthPresentation";

interface PreparedCatapult {
  readonly model: Object3D;
  readonly throwingArm: Object3D | null;
  readonly wheels: readonly Object3D[];
}

export function CatapultUnitModel({
  unit,
  selected,
  attackSequence,
  attackTime,
  battleTime,
  damageTime,
  damageSourcePosition,
  race = "human",
}: {
  readonly unit: BattleUnit;
  readonly selected: boolean;
  readonly attackSequence?: number;
  readonly attackTime?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
  readonly race?: BattleRace;
}) {
  const isUndead = race === "undead";
  const catapultGltf = useLoader(GLTFLoader, SCENE_MODEL_URLS.mobileCatapult);
  const operatorGltf = useLoader(
    GLTFLoader,
    isUndead
      ? "/assets/kaykit/skeletons/characters/Skeleton_Warrior.glb"
      : SCENE_MODEL_URLS.catapultOperator,
  );
  const operatorAnimationGltfs = useLoader(
    GLTFLoader,
    [...CATAPULT_OPERATOR_ANIMATION_URLS],
  );
  const root = useRef<Object3D>(null);
  const animatedRig = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const healthParentRotation = useMemo(() => new Quaternion(), []);
  const healthCameraRotation = useMemo(() => new Quaternion(), []);
  const catapult = useMemo(
    () => prepareCatapult(catapultGltf.scene, unit.faction, race),
    [catapultGltf.scene, race, unit.faction],
  );
  const operator = useMemo(
    () => prepareOperator(operatorGltf.scene, unit.faction, race),
    [operatorGltf.scene, race, unit.faction],
  );
  const operatorClips = useMemo(
    () => {
      const files = Array.isArray(operatorAnimationGltfs)
        ? operatorAnimationGltfs
        : [operatorAnimationGltfs];
      return files.flatMap((animation) => animation.animations);
    },
    [operatorAnimationGltfs],
  );
  const operatorMixer = useMemo(() => new AnimationMixer(operator), [operator]);
  const lastWheelPosition = useRef({ ...unit.position });
  const operatorAnimation = operatorAnimationForStatus(unit.status);
  const materials = useMemo(
    () => [...collectMaterials(catapult.model), ...collectMaterials(operator)],
    [catapult, operator],
  );
  const damageAge = damageTime === undefined ? Number.POSITIVE_INFINITY : battleTime - damageTime;

  useEffect(() => {
    const clip = operatorClips.find((candidate) => candidate.name === operatorAnimation)
      ?? operatorClips.find((candidate) => candidate.name === "Idle_A")
      ?? operatorClips[0];
    operatorMixer.stopAllAction();
    if (!clip) return;
    const action = operatorMixer.clipAction(clip);
    action.reset();
    if (unit.status === "dead") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.fadeIn(0.08).play();
    return () => {
      action.fadeOut(0.08);
    };
  }, [operatorAnimation, operatorClips, operatorMixer, unit.status]);

  useEffect(() => () => {
    operatorMixer.stopAllAction();
  }, [operatorMixer]);

  useFrame(({ camera }, delta) => {
    operatorMixer.update(delta);
    const motion = catapultMotionPose(
      attackTime === undefined ? undefined : battleTime - attackTime,
    );
    if (catapult.throwingArm) {
      catapult.throwingArm.rotation.x = MathUtils.damp(
        catapult.throwingArm.rotation.x,
        motion.armRotation,
        24,
        delta,
      );
    }
    const travelled = Math.hypot(
      unit.position.x - lastWheelPosition.current.x,
      unit.position.z - lastWheelPosition.current.z,
    );
    const wheelRotation = travelled < 1 ? wheelRotationForTravel(travelled) : 0;
    for (const wheel of catapult.wheels) {
      wheel.rotation.x += wheelRotation;
    }
    lastWheelPosition.current = { ...unit.position };
    if (animatedRig.current) {
      animatedRig.current.rotation.x = MathUtils.damp(
        animatedRig.current.rotation.x,
        motion.carriageRock,
        18,
        delta,
      );
    }
    const damageProgress = MathUtils.clamp(damageAge / 0.2, 0, 1);
    const recoilStrength = damageAge < 0.2 ? Math.sin(damageProgress * Math.PI) * 0.22 : 0;
    const recoilDirection = damageSourcePosition
      ? normalizedDirection(damageSourcePosition, unit.position)
      : { x: 0, z: 0 };
    const deathAge = unit.diedAt === null ? 0 : battleTime - unit.diedAt;
    const opacity = unit.diedAt === null ? 1 : 1 - MathUtils.clamp((deathAge - 6) / 0.85, 0, 1);
    for (const material of materials) {
      material.emissive.set("#fff3d2");
      material.emissiveIntensity = damageAge < 0.2 ? (1 - damageProgress) * 1.2 : 0;
      material.opacity = opacity;
    }
    if (root.current) {
      root.current.visible = unit.diedAt === null || deathAge < 6.85;
      root.current.position.x = MathUtils.damp(
        root.current.position.x,
        unit.position.x + recoilDirection.x * recoilStrength,
        10,
        delta,
      );
      root.current.position.y = MathUtils.damp(
        root.current.position.y,
        terrainHeightAt(unit.position) + 0.08,
        10,
        delta,
      );
      root.current.position.z = MathUtils.damp(
        root.current.position.z,
        unit.position.z + recoilDirection.z * recoilStrength,
        10,
        delta,
      );
      root.current.rotation.y = dampAngle(root.current.rotation.y, unit.facing, 9, delta);
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
  const baseRing = UNIT_BASE_RING_GEOMETRY.catapult;
  const factionColors = sceneColorsForFaction(unit.faction, race);
  return (
    <group
      ref={root}
      position={[unit.position.x, terrainHeightAt(unit.position) + 0.08, unit.position.z]}
      rotation={[0, unit.facing, 0]}
    >
      <group ref={animatedRig}>
        <primitive object={catapult.model} />
        <primitive object={operator} position={[0.72, 0, -0.62]} rotation={[0, -0.16, 0]} />
      </group>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[baseRing.innerRadius, baseRing.outerRadius, baseRing.segments]} />
        <meshBasicMaterial
          color={factionColors.accent}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>
      {selected && unit.health > 0 && (
        <mesh position={[0, 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.04, 36]} />
          <meshBasicMaterial color="#f1cf6a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {attackSequence !== undefined && unit.health > 0 && (
        <SiegePulse key={attackSequence} />
      )}
      {shouldShowUnitHealthBar(unit.health, unit.maxHealth) && (
        <group ref={healthRoot} position={[0, 2.72, 0]}>
          <mesh renderOrder={140}>
            <planeGeometry args={[1.34, 0.12]} />
            <meshBasicMaterial color="#18140f" depthTest={false} depthWrite={false} />
          </mesh>
          <mesh position={[-(1.22 - healthWidth) / 2, 0, 0.006]} renderOrder={141}>
            <planeGeometry args={[healthWidth, 0.076]} />
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

function SiegePulse() {
  const root = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.5, 0, 1);
    if (root.current) {
      root.current.scale.setScalar(1 + progress * 1.5);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = (1 - progress) * 0.72;
  });
  return (
    <mesh ref={root} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.78, 0.92, 18]} />
      <meshBasicMaterial ref={material} color="#d9b26b" transparent depthWrite={false} />
    </mesh>
  );
}

function prepareCatapult(
  source: Object3D,
  faction: BattleUnit["faction"],
  race: BattleRace,
): PreparedCatapult {
  const model = source.clone(true);
  const tint = new Color(sceneColorsForFaction(faction, race).tint);
  model.scale.setScalar(2.2);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const tinted = materials.map((material) => tintMaterial(
      material,
      tint,
      race === "undead" ? 0.42 : 0.12,
    ));
    object.material = Array.isArray(object.material) ? tinted : tinted[0]!;
  });
  normalizeToGround(model);
  return {
    model,
    throwingArm: model.getObjectByName(MOBILE_CATAPULT_PARTS.throwingArm) ?? null,
    wheels: MOBILE_CATAPULT_PARTS.wheels
      .map((name) => model.getObjectByName(name))
      .filter((part): part is Object3D => part !== undefined),
  };
}

function prepareOperator(
  source: Object3D,
  faction: BattleUnit["faction"],
  race: BattleRace,
): Object3D {
  const model = cloneSkeleton(source);
  const tint = new Color(sceneColorsForFaction(faction, race).tint);
  model.scale.setScalar(0.25);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const tinted = materials.map((material) => tintMaterial(
      material,
      tint,
      race === "undead" ? 0.18 : 0.34,
    ));
    object.material = Array.isArray(object.material) ? tinted : tinted[0]!;
  });
  normalizeToGround(model);
  return model;
}

function tintMaterial(material: Material, tint: Color, strength: number): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(tint, strength);
    clone.transparent = true;
  }
  return clone;
}

function normalizeToGround(model: Object3D): void {
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  if (Number.isFinite(bounds.min.y)) model.position.y -= bounds.min.y;
}

function collectMaterials(model: Object3D): MeshStandardMaterial[] {
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

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const deltaAngle = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}
