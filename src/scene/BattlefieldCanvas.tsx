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
import { BattleCamera, type CameraShakeImpulse } from "./camera/BattleCamera";
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
}

interface BattlefieldCanvasProps {
  readonly battle: BattleState;
  readonly selectedIds: readonly string[];
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
  readonly commandMarker: CommandMarker | null;
  readonly cameraResetToken: number;
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
  cameraResetToken,
}: BattlefieldCanvasProps) {
  const attackPresentations = useAttackPresentationCache(battle);
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
      <BattleCamera resetToken={cameraResetToken} shake={latestShakeImpulse(battle)} />
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
      {commandMarker && (
        <CommandMarkerVisual marker={commandMarker} key={`${commandMarker.revision}-${commandMarker.kind}`} />
      )}
    </Canvas>
  );
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

function CommandMarkerVisual({ marker }: { readonly marker: CommandMarker }) {
  const root = useRef<Object3D>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - bornAt.current;
    if (!root.current) return;
    const pulse = 1 + Math.min(1, age * 2.5) * 0.75;
    root.current.scale.setScalar(pulse);
    root.current.visible = age < 0.8;
  });
  return (
    <group ref={root} position={[marker.x, terrainHeightAt(marker) + 0.09, marker.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.55, marker.kind === "attack" ? 4 : marker.kind === "attack-move" ? 6 : 24]} />
        <meshBasicMaterial
          color={marker.kind === "attack" ? "#ec5b58" : marker.kind === "attack-move" ? "#e59b45" : "#f1cd67"}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
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
    if (event.type === "squad-routed") {
      return { sequence: event.sequence, intensity: 0.8 };
    }
    if (event.type === "projectile-hit" && (event.role === "mage" || event.role === "catapult")) {
      return { sequence: event.sequence, intensity: event.role === "catapult" ? 0.74 : 0.58 };
    }
  }
  return null;
}
