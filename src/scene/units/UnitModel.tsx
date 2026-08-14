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
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useRef } from "react";

import type { BattleUnit, UnitRole, WorldPoint } from "../../game/battle";
import { terrainHeightAt } from "../../map/battlefield";
import { CatapultUnitModel } from "./CatapultUnitModel";

const MODEL_URLS: Readonly<Record<Exclude<UnitRole, "catapult">, string>> = {
  knight: "/assets/kaykit/adventurers/characters/Knight.glb",
  ranger: "/assets/kaykit/adventurers/characters/Ranger.glb",
  mage: "/assets/kaykit/adventurers/characters/Mage.glb",
};

const ANIMATION_URLS = [
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_General.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_MovementBasic.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatMelee.glb",
  "/assets/kaykit/character-animations/rig-medium/Rig_Medium_CombatRanged.glb",
] as const;

const CHARACTER_SCALE = 0.27;

export function UnitModel({
  ...props
}: {
  readonly unit: BattleUnit;
  readonly selected: boolean;
  readonly attackSequence?: number;
  readonly attackTime?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
}) {
  return props.unit.role === "catapult"
    ? <CatapultUnitModel {...props} />
    : <CharacterUnitModel {...props} />;
}

function CharacterUnitModel({
  unit,
  selected,
  attackSequence,
  battleTime,
  damageTime,
  damageSourcePosition,
}: {
  readonly unit: BattleUnit;
  readonly selected: boolean;
  readonly attackSequence?: number;
  readonly attackTime?: number;
  readonly battleTime: number;
  readonly damageTime?: number;
  readonly damageSourcePosition?: WorldPoint;
}) {
  const gltf = useLoader(
    GLTFLoader,
    MODEL_URLS[unit.role as Exclude<UnitRole, "catapult">],
  );
  const animationGltfs = useLoader(GLTFLoader, [...ANIMATION_URLS]);
  const root = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const model = useMemo(
    () => prepareCharacterModel(gltf.scene, unit.faction),
    [gltf.scene, unit.faction],
  );
  const clips = useMemo(
    () => animationGltfs.flatMap((animation) => animation.animations),
    [animationGltfs],
  );
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const modelMaterials = useMemo(() => collectModelMaterials(model), [model]);
  const animationName = resolveAnimation(unit);
  const damageAge = damageTime === undefined ? Number.POSITIVE_INFINITY : battleTime - damageTime;

  useEffect(() => {
    const clip = clips.find((candidate) => candidate.name === animationName)
      ?? clips.find((candidate) => candidate.name === "Idle_A")
      ?? clips[0];
    mixer.stopAllAction();
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset();
    if (unit.status === "dead") {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.fadeIn(0.08).play();
    return () => {
      action.fadeOut(0.08);
    };
  }, [animationName, clips, mixer, unit.status]);

  useEffect(() => () => {
    mixer.stopAllAction();
  }, [mixer]);
  useFrame(({ camera }, delta) => {
    mixer.update(delta);
    const damageProgress = MathUtils.clamp(damageAge / 0.2, 0, 1);
    const recoilStrength = damageAge < 0.2 ? Math.sin(damageProgress * Math.PI) * 0.18 : 0;
    const recoilDirection = damageSourcePosition
      ? normalizedDirection(damageSourcePosition, unit.position)
      : { x: 0, z: 0 };
    const deathAge = unit.diedAt === null ? 0 : battleTime - unit.diedAt;
    const corpseOpacity = unit.diedAt === null
      ? 1
      : 1 - MathUtils.clamp((deathAge - 6) / 0.85, 0, 1);
    for (const material of modelMaterials) {
      material.emissive.set("#ffffff");
      material.emissiveIntensity = damageAge < 0.2 ? (1 - damageProgress) * 1.45 : 0;
      material.opacity = corpseOpacity;
    }
    if (root.current) {
      root.current.visible = unit.diedAt === null || deathAge < 6.85;
      root.current.position.x = MathUtils.damp(
        root.current.position.x,
        unit.position.x + recoilDirection.x * recoilStrength,
        11,
        delta,
      );
      root.current.position.y = MathUtils.damp(
        root.current.position.y,
        terrainHeightAt(unit.position) + 0.08,
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
    if (healthRoot.current) healthRoot.current.quaternion.copy(camera.quaternion);
  });

  const healthRatio = Math.max(0, unit.health / unit.maxHealth);
  const factionColor = unit.faction === "verdant" ? "#50d88e" : "#df4c4f";
  const healthWidth = 0.76 * healthRatio;
  return (
    <group
      ref={root}
      position={[unit.position.x, terrainHeightAt(unit.position) + 0.08, unit.position.z]}
      rotation={[0, unit.facing, 0]}
    >
      <primitive object={model} />
      {unit.health > 0 && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.42, 24]} />
          <meshBasicMaterial color={unit.faction === "verdant" ? "#194d34" : "#5d2024"} transparent opacity={0.72} />
        </mesh>
      )}
      {selected && unit.health > 0 && (
        <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.49, 0.61, 32]} />
          <meshBasicMaterial color="#f1cf6a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {attackSequence !== undefined && unit.health > 0 && !unit.routed && (
        <AttackPulse role={unit.role} key={attackSequence} />
      )}
      {unit.routed && unit.routedAt !== null && battleTime - unit.routedAt < 2 && (
        <RetreatMarker age={battleTime - unit.routedAt} />
      )}
      {unit.health > 0 && healthRatio < 0.55 && (
        <group ref={healthRoot} position={[0, 2.02, 0]}>
          <mesh>
            <planeGeometry args={[0.86, 0.1]} />
            <meshBasicMaterial color="#18140f" depthTest={false} />
          </mesh>
          <mesh position={[-(0.76 - healthWidth) / 2, 0, 0.006]}>
            <planeGeometry args={[healthWidth, 0.064]} />
            <meshBasicMaterial color={factionColor} depthTest={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function AttackPulse({ role }: { readonly role: UnitRole }) {
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
      <ringGeometry args={[0.42, 0.49, 24]} />
      <meshBasicMaterial
        ref={material}
        color={role === "mage" ? "#75cfff" : "#ffd178"}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function prepareCharacterModel(source: Object3D, faction: BattleUnit["faction"]): Object3D {
  const model = cloneSkeleton(source);
  const tint = new Color(faction === "verdant" ? "#65d591" : "#db5555");
  model.scale.setScalar(CHARACTER_SCALE);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => tintMaterial(material, tint));
    } else {
      object.material = tintMaterial(object.material, tint);
    }
  });
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  if (Number.isFinite(bounds.min.y)) model.position.y -= bounds.min.y;
  return model;
}

function tintMaterial(material: Material, tint: Color): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(tint, 0.34);
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

function resolveAnimation(unit: BattleUnit): string {
  if (unit.status === "dead") return "Death_A";
  if (unit.status === "routing") return "Running_A";
  if (unit.status === "moving") return unit.role === "ranger" ? "Running_A" : "Walking_A";
  if (unit.status === "attacking") {
    if (unit.role === "knight") return "Melee_1H_Attack_Chop";
    if (unit.role === "ranger") return "Ranged_2H_Shoot";
    return "Ranged_Magic_Shoot";
  }
  return "Idle_A";
}

function RetreatMarker({ age }: { readonly age: number }) {
  const root = useRef<Object3D>(null);
  const material = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (root.current) root.current.position.y = 2.28 + Math.sin(clock.elapsedTime * 8) * 0.08;
    if (material.current) material.current.opacity = Math.max(0, 0.9 * (1 - age / 2));
  });
  return (
    <group ref={root} position={[0, 2.28, 0]}>
      <mesh rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.2, 0.42, 3]} />
        <meshBasicMaterial ref={material} color="#f4b04f" transparent depthTest={false} />
      </mesh>
      <mesh position={[0, 0.28, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.14, 0.3, 3]} />
        <meshBasicMaterial color="#ffe4a0" transparent opacity={0.82} depthTest={false} />
      </mesh>
    </group>
  );
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
