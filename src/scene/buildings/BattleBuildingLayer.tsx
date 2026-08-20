import { useFrame, useLoader } from "@react-three/fiber";
import {
  Box3,
  CanvasTexture,
  Color,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Suspense, useEffect, useMemo, useRef } from "react";

import type { BattleState } from "../../game/battle";
import type { BattleBuilding } from "../../game/buildings";
import { legacyUndeadOpponentRaces } from "../../game/factions";
import type { BuildingKind } from "../../game/rules";
import type { BattleRace, FactionRaces } from "../../game/types";
import {
  axialToWorld,
  terrainHeightAtMap,
} from "../../map/battlefield";
import {
  CASTLE_BATTLE_FLAG_ASSET,
  UNDEAD_CASTLE_BATTLE_FLAG_ASSET,
  BATTLE_BUILDING_ASSET_KEYS,
  battleBuildingDetailAssets,
  sceneColorsForFaction,
  structureSceneAssetFor,
} from "../assets";
import {
  BUILDING_HEALTH_BAR_LAYERS,
  buildingPresentation,
  latestBuildingSignal,
  type BuildingHealthTone,
  type BuildingSignal,
} from "./buildingPresentation";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

export function BattleBuildingLayer({
  battle,
  factionRaces,
  undeadOpponent = false,
}: {
  readonly battle: BattleState;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
}) {
  const resolvedFactionRaces = factionRaces
    ?? (undeadOpponent ? legacyUndeadOpponentRaces(true) : battle.factionRaces)
    ?? legacyUndeadOpponentRaces(undeadOpponent);
  return (
    <group>
      {battle.buildings.map((building) => (
        <Suspense fallback={null} key={building.id}>
          <BattleBuildingVisual
            battle={battle}
            building={building}
            race={resolvedFactionRaces[building.faction]}
          />
        </Suspense>
      ))}
    </group>
  );
}

function BattleBuildingVisual({
  battle,
  building,
  race,
}: {
  readonly battle: BattleState;
  readonly building: BattleBuilding;
  readonly race: BattleRace;
}) {
  const { map } = useBattlefieldDefinition();
  const root = useRef<Object3D>(null);
  const presentation = buildingPresentation(building, battle.elapsed, race);
  const signal = latestBuildingSignal(building, battle.elapsed, battle.events);
  const hasBuildingDetails = battleBuildingDetailAssets(
    building.faction,
    building.kind,
    race,
  ).length > 0;
  const y = terrainHeightAtMap(map, building.position) + 0.03;
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
      <BuildingFoundation
        faction={building.faction}
        kind={building.kind}
        race={race}
      />
      {building.kind === "castle"
        ? <CastleBuildingModel faction={building.faction} race={race} />
        : <DeployedBuildingModel
            faction={building.faction}
            kind={building.kind}
            race={race}
          />}
      {hasBuildingDetails && (
        <BuildingDetailModels
          faction={building.faction}
          kind={building.kind}
          race={race}
        />
      )}
      <BuildingHealthBar
        ratio={presentation.healthRatio}
        tone={presentation.healthTone}
        height={building.kind === "castle"
          ? race === "undead" ? 2.55 : 4.3
          : building.kind === "arrow-tower" || building.kind === "guard-tower"
            ? 3.25
            : building.kind === "barracks"
              ? race === "undead" ? 1.72 : 2.35
              : 1.9}
      />
      {presentation.productionProgress !== null && (
        <ProductionProgress
          progress={presentation.productionProgress}
          faction={building.faction}
          race={race}
        />
      )}
      {signal && (
        <BuildingSignalEffect
          signal={signal}
          building={building}
          race={race}
        />
      )}
      {presentation.kingVisible && building.kind === "castle" && (
        <Suspense fallback={null}>
          <CastleBattleStandard
            faction={building.faction}
            race={race}
          />
        </Suspense>
      )}
      {presentation.lifecycle === "destroying" && (
        <DestructionBurst progress={presentation.destructionProgress} />
      )}
    </group>
  );
}

function BuildingFoundation({
  faction,
  kind,
  race,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly kind: BattleBuilding["kind"];
  readonly race: BattleRace;
}) {
  const colors = sceneColorsForFaction(faction, race);
  const radius = kind === "castle" ? 1.04 : 0.98;
  return (
    <group>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.06, 0.12, 6]} />
        <meshStandardMaterial color={colors.dark} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.11, 0]} receiveShadow>
        <cylinderGeometry args={[radius - 0.09, radius - 0.06, 0.07, 6]} />
        <meshStandardMaterial color="#9a9886" roughness={0.88} />
      </mesh>
    </group>
  );
}

function CastleBuildingModel({
  faction,
  race,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly race: BattleRace;
}) {
  const asset = structureSceneAssetFor(
    faction,
    BATTLE_BUILDING_ASSET_KEYS.castle,
    race,
  );
  const dedicatedUndeadAsset = asset.url.startsWith(
    "/assets/generated/tripo/runtime/undead-",
  )
    || asset.url.startsWith("/assets/kaykit/halloween/")
    || asset.url.startsWith("/assets/threejsassets/dungeon/");
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(
    () => prepareModel(
      gltf.scene,
      asset.scale,
      race === "undead" && !dedicatedUndeadAsset,
    ),
    [asset.scale, dedicatedUndeadAsset, gltf.scene, race],
  );
  return (
    <primitive
      object={model}
      rotation-y={race === "undead"
        ? faction === "verdant" ? Math.PI : 0
        : faction === "verdant" ? 0 : Math.PI}
    />
  );
}

function DeployedBuildingModel({
  faction,
  kind,
  race,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly kind: BattleBuilding["kind"];
  readonly race: BattleRace;
}) {
  const asset = structureSceneAssetFor(
    faction,
    BATTLE_BUILDING_ASSET_KEYS[kind],
    race,
  );
  const dedicatedUndeadAsset = asset.url.startsWith(
    "/assets/generated/tripo/runtime/undead-",
  )
    || asset.url.startsWith("/assets/kaykit/halloween/")
    || asset.url.startsWith("/assets/threejsassets/dungeon/");
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(
    () => prepareModel(
      gltf.scene,
      asset.scale,
      race === "undead" && !dedicatedUndeadAsset,
    ),
    [asset.scale, dedicatedUndeadAsset, gltf.scene, race],
  );
  return <primitive object={model} rotation-y={faction === "verdant" ? 0 : Math.PI} />;
}

export function DeploymentBuildingGhost({
  kind,
  race,
  valid,
}: {
  readonly kind: BuildingKind;
  readonly race: BattleRace;
  readonly valid: boolean;
}) {
  const asset = structureSceneAssetFor(
    "verdant",
    BATTLE_BUILDING_ASSET_KEYS[kind],
    race,
  );
  const dedicatedUndeadAsset = asset.url.startsWith(
    "/assets/generated/tripo/runtime/undead-",
  )
    || asset.url.startsWith("/assets/kaykit/halloween/")
    || asset.url.startsWith("/assets/threejsassets/dungeon/");
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(
    () => prepareGhostModel(
      gltf.scene,
      asset.scale,
      race === "undead" && !dedicatedUndeadAsset,
    ),
    [asset.scale, dedicatedUndeadAsset, gltf.scene, race],
  );
  useEffect(() => {
    tintGhostModel(model, valid ? "#67dc9b" : "#ff625e");
  }, [model, valid]);
  useEffect(() => () => disposeModelMaterials(model), [model]);
  return <primitive object={model} rotation-y={0} />;
}

function BuildingDetailModels({
  faction,
  kind,
  race,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly kind: BattleBuilding["kind"];
  readonly race: BattleRace;
}) {
  const details = useMemo(
    () => battleBuildingDetailAssets(faction, kind, race),
    [faction, kind, race],
  );
  const gltfs = useLoader(GLTFLoader, details.map((detail) => detail.url));
  const models = useMemo(
    () => details.map((detail, index) => prepareModel(gltfs[index]!.scene, detail.scale)),
    [details, gltfs],
  );
  return (
    <group>
      {details.map((detail, index) => (
        <primitive
          key={detail.id}
          object={models[index]}
          position={detail.position}
          rotation-y={detail.rotationY}
        />
      ))}
    </group>
  );
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
  const color = tone === "healthy" ? "#63ec85" : tone === "warning" ? "#ffd05a" : "#ff5e56";
  const { frame, track, fill } = BUILDING_HEALTH_BAR_LAYERS;
  return (
    <group ref={root} position={[0, height, 0]}>
      <mesh position={[0, 0, -0.024]} renderOrder={frame.renderOrder}>
        <planeGeometry args={[1.84, 0.28]} />
        <meshBasicMaterial color="#101410" opacity={0.94} {...frame.material} />
      </mesh>
      <mesh position={[0, 0, -0.012]} renderOrder={track.renderOrder}>
        <planeGeometry args={[1.68, 0.18]} />
        <meshBasicMaterial color="#343a31" opacity={0.96} {...track.material} />
      </mesh>
      <mesh
        position={[-0.79 + ratio * 0.79, 0, 0]}
        scale={[ratio, 1, 1]}
        renderOrder={fill.renderOrder}
      >
        <planeGeometry args={[1.58, 0.12]} />
        <meshBasicMaterial color={color} opacity={1} {...fill.material} />
      </mesh>
    </group>
  );
}

function ProductionProgress({
  progress,
  faction,
  race,
}: {
  readonly progress: number;
  readonly faction: BattleBuilding["faction"];
  readonly race: BattleRace;
}) {
  return (
    <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={80}>
      <ringGeometry args={[0.93, 1.04, 42, 1, -Math.PI / 2, progress * Math.PI * 2]} />
      <meshBasicMaterial
        color={sceneColorsForFaction(faction, race).accent}
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
  race,
}: {
  readonly signal: BuildingSignal;
  readonly building: BattleBuilding;
  readonly race: BattleRace;
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
      : sceneColorsForFaction(building.faction, race).accent;
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

function CastleBattleStandard({
  faction,
  race,
}: {
  readonly faction: BattleBuilding["faction"];
  readonly race: BattleRace;
}) {
  const { map } = useBattlefieldDefinition();
  const isUndead = race === "undead";
  const asset = isUndead ? UNDEAD_CASTLE_BATTLE_FLAG_ASSET : CASTLE_BATTLE_FLAG_ASSET;
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(() => prepareModel(gltf.scene, asset.scale), [asset.scale, gltf.scene]);
  const approach = axialToWorld(map.castleApproaches[faction]);
  const castle = axialToWorld(map.castles[faction]);
  return (
    <group position={[approach.x - castle.x, 0.08, approach.z - castle.z]}>
      <primitive object={model} />
      <group position={[0.46, 0.62, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.27, 0.86, 8]} />
          <meshStandardMaterial
            color={sceneColorsForFaction(faction, race).dark}
            roughness={0.82}
          />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshStandardMaterial color={isUndead ? "#d8dfbf" : "#d6aa7b"} roughness={0.78} />
        </mesh>
        <mesh position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.24, 0.28, 4]} />
          <meshStandardMaterial
            color={isUndead ? "#8ee56e" : "#f3c64f"}
            emissive={isUndead ? "#3c8b2d" : "#8b5f16"}
            emissiveIntensity={isUndead ? 0.75 : 0.25}
          />
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

function prepareModel(source: Object3D, scale: number, undeadTreatment = false): Object3D {
  const clone = source.clone(true);
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (Number.isFinite(bounds.min.y)) clone.position.y -= bounds.min.y;
  clone.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      if (undeadTreatment) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const treated = materials.map((material) => {
          const next = material.clone();
          if (next instanceof MeshStandardMaterial) {
            next.color.lerp(new Color("#3b294c"), 0.56);
            next.roughness = Math.max(next.roughness, 0.82);
          }
          return next;
        });
        object.material = Array.isArray(object.material) ? treated : treated[0]!;
      }
    }
  });
  return clone;
}

function prepareGhostModel(
  source: Object3D,
  scale: number,
  undeadTreatment: boolean,
): Object3D {
  const clone = source.clone(true);
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (Number.isFinite(bounds.min.y)) clone.position.y -= bounds.min.y;
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 99;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const ghostMaterials = materials.map((material) => {
      const next = material.clone();
      if (next instanceof MeshStandardMaterial && undeadTreatment) {
        next.color.lerp(new Color("#3b294c"), 0.56);
        next.roughness = Math.max(next.roughness, 0.82);
      }
      next.transparent = true;
      next.opacity = 0.42;
      next.depthWrite = false;
      if (next instanceof MeshStandardMaterial) {
        next.userData.deploymentGhostBaseColor = next.color.getHex();
      }
      return next;
    });
    object.material = Array.isArray(object.material) ? ghostMaterials : ghostMaterials[0]!;
  });
  return clone;
}

function tintGhostModel(model: Object3D, color: string): void {
  const tint = new Color(color);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      const baseColor = material.userData.deploymentGhostBaseColor;
      if (typeof baseColor === "number") material.color.setHex(baseColor);
      material.color.lerp(tint, 0.58);
      material.emissive.copy(tint);
      material.emissiveIntensity = 0.38;
      material.needsUpdate = true;
    }
  });
}

function disposeModelMaterials(model: Object3D): void {
  const disposed = new Set<object>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (disposed.has(material)) continue;
      disposed.add(material);
      material.dispose();
    }
  });
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
