import { useFrame } from "@react-three/fiber";
import {
  CanvasTexture,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { useEffect, useMemo, useRef } from "react";

import type { BattleState, UnitRole, WorldPoint } from "../../game/battle";
import type { BattleProjectile } from "../../game/projectiles";
import { terrainHeightAt } from "../../map/battlefield";
import { FixedObjectPool } from "./effectPool";

const PROJECTILE_POOL_CAPACITY = 48;

export function BattleEffects({ battle }: { readonly battle: BattleState }) {
  const recentImpacts = battle.events.filter((event) => (
    event.type === "projectile-hit" && battle.elapsed - event.time <= 1.1
  ));
  const recentDamage = battle.events.filter((event) => (
    event.type === "damage-applied" && battle.elapsed - event.time <= 0.5
  ));
  const recentMelee = battle.events.filter((event) => (
    event.type === "attack-started"
    && event.role === "knight"
    && battle.elapsed - event.time <= 0.3
  ));
  return (
    <group>
      <ProjectilePool projectiles={battle.projectiles} />
      {recentMelee.map((event) => {
        if (event.type !== "attack-started") return null;
        return (
          <MeleeSlash
            position={event.origin}
            facing={Math.atan2(
              event.targetPosition.x - event.origin.x,
              event.targetPosition.z - event.origin.z,
            )}
            age={battle.elapsed - event.time}
            key={`slash-${event.sequence}`}
          />
        );
      })}
      {recentImpacts.map((event) => {
        if (event.type !== "projectile-hit") return null;
        return event.role === "mage" ? (
          <MageImpact
            position={event.position}
            radius={event.splashRadius}
            age={battle.elapsed - event.time}
            key={`mage-impact-${event.sequence}`}
          />
        ) : (
          <ImpactFlash
            position={event.position}
            role={event.role}
            age={battle.elapsed - event.time}
            key={`impact-${event.sequence}`}
          />
        );
      })}
      {recentDamage.map((event) => {
        if (event.type !== "damage-applied") return null;
        return (
          <group key={`damage-${event.sequence}`}>
            <HitSpark position={event.targetPosition} age={battle.elapsed - event.time} />
            <DamageNumber
              amount={event.amount}
              position={event.targetPosition}
              age={battle.elapsed - event.time}
            />
          </group>
        );
      })}
    </group>
  );
}

function ProjectilePool({ projectiles }: { readonly projectiles: readonly BattleProjectile[] }) {
  const arrows = useRef<InstancedMesh>(null);
  const magic = useRef<InstancedMesh>(null);
  const stones = useRef<InstancedMesh>(null);
  const warnings = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const direction = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const pool = useMemo(() => new FixedObjectPool(
    PROJECTILE_POOL_CAPACITY,
    () => ({ projectile: null as BattleProjectile | null }),
    (slot) => { slot.projectile = null; },
  ), []);
  const assignments = pool.sync(projectiles.map(({ id }) => id));
  const projectilesById = new Map(projectiles.map((projectile) => [projectile.id, projectile] as const));
  for (const assignment of assignments) {
    assignment.value.projectile = projectilesById.get(assignment.key) ?? null;
  }

  useFrame(() => {
    for (let index = 0; index < PROJECTILE_POOL_CAPACITY; index += 1) {
      setHiddenMatrix(arrows.current, dummy, index);
      setHiddenMatrix(magic.current, dummy, index);
      setHiddenMatrix(stones.current, dummy, index);
      setHiddenMatrix(warnings.current, dummy, index);
    }
    for (const assignment of assignments) {
      const projectile = assignment.value.projectile;
      if (!projectile) continue;
      const height = terrainHeightAt(projectile.position) + 0.92;
      if (projectile.role === "ranger") {
        direction.set(
          projectile.destination.x - projectile.position.x,
          0,
          projectile.destination.z - projectile.position.z,
        ).normalize();
        dummy.position.set(projectile.position.x, height, projectile.position.z);
        dummy.quaternion.copy(rotation.setFromUnitVectors(up, direction));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        arrows.current?.setMatrixAt(assignment.index, dummy.matrix);
      } else if (projectile.role === "catapult") {
        const totalDistance = Math.max(0.001, distance(projectile.origin, projectile.destination));
        const travelled = distance(projectile.origin, projectile.position);
        const progress = MathUtils.clamp(travelled / totalDistance, 0, 1);
        dummy.position.set(
          projectile.position.x,
          terrainHeightAt(projectile.position) + 0.85 + Math.sin(progress * Math.PI) * 3.8,
          projectile.position.z,
        );
        dummy.rotation.set(progress * Math.PI * 5, progress * Math.PI * 3, 0);
        dummy.scale.setScalar(0.3);
        dummy.updateMatrix();
        stones.current?.setMatrixAt(assignment.index, dummy.matrix);
      } else {
        dummy.position.set(projectile.position.x, height, projectile.position.z);
        dummy.quaternion.identity();
        dummy.scale.setScalar(0.18);
        dummy.updateMatrix();
        magic.current?.setMatrixAt(assignment.index, dummy.matrix);

        dummy.position.set(
          projectile.destination.x,
          terrainHeightAt(projectile.destination) + 0.055,
          projectile.destination.z,
        );
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(projectile.splashRadius);
        dummy.updateMatrix();
        warnings.current?.setMatrixAt(assignment.index, dummy.matrix);
      }
    }
    if (arrows.current) arrows.current.instanceMatrix.needsUpdate = true;
    if (magic.current) magic.current.instanceMatrix.needsUpdate = true;
    if (stones.current) stones.current.instanceMatrix.needsUpdate = true;
    if (warnings.current) warnings.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={arrows} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <cylinderGeometry args={[0.025, 0.04, 0.56, 5]} />
        <meshBasicMaterial color="#ffe1a0" />
      </instancedMesh>
      <instancedMesh ref={magic} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 7]} />
        <meshBasicMaterial color="#75d5ff" transparent opacity={0.94} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={stones} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#655d4d" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={warnings} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <ringGeometry args={[0.78, 1, 24]} />
        <meshBasicMaterial color="#6bcdf2" transparent opacity={0.24} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

function setHiddenMatrix(mesh: InstancedMesh | null, dummy: Object3D, index: number): void {
  if (!mesh) return;
  dummy.position.set(0, -100, 0);
  dummy.quaternion.identity();
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function MeleeSlash({
  position,
  facing,
  age,
}: {
  readonly position: WorldPoint;
  readonly facing: number;
  readonly age: number;
}) {
  const root = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.3, 0, 1);
    if (root.current) {
      root.current.rotation.z = -0.7 + progress * 1.65;
      root.current.scale.setScalar(0.8 + progress * 0.45);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = Math.sin(progress * Math.PI) * 0.9;
  });
  return (
    <mesh
      ref={root}
      position={[position.x, terrainHeightAt(position) + 0.82, position.z]}
      rotation={[-Math.PI / 2, facing, -0.7]}
    >
      <torusGeometry args={[0.62, 0.045, 4, 18, Math.PI * 1.15]} />
      <meshBasicMaterial ref={material} color="#fff0b3" transparent depthWrite={false} />
    </mesh>
  );
}

function HitSpark({ position, age }: { readonly position: WorldPoint; readonly age: number }) {
  const root = useRef<Object3D>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.18, 0, 1);
    if (root.current) {
      root.current.scale.setScalar(0.35 + progress * 1.25);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = 1 - progress;
  });
  return (
    <group ref={root} position={[position.x, terrainHeightAt(position) + 0.82, position.z]}>
      {[0, Math.PI / 3, -Math.PI / 3].map((rotation) => (
        <mesh rotation={[0, 0, rotation]} key={rotation}>
          <planeGeometry args={[0.52, 0.055]} />
          <meshBasicMaterial ref={material} color="#fff1ad" transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function MageImpact({
  position,
  radius,
  age,
}: {
  readonly position: WorldPoint;
  readonly radius: number;
  readonly age: number;
}) {
  const root = useRef<Object3D>(null);
  const blastMaterial = useRef<MeshBasicMaterial>(null);
  const residueMaterial = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const currentAge = clock.elapsedTime - bornAt.current;
    const burst = MathUtils.clamp(currentAge / 0.28, 0, 1);
    if (root.current) root.current.visible = currentAge < 1.1;
    if (blastMaterial.current) blastMaterial.current.opacity = (1 - burst) * 0.78;
    if (residueMaterial.current) {
      residueMaterial.current.opacity = Math.max(0, 0.34 * (1 - currentAge / 1.1));
    }
  });
  return (
    <group ref={root} position={[position.x, terrainHeightAt(position) + 0.06, position.z]}>
      <mesh position={[0, 0.28, 0]} scale={[radius * 0.52, radius * 0.52, radius * 0.52]}>
        <sphereGeometry args={[1, 16, 10]} />
        <meshBasicMaterial ref={blastMaterial} color="#8ee8ff" transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[radius, radius, radius]}>
        <ringGeometry args={[0.5, 1, 28]} />
        <meshBasicMaterial ref={residueMaterial} color="#3fa8d8" transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

function DamageNumber({
  amount,
  position,
  age,
}: {
  readonly amount: number;
  readonly position: WorldPoint;
  readonly age: number;
}) {
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      context.font = "700 34px Georgia, serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 7;
      context.strokeStyle = "rgba(32, 18, 13, 0.82)";
      context.strokeText(`-${Math.round(amount)}`, 64, 32);
      context.fillStyle = "#ffe3a4";
      context.fillText(`-${Math.round(amount)}`, 64, 32);
    }
    const result = new CanvasTexture(canvas);
    result.needsUpdate = true;
    return result;
  }, [amount]);
  useEffect(() => () => texture.dispose(), [texture]);
  const baseHeight = terrainHeightAt(position) + 1.32;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.5, 0, 1);
    if (sprite.current) {
      sprite.current.position.y = baseHeight + progress * 0.75;
      sprite.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = 1 - progress;
  });
  return (
    <sprite ref={sprite} position={[position.x, baseHeight, position.z]} scale={[1.25, 0.62, 1]}>
      <spriteMaterial
        ref={material}
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

function ImpactFlash({
  position,
  role,
  age,
}: {
  readonly position: WorldPoint;
  readonly role: UnitRole;
  readonly age: number;
}) {
  const root = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.24, 0, 1);
    if (root.current) {
      root.current.scale.setScalar(0.45 + progress * 0.9);
      root.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = (1 - progress) * 0.86;
  });
  return (
    <mesh
      ref={root}
      position={[position.x, terrainHeightAt(position) + 0.32, position.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.28, 0.42, role === "mage" ? 20 : role === "catapult" ? 12 : 7]} />
      <meshBasicMaterial ref={material} color="#ffd688" transparent depthWrite={false} />
    </mesh>
  );
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}
