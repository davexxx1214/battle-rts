import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  MathUtils,
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
  WorldPoint,
} from "../game/battle";
import type { ProjectedUnit } from "../game/selection";
import { terrainHeightAt } from "../map/battlefield";
import {
  BattleCamera,
  type CameraShakeImpulse,
} from "./camera/BattleCamera";
import type { CameraViewStore } from "./camera/cameraViewStore";
import { BattleEffects } from "./effects/BattleEffects";
import { BattlefieldTerrain } from "./terrain/BattlefieldTerrain";
import { UnitModel } from "./units/UnitModel";

export interface SceneInteractionBridge {
  projectedUnits: ProjectedUnit[];
  screenToWorld: (x: number, y: number) => WorldPoint | null;
  zoomBy: (deltaY: number) => void;
}

export interface CommandMarker extends WorldPoint {
  readonly kind: "move" | "attack" | "attack-move";
  readonly revision: number;
  readonly persistent?: boolean;
  readonly targetId?: string;
  readonly facing?: number;
  readonly unitIds?: readonly string[];
  readonly formationSlots?: readonly WorldPoint[];
}

type DisplayedCommandMarker = CommandMarker;

interface BattlefieldCanvasProps {
  readonly battle: BattleState;
  readonly selectedIds: readonly string[];
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
  readonly commandMarker: CommandMarker | null;
  readonly plannedCommandMarkers: readonly CommandMarker[];
  readonly cameraResetToken: number;
  readonly cameraViewStore: CameraViewStore;
}

interface AttackPresentation {
  readonly sequence: number;
  readonly time: number;
}

const ATTACK_PRESENTATION_SECONDS = 3.6;

export function createSceneInteractionBridge(): SceneInteractionBridge {
  return {
    projectedUnits: [],
    screenToWorld: () => null,
    zoomBy: () => undefined,
  };
}

export function BattlefieldCanvas({
  battle,
  selectedIds,
  bridgeRef,
  commandMarker,
  plannedCommandMarkers,
  cameraResetToken,
  cameraViewStore,
}: BattlefieldCanvasProps) {
  const attackPresentations = useAttackPresentationCache(battle);
  const displayedCommandMarker = resolveDisplayedCommandMarker(commandMarker, battle);
  const displayedPlans = plannedCommandMarkers.flatMap((marker) => {
    const displayed = resolveDisplayedCommandMarker(marker, battle);
    return displayed ? [displayed] : [];
  });
  return (
    <Canvas
      orthographic
      shadows="basic"
      dpr={[1, 1.5]}
      camera={{ position: [16, 18, 20], zoom: 32, near: 0.1, far: 140 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%", background: "#aeb9ad" }}
    >
      <color attach="background" args={["#aeb9ad"]} />
      <fog attach="fog" args={["#aeb9ad", 34, 72]} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#dbe8e2", "#51442f", 1.8]} />
      <directionalLight
        castShadow
        position={[9, 18, 7]}
        intensity={2.35}
        color="#fff0c7"
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
        onViewChange={cameraViewStore.publish}
      />
      <SceneBridge battle={battle} bridgeRef={bridgeRef} />
      <Suspense fallback={<ArenaFallback />}>
        <BattlefieldTerrain />
        {battle.units.map((unit) => {
          const damage = latestDamagePresentation(battle, unit.id);
          const attack = attackPresentations.get(unit.id);
          return (
            <UnitModel
              unit={unit}
              selected={selectedIds.includes(unit.id)}
              attackSequence={attack?.sequence}
              attackTime={attack?.time}
              battleTime={battle.elapsed}
              damageTime={damage?.time}
              damageSourcePosition={damage?.sourcePosition}
              key={unit.id}
            />
          );
        })}
        <BattleEffects battle={battle} />
      </Suspense>
      {displayedPlans.map((marker) => (
        <CommandMarkerVisual
          marker={marker}
          key={`plan-${marker.revision}-${marker.kind}-${marker.targetId ?? `${marker.x}:${marker.z}`}`}
        />
      ))}
      {displayedCommandMarker && (
        <CommandMarkerVisual
          marker={displayedCommandMarker}
          key={`${displayedCommandMarker.revision}-${displayedCommandMarker.kind}`}
        />
      )}
    </Canvas>
  );
}

function resolveDisplayedCommandMarker(
  marker: CommandMarker | null,
  battle: BattleState,
): DisplayedCommandMarker | null {
  if (!marker) return null;
  if (marker.kind === "attack" && marker.targetId) {
    const target = battle.units.find((unit) => unit.id === marker.targetId && unit.health > 0);
    return target ? { ...marker, ...target.position } : marker;
  }
  if (marker.formationSlots) return marker;
  if (!marker.unitIds) return marker;
  const commanded = new Set(marker.unitIds);
  return {
    ...marker,
    formationSlots: battle.units.flatMap((unit) => (
      commanded.has(unit.id) && unit.health > 0 ? [unit.formationSlot] : []
    )),
  };
}

function SceneBridge({
  battle,
  bridgeRef,
}: {
  readonly battle: BattleState;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
}) {
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector2(), []);
  const projected = useMemo(() => new Vector3(), []);

  useFrame(() => {
    bridgeRef.current.projectedUnits = battle.units.map((unit) => {
      projected.set(
        unit.position.x,
        terrainHeightAt(unit.position) + 0.86,
        unit.position.z,
      ).project(camera);
      return {
        id: unit.id,
        faction: unit.faction,
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        alive: unit.health > 0,
        visible: projected.z >= -1 && projected.z <= 1,
      };
    });
    bridgeRef.current.screenToWorld = (x, y) => {
      ndc.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      const point = raycaster.ray.intersectPlane(ground, hit);
      return point ? { x: point.x, z: point.z } : null;
    };
    bridgeRef.current.zoomBy = (deltaY) => {
      if (!(camera instanceof OrthographicCamera)) return;
      camera.zoom = MathUtils.clamp(camera.zoom * (deltaY > 0 ? 0.9 : 1.1), 22, 56);
      camera.updateProjectionMatrix();
    };
  });
  return null;
}

function CommandMarkerVisual({ marker }: { readonly marker: DisplayedCommandMarker }) {
  const root = useRef<Object3D>(null);
  const focusBillboard = useRef<Object3D>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ camera, clock }) => {
    bornAt.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - bornAt.current;
    if (!root.current) return;
    const pulse = 1 + Math.min(1, age * 3) * 0.38;
    root.current.scale.setScalar(pulse);
    root.current.visible = marker.persistent
      || age < (marker.kind === "attack" ? 1.5 : 1.2);
    focusBillboard.current?.lookAt(camera.position);
  });
  const color = marker.kind === "attack"
    ? "#ec5b58"
    : marker.kind === "attack-move" ? "#e59b45" : "#f1cd67";
  return (
    <group ref={root} position={[marker.x, terrainHeightAt(marker) + 0.09, marker.z]}>
      {marker.formationSlots?.map((slot, index) => (
        <mesh
          position={[slot.x - marker.x, 0.005, slot.z - marker.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          key={`${index}:${slot.x.toFixed(2)}:${slot.z.toFixed(2)}`}
        >
          <ringGeometry args={[0.11, 0.16, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.62} depthWrite={false} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.55, marker.kind === "attack" ? 4 : marker.kind === "attack-move" ? 6 : 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>
      {marker.kind !== "attack" && (
        <group rotation={[0, marker.facing ?? 0, 0]}>
          <mesh position={[0, 0.025, 0.73]}>
            <boxGeometry args={[0.08, 0.035, 0.72]} />
            <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.025, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.2, 0.42, 3]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </group>
      )}
      {marker.kind === "attack" && (
        <group>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotation) => (
            <group rotation={[0, rotation, 0]} key={rotation}>
              <mesh position={[0, 0.04, 0.94]}>
                <boxGeometry args={[0.14, 0.06, 0.5]} />
                <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 1.05, 0]}>
            <cylinderGeometry args={[0.035, 0.15, 2.1, 6]} />
            <meshBasicMaterial color={color} transparent opacity={0.62} depthWrite={false} />
          </mesh>
          <group ref={focusBillboard} position={[0, 1.35, 0]}>
            <CrossedSword rotation={Math.PI / 4} color={color} />
            <CrossedSword rotation={-Math.PI / 4} color={color} />
          </group>
        </group>
      )}
    </group>
  );
}

function CrossedSword({ rotation, color }: {
  readonly rotation: number;
  readonly color: string;
}) {
  return (
    <group rotation={[0, 0, rotation]}>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.11, 0.86, 0.07]} />
        <meshBasicMaterial color="#fff1cf" transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.67, 0]}>
        <coneGeometry args={[0.105, 0.25, 4]} />
        <meshBasicMaterial color="#fff1cf" transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.31, 0.005]}>
        <boxGeometry args={[0.46, 0.09, 0.09]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.49, 0]}>
        <boxGeometry args={[0.1, 0.3, 0.08]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.68, 0]}>
        <octahedronGeometry args={[0.11, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthWrite={false} />
      </mesh>
    </group>
  );
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
    if (event.type !== "damage-applied" || event.targetId !== unitId) continue;
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
    if (event.type === "projectile-hit" && (event.role === "mage" || event.role === "catapult")) {
      return { sequence: event.sequence, intensity: event.role === "catapult" ? 0.74 : 0.58 };
    }
  }
  return null;
}
