import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MathUtils,
  InstancedMesh,
  Object3D,
  OrthographicCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { Suspense, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import type {
  BattleState,
} from "../game/battle";
import { hasRace, legacyUndeadOpponentRaces } from "../game/factions";
import type { FactionRaces } from "../game/types";
import type { DeploymentPreview } from "../game/deployTransaction";
import { validDeploymentCoordinates } from "../game/deployTransaction";
import { isBuildingDeployable, type DeployableKind } from "../game/rules";
import { terrainHeightAt } from "../map/battlefield";
import {
  BattleCamera,
  type CameraShakeImpulse,
} from "./camera/BattleCamera";
import type { CameraViewStore } from "./camera/cameraViewStore";
import { BattleEffects } from "./effects/BattleEffects";
import { BattleBuildingLayer } from "./buildings/BattleBuildingLayer";
import {
  DeploymentAreaMask,
  VALID_DEPLOYMENT_COLOR,
} from "./DeploymentAreaMask";
import { BattlefieldTerrain } from "./terrain/BattlefieldTerrain";
import { UnitModel } from "./units/UnitModel";
import { deploymentPreviewRingGeometry } from "./units/unitRingPresentation";
import { FrameBenchmark, type BenchmarkSnapshot } from "../game/benchmark";
import {
  SceneAssetErrorBoundary,
  SceneAssetPreloader,
} from "./SceneAssetPreloader";
import type { SceneAssetLoadProgress } from "./loadingProgress";
import type { SceneInteractionBridge } from "./sceneInteractionBridge";

export { createSceneInteractionBridge } from "./sceneInteractionBridge";
export type { SceneInteractionBridge } from "./sceneInteractionBridge";

interface BattlefieldCanvasProps {
  readonly battle: BattleState;
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
  readonly deploymentKind?: DeployableKind | null;
  readonly deploymentPreview: (DeploymentPreview & { readonly kind: DeployableKind }) | null;
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
  cameraResetToken,
  cameraViewStore,
  onAssetProgress,
  onAssetsReady,
  onAssetError,
  onBenchmarkUpdate,
}: BattlefieldCanvasProps) {
  const resolvedFactionRaces = factionRaces
    ?? (undeadOpponent ? legacyUndeadOpponentRaces(true) : battle.factionRaces)
    ?? legacyUndeadOpponentRaces(undeadOpponent);
  const hasUndeadTerritory = hasRace(resolvedFactionRaces, "undead");
  const attackPresentations = useAttackPresentationCache(battle);
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
      camera={{ position: [16, 18, 20], zoom: 32, near: 0.1, far: 140 }}
      gl={{ antialias: true, alpha: false }}
      resize={{ offsetSize: true }}
      style={{
        width: "100%",
        height: "100%",
        background: hasUndeadTerritory ? "#777381" : "#aeb9ad",
      }}
    >
      {onAssetProgress && onAssetsReady && onAssetError && (
        <SceneAssetErrorBoundary onError={onAssetError}>
          <SceneAssetPreloader
            onProgress={onAssetProgress}
            onReady={onAssetsReady}
          />
        </SceneAssetErrorBoundary>
      )}
      <color attach="background" args={[hasUndeadTerritory ? "#777381" : "#aeb9ad"]} />
      <fog attach="fog" args={[hasUndeadTerritory ? "#777381" : "#aeb9ad", 34, 72]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={[
        hasUndeadTerritory ? "#d8d2e8" : "#dbe8e2",
        hasUndeadTerritory ? "#35243e" : "#51442f",
        1.8,
      ]} />
      <directionalLight
        castShadow
        position={[9, 18, 7]}
        intensity={2.35}
        color={hasUndeadTerritory ? "#e6dcff" : "#fff0c7"}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <BattleCamera
        resetToken={cameraResetToken}
        shake={latestShakeImpulse(battle)}
        initialTargetZ={resolvedFactionRaces.crimson === "undead" ? -2.4 : 0}
        initialZoom={hasUndeadTerritory ? 31 : 32}
        onViewChange={cameraViewStore.publish}
        bridgeRef={bridgeRef}
      />
      <SceneBridge bridgeRef={bridgeRef} />
      {onBenchmarkUpdate && <BenchmarkProbe onUpdate={onBenchmarkUpdate} />}
      <Suspense fallback={<ArenaFallback />}>
        <BattlefieldTerrain factionRaces={resolvedFactionRaces} />
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
              selected={false}
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
        <BattleEffects battle={battle} />
      </Suspense>
      {deploymentPreview && <DeploymentPreviewVisual preview={deploymentPreview} />}
    </Canvas>
  );
}

function DeploymentPreviewVisual({
  preview,
}: {
  readonly preview: DeploymentPreview & { readonly kind: DeployableKind };
}) {
  if (!preview.position) return null;
  const building = isBuildingDeployable(preview.kind);
  const placementRing = deploymentPreviewRingGeometry(preview.kind);
  const color = preview.valid ? VALID_DEPLOYMENT_COLOR : "#ef625e";
  const y = terrainHeightAt(preview.position) + 0.075;
  return (
    <group position={[preview.position.x, y, preview.position.z]}>
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
      <mesh position={[0, building ? 0.16 : 0.06, 0]} renderOrder={99}>
        <cylinderGeometry args={building ? [0.88, 0.88, 0.26, 6] : [0.34, 0.34, 0.1, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.24}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {building && (
        <mesh position={[0, 0.78, 0]} renderOrder={99}>
          <boxGeometry args={[0.92, 1.24, 0.92]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.2}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function UnitShadowInstances({ battle }: { readonly battle: BattleState }) {
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
        terrainHeightAt(unit.position) + 0.018,
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
  bridgeRef,
}: {
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
}) {
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);

  useFrame(() => {
    bridgeRef.current.screenToWorld = (x, y) => {
      ndc.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      const point = raycaster.ray.intersectPlane(ground, hit);
      return point ? { x: point.x, z: point.z } : null;
    };
    bridgeRef.current.zoomByFactor = (factor) => {
      if (!(camera instanceof OrthographicCamera)) return;
      if (!Number.isFinite(factor) || factor <= 0) return;
      const minimumZoom = Math.min(size.width, size.height) <= 520 ? 11 : 22;
      camera.zoom = MathUtils.clamp(
        camera.zoom * factor,
        minimumZoom,
        56,
      );
      camera.updateProjectionMatrix();
    };
    bridgeRef.current.zoomBy = (deltaY) => {
      bridgeRef.current.zoomByFactor(deltaY > 0 ? 0.9 : 1.1);
    };
  });
  return null;
}

function ArenaFallback() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[17, 6]} />
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
