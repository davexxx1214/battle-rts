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
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useEffect, useMemo, useRef } from "react";

import type { BattleUnit, UnitRole, WorldPoint } from "../../game/battle";
import { terrainHeightAt } from "../../map/battlefield";
import { FACTION_SCENE_COLORS, UNIT_BASE_RING_GEOMETRY } from "../assets";
import { CatapultUnitModel } from "./CatapultUnitModel";
import {
  CHARACTER_ANIMATION_URLS,
  CHARACTER_EQUIPMENT_URLS,
  CHARACTER_SCENE_ASSETS,
  characterAnimationForState,
  characterTintStrength,
  type CharacterRole,
} from "./characterPresentation";

const CHARACTER_SCALE = 0.27;
const FAR_ANIMATION_STEP_SECONDS = 1 / 15;

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
    CHARACTER_SCENE_ASSETS[unit.role as CharacterRole].modelUrl,
  );
  const animationGltfs = useLoader(GLTFLoader, [...CHARACTER_ANIMATION_URLS]);
  const equipmentGltfs = useLoader(GLTFLoader, [...CHARACTER_EQUIPMENT_URLS]);
  const root = useRef<Object3D>(null);
  const healthRoot = useRef<Object3D>(null);
  const activeAction = useRef<AnimationAction | null>(null);
  const equipmentSources = useMemo(
    () => new Map(CHARACTER_EQUIPMENT_URLS.map((url, index) => [
      url,
      equipmentGltfs[index]!.scene,
    ])),
    [equipmentGltfs],
  );
  const model = useMemo(
    () => prepareCharacterModel(
      gltf.scene,
      unit.faction,
      unit.role as CharacterRole,
      equipmentSources,
    ),
    [equipmentSources, gltf.scene, unit.faction, unit.role],
  );
  const clips = useMemo(
    () => animationGltfs.flatMap((animation) => animation.animations),
    [animationGltfs],
  );
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const modelMaterials = useMemo(() => collectModelMaterials(model), [model]);
  const animationAccumulator = useRef(0);
  const damageAge = damageTime === undefined ? Number.POSITIVE_INFINITY : battleTime - damageTime;
  const animationName = characterAnimationForState({
    id: unit.id,
    role: unit.role as CharacterRole,
    status: unit.status,
    attackSequence,
    damaged: damageAge < 0.2,
  });

  useEffect(() => {
    const clip = clips.find((candidate) => candidate.name === animationName)
      ?? clips.find((candidate) => candidate.name === "Idle_A")
      ?? clips[0];
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
  }, [animationName, attackSequence, clips, damageTime, mixer, unit.status]);

  useEffect(() => () => {
    activeAction.current = null;
    mixer.stopAllAction();
  }, [mixer]);
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
  const factionColors = FACTION_SCENE_COLORS[unit.faction];
  const baseRing = UNIT_BASE_RING_GEOMETRY.character;
  const healthWidth = 0.76 * healthRatio;
  return (
    <group
      ref={root}
      position={[unit.position.x, terrainHeightAt(unit.position) + 0.08, unit.position.z]}
      rotation={[0, unit.facing, 0]}
    >
      <primitive object={model} />
      {unit.health > 0 && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[baseRing.innerRadius, baseRing.outerRadius, baseRing.segments]}
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
          <ringGeometry args={[0.49, 0.61, 32]} />
          <meshBasicMaterial color="#f1cf6a" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {attackSequence !== undefined && unit.health > 0 && (
        <AttackPulse role={unit.role} key={attackSequence} />
      )}
      {unit.health > 0 && healthRatio < 0.55 && (
        <group ref={healthRoot} position={[0, 2.02, 0]}>
          <mesh>
            <planeGeometry args={[0.86, 0.1]} />
            <meshBasicMaterial color="#18140f" depthTest={false} />
          </mesh>
          <mesh position={[-(0.76 - healthWidth) / 2, 0, 0.006]}>
            <planeGeometry args={[healthWidth, 0.064]} />
            <meshBasicMaterial color={factionColors.accent} depthTest={false} />
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

function prepareCharacterModel(
  source: Object3D,
  faction: BattleUnit["faction"],
  role: CharacterRole,
  equipmentSources: ReadonlyMap<string, Object3D>,
): Object3D {
  const model = cloneSkeleton(source);
  const tint = new Color(FACTION_SCENE_COLORS[faction].tint);
  model.scale.setScalar(CHARACTER_SCALE);
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  if (Number.isFinite(bounds.min.y)) model.position.y -= bounds.min.y;
  attachCharacterEquipment(model, role, equipmentSources);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const tintStrength = characterTintStrength(object.name);
    if (Array.isArray(object.material)) {
      object.material = object.material.map(
        (material) => tintMaterial(material, tint, tintStrength),
      );
    } else {
      object.material = tintMaterial(object.material, tint, tintStrength);
    }
  });
  return model;
}

function attachCharacterEquipment(
  model: Object3D,
  role: CharacterRole,
  equipmentSources: ReadonlyMap<string, Object3D>,
): void {
  for (const equipment of CHARACTER_SCENE_ASSETS[role].equipment) {
    const slot = model.getObjectByName(equipment.slot);
    const source = equipmentSources.get(equipment.url);
    if (!slot || !source) continue;
    const instance = source.clone(true);
    instance.name = `equipment:${equipment.url.split("/").at(-1) ?? role}`;
    slot.add(instance);
  }
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

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const deltaAngle = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + deltaAngle * (1 - Math.exp(-lambda * delta));
}
