import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  InstancedMesh,
  MathUtils,
  Object3D,
  OrthographicCamera,
  Plane,
  Raycaster,
  Sprite,
  Vector2,
  Vector3,
} from "three";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import {
  createBattleUnit,
  type BattleState,
  type WorldPoint,
} from "../game/battle";
import type { SandboxBuildingConstructionPreview } from "../game/sandboxBattleTransactions";
import {
  sandboxBuildingSpec,
  type SandboxBuildingSlot,
} from "../game/sandboxCatalog";
import { createSandboxProductionExitFan } from "../game/sandboxProductionExit";
import type { SandboxSquadOrderKind } from "../game/sandboxOrders";
import { hasRace, legacyUndeadOpponentRaces } from "../game/factions";
import type { FactionRaces } from "../game/types";
import type { DeploymentPreview } from "../game/deployTransaction";
import { validDeploymentCoordinates } from "../game/deployTransaction";
import {
  isBuildingDeployable,
  unitRoleForRace,
  type BuildingKind,
  type DeployableKind,
  type TroopKind,
} from "../game/rules";
import {
  axialToWorld,
  BATTLEFIELD_HEX_CIRCUMRADIUS,
  terrainHeightAtMap,
} from "../map/battlefield";
import { battlefieldDefinitionFor } from "../map/battlefieldDefinition";
import {
  BattleCamera,
  type CameraShakeImpulse,
} from "./camera/BattleCamera";
import type { CameraViewStore } from "./camera/cameraViewStore";
import { BattleEffects } from "./effects/BattleEffects";
import { UnitStatusEffectLayer } from "./effects/UnitStatusEffectLayer";
import {
  BattleBuildingLayer,
  DeploymentBuildingGhost,
} from "./buildings/BattleBuildingLayer";
import {
  DeploymentAreaMask,
  VALID_DEPLOYMENT_COLOR,
} from "./DeploymentAreaMask";
import { BattlefieldTerrain } from "./terrain/BattlefieldTerrain";
import { SandboxGrayboxOverlay } from "./terrain/SandboxGrayboxOverlay";
import { createSandboxGrayboxPresentation } from "./terrain/sandboxGrayboxPresentation";
import { UnitModel } from "./units/UnitModel";
import { deploymentPreviewRingGeometry } from "./units/unitRingPresentation";
import { FrameBenchmark, type BenchmarkSnapshot } from "../game/benchmark";
import {
  SceneAssetErrorBoundary,
  SceneAssetPreloader,
} from "./SceneAssetPreloader";
import type { SceneAssetLoadProgress } from "./loadingProgress";
import type { SceneInteractionBridge } from "./sceneInteractionBridge";
import { BattlefieldSceneProvider, useBattlefieldDefinition } from "./battlefieldSceneContext";
import { createBattlefieldScenePresentation } from "./battlefieldScenePresentation";

export { createSceneInteractionBridge } from "./sceneInteractionBridge";
export type { SceneInteractionBridge } from "./sceneInteractionBridge";

interface BattlefieldCanvasProps {
  readonly battle: BattleState;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
  readonly deploymentKind?: DeployableKind | null;
  readonly deploymentPreview: (DeploymentPreview & { readonly kind: DeployableKind }) | null;
  readonly sandboxConstructionPreview?: SandboxBuildingConstructionPreview | null;
  readonly selectedSquadIds?: readonly string[];
  readonly sandboxCommandMarker?: {
    readonly sequence: number;
    readonly kind: SandboxSquadOrderKind;
    readonly position: WorldPoint;
  } | null;
  readonly cameraResetToken: number;
  readonly cameraViewStore: CameraViewStore;
  readonly onAssetProgress?: (progress: SceneAssetLoadProgress) => void;
  readonly onAssetsReady?: () => void;
  readonly onAssetError?: (message: string) => void;
  readonly onBenchmarkUpdate?: (snapshot: BenchmarkSnapshot) => void;
}

interface AttackPresentation {
  readonly sequence: number;
  readonly time: number;
}

const ATTACK_PRESENTATION_SECONDS = 3.6;

export function BattlefieldCanvas({
  battle,
  factionRaces,
  undeadOpponent = false,
  bridgeRef,
  deploymentKind = null,
  deploymentPreview,
  sandboxConstructionPreview = null,
  selectedSquadIds = [],
  sandboxCommandMarker = null,
  cameraResetToken,
  cameraViewStore,
  onAssetProgress,
  onAssetsReady,
  onAssetError,
  onBenchmarkUpdate,
}: BattlefieldCanvasProps) {
  const battlefield = battlefieldDefinitionFor(battle.mapId);
  const sandboxGrayboxPlan = useMemo(
    () => createSandboxGrayboxPresentation(battlefield),
    [battlefield],
  );
  const scenePresentation = useMemo(
    () => createBattlefieldScenePresentation(battlefield),
    [battlefield],
  );
  const resolvedFactionRaces = factionRaces
    ?? (undeadOpponent ? legacyUndeadOpponentRaces(true) : battle.factionRaces)
    ?? legacyUndeadOpponentRaces(undeadOpponent);
  const hasUndeadTerritory = hasRace(resolvedFactionRaces, "undead");
  const initialZoom = hasUndeadTerritory
    ? battlefield.cameraPreset.startZoom - 1
    : battlefield.cameraPreset.startZoom;
  const attackPresentations = useAttackPresentationCache(battle);
  const selectedSquads = useMemo(() => new Set(selectedSquadIds), [selectedSquadIds]);
  const deploymentMaskCoordinates = useMemo(() => (
    deploymentKind
      ? validDeploymentCoordinates(
          { phase: "engaged", battle },
          "verdant",
          deploymentKind,
        )
      : []
  ), [battle, deploymentKind]);
  return (
    <Canvas
      orthographic
      shadows="basic"
      dpr={onBenchmarkUpdate ? 1 : [1, 1.5]}
      camera={{
        position: battlefield.cameraPreset.initialPosition,
        zoom: battlefield.cameraPreset.defaultZoom,
        near: battlefield.cameraPreset.near,
        far: battlefield.cameraPreset.far,
      }}
      gl={{ antialias: true, alpha: false }}
      resize={{ offsetSize: true }}
      style={{
        width: "100%",
        height: "100%",
        background: hasUndeadTerritory ? "#777381" : "#aeb9ad",
      }}
    >
      <BattlefieldSceneProvider definition={battlefield}>
      {onAssetProgress && onAssetsReady && onAssetError && (
        <SceneAssetErrorBoundary onError={onAssetError}>
          <SceneAssetPreloader
            onProgress={onAssetProgress}
            onReady={onAssetsReady}
          />
        </SceneAssetErrorBoundary>
      )}
      <color attach="background" args={[hasUndeadTerritory ? "#777381" : "#aeb9ad"]} />
      <fog attach="fog" args={[
        hasUndeadTerritory ? "#777381" : "#aeb9ad",
        scenePresentation.fog.near,
        scenePresentation.fog.far,
      ]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={[
        hasUndeadTerritory ? "#d8d2e8" : "#dbe8e2",
        hasUndeadTerritory ? "#35243e" : "#51442f",
        1.8,
      ]} />
      <directionalLight
        castShadow
        position={scenePresentation.directionalLightPosition}
        intensity={2.35}
        color={hasUndeadTerritory ? "#e6dcff" : "#fff0c7"}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-scenePresentation.shadowCameraExtent}
        shadow-camera-right={scenePresentation.shadowCameraExtent}
        shadow-camera-top={scenePresentation.shadowCameraExtent}
        shadow-camera-bottom={-scenePresentation.shadowCameraExtent}
      />
      <BattleCamera
        resetToken={cameraResetToken}
        shake={latestShakeImpulse(battle)}
        initialTargetZ={resolvedFactionRaces.crimson === "undead"
          ? battlefield.cameraPreset.initialTarget.z - 2.4
          : battlefield.cameraPreset.initialTarget.z}
        initialZoom={initialZoom}
        onViewChange={cameraViewStore.publish}
        bridgeRef={bridgeRef}
      />
      <SceneBridge battle={battle} bridgeRef={bridgeRef} />
      {onBenchmarkUpdate && <BenchmarkProbe onUpdate={onBenchmarkUpdate} />}
      <Suspense fallback={<ArenaFallback presentation={scenePresentation} />}>
        <BattlefieldTerrain factionRaces={resolvedFactionRaces} />
        {sandboxGrayboxPlan && (
          <SandboxGrayboxOverlay
            mining={battle.mining}
            plan={sandboxGrayboxPlan}
            markersOnly
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        <BattleBuildingLayer battle={battle} factionRaces={resolvedFactionRaces} />
      </Suspense>
      <DeploymentAreaMask coordinates={deploymentMaskCoordinates} />
      <UnitShadowInstances battle={battle} />
      {battle.units.map((unit) => {
        const damage = latestDamagePresentation(battle, unit.id);
        const attack = attackPresentations.get(unit.id);
        return (
          <Suspense fallback={null} key={unit.id}>
            <UnitModel
              unit={unit}
              selected={unit.faction === "verdant" && selectedSquads.has(unit.squadId)}
              attackSequence={attack?.sequence}
              attackTime={attack?.time}
              battleTime={battle.elapsed}
              damageTime={damage?.time}
              damageSourcePosition={damage?.sourcePosition}
              race={resolvedFactionRaces[unit.faction]}
            />
          </Suspense>
        );
      })}
      <Suspense fallback={null}>
        <UnitStatusEffectLayer units={battle.units} elapsed={battle.elapsed} />
      </Suspense>
      <Suspense fallback={null}>
        <BattleEffects battle={battle} />
      </Suspense>
      {deploymentPreview && (
        <DeploymentPreviewVisual
          preview={deploymentPreview}
          race={resolvedFactionRaces.verdant}
        />
      )}
      {sandboxConstructionPreview && (
        <SandboxConstructionPreviewVisual
          preview={sandboxConstructionPreview}
          race={resolvedFactionRaces.verdant}
        />
      )}
      {sandboxCommandMarker && (
        <SandboxCommandMarkerVisual marker={sandboxCommandMarker} />
      )}
      </BattlefieldSceneProvider>
    </Canvas>
  );
}

function SandboxCommandMarkerVisual({
  marker,
}: {
  readonly marker: NonNullable<BattlefieldCanvasProps["sandboxCommandMarker"]>;
}) {
  const { map } = useBattlefieldDefinition();
  const root = useRef<Object3D>(null);
  const color = marker.kind === "attack"
    ? "#ff625e"
    : marker.kind === "attack-move" ? "#f0c65f" : "#68dbe8";
  const y = terrainHeightAtMap(map, marker.position) + 0.09;
  useFrame(({ clock }) => {
    if (!root.current) return;
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 11) * 0.12;
    root.current.scale.setScalar(pulse);
    root.current.rotation.y += 0.025;
  });
  return (
    <group
      ref={root}
      name="sandbox-command-marker"
      position={[marker.position.x, y, marker.position.z]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={120}>
        <ringGeometry args={[0.55, 0.72, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.96}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.025, 0]} renderOrder={119}>
        <cylinderGeometry args={[0.18, 0.32, 0.08, 4]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.82}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SandboxConstructionPreviewVisual({
  preview,
  race,
}: {
  readonly preview: SandboxBuildingConstructionPreview;
  readonly race: FactionRaces["verdant"];
}) {
  const battlefield = useBattlefieldDefinition();
  const { map } = battlefield;
  const roadReserve = battlefield.roadReserve ?? [];
  const exitFan = useMemo(() => {
    if (
      !preview.coordinate
      || !preview.slot
      || !isSandboxProductionBuilding(preview.slot)
    ) return null;
    const result = createSandboxProductionExitFan(
      map,
      roadReserve,
      preview.coordinate,
    );
    return result.ok ? result.fan : null;
  }, [map, preview.coordinate, preview.slot, roadReserve]);

  if (!preview.slot) return null;
  const anchor = preview.position ?? preview.requestedPosition;
  const kind = sandboxBuildingSpec(preview.slot).kind;
  const color = preview.valid ? VALID_DEPLOYMENT_COLOR : "#ef625e";
  const y = terrainHeightAtMap(map, anchor) + 0.075;
  return (
    <>
      <group
        name="sandbox-construction-preview"
        position={[anchor.x, y, anchor.z]}
      >
        <mesh position={[0, 0.015, 0]} renderOrder={98}>
          <cylinderGeometry args={[
            BATTLEFIELD_HEX_CIRCUMRADIUS * 0.8,
            BATTLEFIELD_HEX_CIRCUMRADIUS * 0.8,
            0.045,
            6,
          ]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={preview.valid ? 0.32 : 0.2}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={100}>
          <ringGeometry args={[0.83, 0.93, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <Suspense fallback={null}>
          <DeploymentBuildingGhost
            kind={kind}
            race={race}
            valid={preview.valid}
          />
        </Suspense>
        {!preview.valid && <InvalidDeploymentMarker building />}
      </group>
      {exitFan?.candidates.map((coordinate, index) => {
        const position = axialToWorld(coordinate);
        const markerY = terrainHeightAtMap(map, position) + 0.095;
        const markerColor = preview.valid
          ? index === 0 ? "#f4cf67" : "#68dbe8"
          : "#ef625e";
        return (
          <group
            key={`${coordinate.q},${coordinate.r}`}
            name={index === 0
              ? "sandbox-production-exit-door"
              : "sandbox-production-exit-reserve"}
            position={[position.x, markerY, position.z]}
          >
            <mesh renderOrder={105}>
              <cylinderGeometry args={[0.42, 0.42, 0.05, 6]} />
              <meshBasicMaterial
                color={markerColor}
                transparent
                opacity={0.72}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={106}>
              <ringGeometry args={[0.36, 0.46, 6]} />
              <meshBasicMaterial
                color={markerColor}
                transparent
                opacity={1}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function isSandboxProductionBuilding(
  slot: SandboxBuildingSlot,
): boolean {
  return slot === "barracks"
    || slot === "archery-range"
    || slot === "mage-tower"
    || slot === "siege-workshop";
}

function DeploymentPreviewVisual({
  preview,
  race,
}: {
  readonly preview: DeploymentPreview & { readonly kind: DeployableKind };
  readonly race: FactionRaces["verdant"];
}) {
  const { map } = useBattlefieldDefinition();
  const anchor = preview.position ?? preview.requestedPosition;
  const building = isBuildingDeployable(preview.kind);
  const placementRing = deploymentPreviewRingGeometry(preview.kind);
  const color = preview.valid ? VALID_DEPLOYMENT_COLOR : "#ef625e";
  const y = terrainHeightAtMap(map, anchor) + 0.075;
  const troopPositions = preview.valid && preview.unitPositions.length > 0
    ? preview.unitPositions
    : [anchor];
  const previewUnits = useMemo(() => (
    building
      ? []
      : troopPositions.map((position, index) => createBattleUnit({
          id: `deployment-ghost-${preview.kind}-${index}`,
          faction: "verdant",
          role: unitRoleForRace(preview.kind as TroopKind, race),
          combatProfile: race,
          position,
        }))
  ), [building, preview.kind, race, troopPositions]);
  return (
    <>
      <group position={[anchor.x, y, anchor.z]}>
        <mesh position={[0, 0.015, 0]} renderOrder={98}>
          <cylinderGeometry args={[0.92, 0.92, 0.045, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={preview.valid ? 0.3 : 0.2}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={100}>
          <ringGeometry args={[
            placementRing.innerRadius,
            placementRing.outerRadius,
            placementRing.segments,
          ]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.95}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        {building && (
          <Suspense fallback={null}>
            <DeploymentBuildingGhost
              kind={preview.kind as BuildingKind}
              race={race}
              valid={preview.valid}
            />
          </Suspense>
        )}
        {!preview.valid && <InvalidDeploymentMarker building={building} />}
      </group>
      {!building && previewUnits.map((unit) => (
        <Suspense fallback={null} key={unit.id}>
          <UnitModel
            unit={unit}
            selected={false}
            battleTime={0}
            race={race}
            ghostValid={preview.valid}
          />
        </Suspense>
      ))}
    </>
  );
}

function InvalidDeploymentMarker({ building }: { readonly building: boolean }) {
  const marker = useRef<Sprite>(null);
  const texture = useMemo(createInvalidDeploymentTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera }) => {
    if (!marker.current) return;
    const zoom = camera instanceof OrthographicCamera ? camera.zoom : 1;
    const scale = MathUtils.clamp(34 / Math.max(zoom, 0.01), 0.9, 2.4);
    marker.current.scale.setScalar(scale);
  });
  return (
    <sprite
      ref={marker}
      position={[0, building ? 1.75 : 1.05, 0]}
      scale={[1, 1, 1]}
      renderOrder={140}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

function createInvalidDeploymentTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = "rgba(22, 12, 12, 0.78)";
    context.beginPath();
    context.arc(64, 64, 48, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#ff5b57";
    context.lineWidth = 12;
    context.lineCap = "round";
    context.beginPath();
    context.arc(64, 64, 43, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(34, 34);
    context.lineTo(94, 94);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function UnitShadowInstances({ battle }: { readonly battle: BattleState }) {
  const { map } = useBattlefieldDefinition();
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  useFrame(() => {
    if (!mesh.current) return;
    battle.units.forEach((unit, index) => {
      const visible = unit.health > 0 || (
        unit.diedAt !== null && battle.elapsed - unit.diedAt < 6.85
      );
      dummy.position.set(
        unit.position.x + 0.12,
        terrainHeightAtMap(map, unit.position) + 0.018,
        unit.position.z + 0.14,
      );
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      const shadowScale = unit.role === "bone-dragon"
        ? 1.05
        : unit.role === "catapult" ? 0.78 : 0.42;
      dummy.scale.setScalar(visible ? shadowScale : 0);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, battle.units.length]} frustumCulled={false}>
      <circleGeometry args={[1, 16]} />
      <meshBasicMaterial color="#171b17" transparent opacity={0.24} depthWrite={false} />
    </instancedMesh>
  );
}

function BenchmarkProbe({ onUpdate }: {
  readonly onUpdate: (snapshot: BenchmarkSnapshot) => void;
}) {
  const benchmark = useMemo(() => new FrameBenchmark(10), []);
  const updateElapsed = useRef(0);
  const warmupElapsed = useRef(0);
  const reportedComplete = useRef(false);
  useFrame(({ gl }, delta) => {
    if (warmupElapsed.current < 2) {
      warmupElapsed.current += delta;
      return;
    }
    benchmark.addFrame(delta * 1000, {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    updateElapsed.current += delta;
    if (benchmark.complete && !reportedComplete.current) {
      reportedComplete.current = true;
      onUpdate(benchmark.snapshot());
    } else if (!benchmark.complete && updateElapsed.current >= 0.5) {
      updateElapsed.current = 0;
      onUpdate(benchmark.snapshot());
    }
  });
  return null;
}

function SceneBridge({
  battle,
  bridgeRef,
}: {
  readonly battle: BattleState;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
}) {
  const { map } = useBattlefieldDefinition();
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const projected = useMemo(() => new Vector3(), []);

  useFrame(() => {
    bridgeRef.current.screenToWorld = (x, y) => {
      ndc.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      const point = raycaster.ray.intersectPlane(ground, hit);
      return point ? { x: point.x, z: point.z } : null;
    };
    const project = (point: WorldPoint, height: number) => {
      projected.set(
        point.x,
        terrainHeightAtMap(map, point) + height,
        point.z,
      ).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x + 1) * size.width / 2,
        y: (1 - projected.y) * size.height / 2,
      };
    };
    bridgeRef.current.pickBattlefieldEntity = (x, y) => {
      let best: {
        readonly distance: number;
        readonly priority: number;
        readonly pick: ReturnType<SceneInteractionBridge["pickBattlefieldEntity"]>;
      } | null = null;
      for (const unit of battle.units) {
        if (unit.health <= 0 || unit.status === "dead") continue;
        const screen = project(unit.position, unit.role === "bone-dragon" ? 1.3 : 0.55);
        if (!screen) continue;
        const pointerDistance = Math.hypot(screen.x - x, screen.y - y);
        if (pointerDistance > 26) continue;
        if (
          !best
          || pointerDistance < best.distance
          || (pointerDistance === best.distance && best.priority > 0)
        ) {
          best = {
            distance: pointerDistance,
            priority: 0,
            pick: {
              targetType: "unit",
              id: unit.id,
              squadId: unit.squadId,
              faction: unit.faction,
              position: { ...unit.position },
            },
          };
        }
      }
      for (const building of battle.buildings) {
        if (building.health <= 0 || building.status !== "active") continue;
        const screen = project(building.position, building.kind === "castle" ? 2.1 : 1.1);
        if (!screen) continue;
        const pointerDistance = Math.hypot(screen.x - x, screen.y - y);
        if (pointerDistance > (building.kind === "castle" ? 38 : 30)) continue;
        if (!best || pointerDistance < best.distance) {
          best = {
            distance: pointerDistance,
            priority: 1,
            pick: {
              targetType: "building",
              id: building.id,
              faction: building.faction,
              position: { ...building.position },
            },
          };
        }
      }
      return best?.pick ?? null;
    };
    bridgeRef.current.squadIdsInScreenRect = (rect, faction) => {
      const squadIds = new Set<string>();
      for (const unit of battle.units) {
        if (
          unit.faction !== faction
          || unit.health <= 0
          || unit.status === "dead"
        ) continue;
        const screen = project(unit.position, 0.45);
        if (
          screen
          && screen.x >= rect.left
          && screen.x <= rect.right
          && screen.y >= rect.top
          && screen.y <= rect.bottom
        ) squadIds.add(unit.squadId);
      }
      return [...squadIds].sort();
    };
  });
  return null;
}

function ArenaFallback({
  presentation,
}: {
  readonly presentation: ReturnType<typeof createBattlefieldScenePresentation>;
}) {
  return (
    <mesh
      receiveShadow
      position={[presentation.center.x, 0, presentation.center.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[presentation.fallbackRadius, 54]} />
      <meshStandardMaterial color="#748462" roughness={1} />
    </mesh>
  );
}

function useAttackPresentationCache(battle: BattleState): ReadonlyMap<string, AttackPresentation> {
  const cache = useRef(new Map<string, AttackPresentation>());
  const previousElapsed = useRef(battle.elapsed);
  const previousSequence = useRef(battle.nextEventSequence);
  if (battle.elapsed < previousElapsed.current || battle.nextEventSequence < previousSequence.current) {
    cache.current.clear();
  }
  for (const event of battle.events) {
    if (event.type === "attack-started") {
      cache.current.set(event.attackerId, { sequence: event.sequence, time: event.time });
    }
  }
  for (const [unitId, presentation] of cache.current) {
    if (battle.elapsed - presentation.time > ATTACK_PRESENTATION_SECONDS) {
      cache.current.delete(unitId);
    }
  }
  previousElapsed.current = battle.elapsed;
  previousSequence.current = battle.nextEventSequence;
  return cache.current;
}

function latestDamagePresentation(battle: BattleState, unitId: string) {
  for (let index = battle.events.length - 1; index >= 0; index -= 1) {
    const event = battle.events[index]!;
    if (
      event.type !== "damage-applied"
      || event.targetType !== "unit"
      || event.targetId !== unitId
    ) continue;
    return {
      time: event.time,
      sourcePosition: event.sourcePosition,
    };
  }
  return undefined;
}

function latestShakeImpulse(battle: BattleState): CameraShakeImpulse | null {
  for (let index = battle.events.length - 1; index >= 0; index -= 1) {
    const event = battle.events[index]!;
    if (
      event.type === "projectile-hit"
      && (event.role === "catapult" || event.role === "bone-dragon")
    ) {
      return {
        sequence: event.sequence,
        intensity: event.role === "bone-dragon" ? 0.48 : 0.74,
      };
    }
  }
  return null;
}
