import { useFrame, useLoader } from "@react-three/fiber";
import {
  Box3,
  CanvasTexture,
  MathUtils,
  Mesh,
  Object3D,
  Sprite,
  SpriteMaterial,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useEffect, useMemo, useRef } from "react";

import type { BattleState } from "../../game/battle";
import type { BattleBuilding } from "../../game/buildings";
import type { BuildingKind } from "../../game/rules";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  terrainHeightAt,
} from "../../map/battlefield";
import {
  CASTLE_BATTLE_FLAG_ASSET,
  BATTLE_BUILDING_ASSET_KEYS,
  FACTION_SCENE_COLORS,
  STRUCTURE_SCENE_ASSETS,
} from "../assets";
import {
  buildingPresentation,
  latestBuildingSignal,
  type BuildingHealthTone,
  type BuildingSignal,
} from "./buildingPresentation";

export function BattleBuildingLayer({ battle }: { readonly battle: BattleState }) {
  return (
    <group>
      {battle.buildings.map((building) => (
        <BattleBuildingVisual battle={battle} building={building} key={building.id} />
      ))}
    </group>
  );
}

function BattleBuildingVisual({
  battle,
  building,
}: {
  readonly battle: BattleState;
  readonly building: BattleBuilding;
}) {
  const root = useRef<Object3D>(null);
  const presentation = buildingPresentation(building, battle.elapsed);
  const signal = latestBuildingSignal(building, battle.elapsed, battle.events);
  const y = terrainHeightAt(building.position) + 0.03;
  useFrame(() => {
    if (!root.current) return;
    const deployProgress = signal?.kind === "deploy"
      ? MathUtils.clamp(signal.age / 0.42, 0, 1)
      : 1;
    const destroyProgress = presentation.destructionProgress;
    const entrance = 1 - (1 - deployProgress) ** 3;
    root.current.scale.setScalar((0.48 + entrance * 0.52) * (1 - destroyProgress * 0.28));
    root.current.rotation.y = destroyProgress * 0.18;
  });
  return (
    <group ref={root} position={[building.position.x, y, building.position.z]}>
      {building.kind === "castle"
        ? <CastleBuildingModel faction={building.faction} />
        : <DeployedBuildingModel faction={building.faction} kind={building.kind} />}
      <BuildingHealthBar
        ratio={presentation.healthRatio}
        tone={presentation.healthTone}
        height={building.kind === "castle" ? 4.3 : building.kind === "barracks" ? 2.35 : 1.9}
      />
      {presentation.productionProgress !== null && (
        <ProductionProgress
          progress={presentation.productionProgress}
          faction={building.faction}
        />
      )}
      {signal && <BuildingSignalEffect signal={signal} building={building} />}
      {presentation.kingVisible && building.kind === "castle" && (
        <CastleBattleStandard faction={building.faction} />
      )}
      {presentation.lifecycle === "destroying" && (
        <DestructionBurst progress={presentation.destructionProgress} />
      )}
    </group>
  );
}

function CastleBuildingModel({ faction }: { readonly faction: BattleBuilding["faction"] }) {
  const asset = STRUCTURE_SCENE_ASSETS[faction][BATTLE_BUILDING_ASSET_KEYS.castle];
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(() => prepareModel(gltf.scene, asset.scale), [asset.scale, gltf.scene]);
  return <primitive object={model} rotation-y={faction === "verdant" ? 0 : Math.PI} />;
}

function DeployedBuildingModel({
  faction,
  kind,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly kind: BuildingKind;
}) {
  const asset = STRUCTURE_SCENE_ASSETS[faction][BATTLE_BUILDING_ASSET_KEYS[kind]];
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(() => prepareModel(gltf.scene, asset.scale), [asset.scale, gltf.scene]);
  return <primitive object={model} rotation-y={faction === "verdant" ? 0 : Math.PI} />;
}

function BuildingHealthBar({
  ratio,
  tone,
  height,
}: {
  readonly ratio: number;
  readonly tone: BuildingHealthTone;
  readonly height: number;
}) {
  const root = useRef<Object3D>(null);
  useFrame(({ camera }) => {
    root.current?.quaternion.copy(camera.quaternion);
  });
  const color = tone === "healthy" ? "#69d884" : tone === "warning" ? "#f2bd56" : "#ef5d52";
  return (
    <group ref={root} position={[0, height, 0]}>
      <mesh position={[0, 0, -0.012]} renderOrder={120}>
        <planeGeometry args={[1.72, 0.22]} />
        <meshBasicMaterial color="#171a17" transparent opacity={0.84} depthTest={false} />
      </mesh>
      <mesh position={[-0.82 + ratio * 0.82, 0, 0]} scale={[ratio, 1, 1]} renderOrder={121}>
        <planeGeometry args={[1.58, 0.12]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

function ProductionProgress({
  progress,
  faction,
}: {
  readonly progress: number;
  readonly faction: BattleBuilding["faction"];
}) {
  return (
    <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={80}>
      <ringGeometry args={[0.93, 1.04, 42, 1, -Math.PI / 2, progress * Math.PI * 2]} />
      <meshBasicMaterial
        color={FACTION_SCENE_COLORS[faction].accent}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </mesh>
  );
}

function BuildingSignalEffect({
  signal,
  building,
}: {
  readonly signal: BuildingSignal;
  readonly building: BattleBuilding;
}) {
  if (signal.kind === "destroy") return null;
  const label = signal.kind === "gold"
    ? `+${signal.creditedAmount}`
    : signal.kind === "gold-wasted"
      ? "MAX"
      : signal.kind === "spawn"
        ? "⚔"
        : signal.kind === "castle-active" ? "KING" : "DEPLOY";
  const color = signal.kind === "gold"
    ? "#ffd45e"
    : signal.kind === "gold-wasted"
      ? "#d3a16f"
      : FACTION_SCENE_COLORS[building.faction].accent;
  return <RisingLabel age={signal.age} color={color} label={label} />;
}

function RisingLabel({ age, color, label }: {
  readonly age: number;
  readonly color: string;
  readonly label: string;
}) {
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const texture = useMemo(() => labelTexture(label, color), [color, label]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const progress = MathUtils.clamp(age / 1.2, 0, 1);
    if (sprite.current) {
      sprite.current.position.y = 2.2 + progress * 0.8;
      sprite.current.scale.set(1.35 + progress * 0.18, 0.68, 1);
    }
    if (material.current) material.current.opacity = 1 - progress;
  });
  return (
    <sprite ref={sprite} position={[0, 2.2, 0]} scale={[1.35, 0.68, 1]}>
      <spriteMaterial ref={material} map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function CastleBattleStandard({ faction }: { readonly faction: BattleBuilding["faction"] }) {
  const asset = CASTLE_BATTLE_FLAG_ASSET;
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(() => prepareModel(gltf.scene, asset.scale), [asset.scale, gltf.scene]);
  const approach = axialToWorld(BATTLEFIELD_MAP.castleApproaches[faction]);
  const castle = axialToWorld(BATTLEFIELD_MAP.castles[faction]);
  return (
    <group position={[approach.x - castle.x, 0.08, approach.z - castle.z]}>
      <primitive object={model} />
      <group position={[0.46, 0.62, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.27, 0.86, 8]} />
          <meshStandardMaterial color={FACTION_SCENE_COLORS[faction].dark} roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color="#d6aa7b" roughness={0.78} />
        </mesh>
        <mesh position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.24, 0.28, 4]} />
          <meshStandardMaterial color="#f3c64f" emissive="#8b5f16" emissiveIntensity={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function DestructionBurst({ progress }: { readonly progress: number }) {
  return (
    <group>
      <mesh position={[0, 0.82, 0]} scale={0.45 + progress * 1.5}>
        <sphereGeometry args={[0.72, 12, 8]} />
        <meshBasicMaterial
          color="#ef8a45"
          transparent
          opacity={(1 - progress) * 0.5}
          depthWrite={false}
        />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI / 3;
        const distance = 0.25 + progress * 1.2;
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * distance, 0.45 + progress * 0.8, Math.sin(angle) * distance]}
            rotation={[progress * 4, angle, progress * 3]}
            scale={1 - progress * 0.65}
          >
            <boxGeometry args={[0.22, 0.18, 0.28]} />
            <meshStandardMaterial color={index % 2 ? "#5f5545" : "#b46a3c"} roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

function prepareModel(source: Object3D, scale: number): Object3D {
  const clone = source.clone(true);
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (Number.isFinite(bounds.min.y)) clone.position.y -= bounds.min.y;
  clone.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return clone;
}

function labelTexture(label: string, color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (context) {
    context.font = "800 34px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(27, 22, 16, 0.86)";
    context.strokeText(label, 80, 40);
    context.fillStyle = color;
    context.fillText(label, 80, 40);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
