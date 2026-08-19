import { useFrame, useLoader } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { useEffect, useMemo, useRef } from "react";

import type { BattleState, UnitRole, WorldPoint } from "../../game/battle";
import type { BattleProjectile } from "../../game/projectiles";
import { unitSpecFor } from "../../game/rules";
import { terrainHeightAt } from "../../map/battlefield";
import { boneDragonTerrainSupportHeight } from "../boneDragonPresentation";
import { FixedObjectPool } from "./effectPool";
import {
  BATTLE_FX_SEQUENCES,
  BATTLE_FX_URLS,
  FROST_BREATH_DURATION_SECONDS,
  FROST_BREATH_MOUTH_HEIGHT,
  FROST_BREATH_PARTICLES,
  LIGHTNING_STRIKE_COLORS,
  LIGHTNING_STRIKE_DURATION_SECONDS,
  LIGHTNING_STRIKE_GROUND_OFFSET,
  LIGHTNING_STRIKE_HEIGHT,
  LIGHTNING_STRIKE_PARTICLES,
  LIGHTNING_STRIKE_WIDTH,
  POISON_CLOUD_COLORS,
  POISON_CLOUD_CORE_SCALE,
  POISON_CLOUD_FLIGHT_SCALE,
  POISON_CLOUD_IMPACT_DURATION_SECONDS,
  POISON_CLOUD_LANDING_HEIGHT,
  POISON_CLOUD_LAUNCH_HEIGHT,
  POISON_CLOUD_MUZZLE_DURATION_SECONDS,
  POISON_CLOUD_PARTICLES,
  combatProfileForAttacker,
  effectFrameIndex,
  frostBreathLayout,
  lightningBoltCenterOffset,
  lightningStrikePose,
  mageAttackUsesSkyLightning,
  projectileArcSlope,
  projectileFlightHeight,
  projectileImpactLifetime,
  type BattleFxSequenceName,
} from "./effectPresentation";

const PROJECTILE_POOL_CAPACITY = 48;
const MAGIC_FLIGHT_DURATION_SECONDS = 0.36;

type BattleFxTextures = Readonly<Record<BattleFxSequenceName, readonly Texture[]>> & {
  readonly frost: Readonly<Record<keyof typeof FROST_BREATH_PARTICLES, Texture>>;
  readonly lightning: Readonly<Record<keyof typeof LIGHTNING_STRIKE_PARTICLES, Texture>>;
  readonly poison: Readonly<Record<keyof typeof POISON_CLOUD_PARTICLES, Texture>>;
};

const FROST_PUFF_SLOTS = [
  { along: 0.12, lateral: 0, kind: "wisp" },
  { along: 0.2, lateral: -0.36, kind: "smoke" },
  { along: 0.22, lateral: 0.4, kind: "sparkle" },
  { along: 0.3, lateral: -0.72, kind: "smoke" },
  { along: 0.32, lateral: 0.18, kind: "wisp" },
  { along: 0.36, lateral: 0.7, kind: "smoke" },
  { along: 0.44, lateral: -0.48, kind: "sparkle" },
  { along: 0.48, lateral: 0.52, kind: "wisp" },
  { along: 0.52, lateral: -0.92, kind: "smoke" },
  { along: 0.56, lateral: 0.12, kind: "smoke" },
  { along: 0.6, lateral: 0.88, kind: "smoke" },
  { along: 0.68, lateral: -0.28, kind: "sparkle" },
  { along: 0.72, lateral: 0.62, kind: "wisp" },
  { along: 0.78, lateral: -0.78, kind: "smoke" },
  { along: 0.84, lateral: 0.24, kind: "sparkle" },
  { along: 0.88, lateral: 0.82, kind: "smoke" },
  { along: 0.94, lateral: -0.54, kind: "wisp" },
] as const;
const FROST_CORE = "#e8fbff";
const FROST_JET = "#7ad7ff";
const FROST_MIST = "#9ee6ff";
const FROST_CRYSTAL = "#c9f4ff";
const FROST_SHEET_VERTICAL_OFFSET = -0.06;

export function BattleEffects({ battle }: { readonly battle: BattleState }) {
  const fxTextures = useBattleFxTextures();
  const recentImpacts = battle.events.filter((event) => {
    if (event.type !== "projectile-hit") return false;
    const lifetime = event.visualKind === "poison-cloud"
      ? POISON_CLOUD_IMPACT_DURATION_SECONDS
      : projectileImpactLifetime(event.role);
    return lifetime > 0 && battle.elapsed - event.time <= lifetime;
  });
  const recentDamage = battle.events.filter((event) => (
    event.type === "damage-applied" && battle.elapsed - event.time <= 0.5
  ));
  const poisonHits = battle.events.filter((event) => (
    event.type === "projectile-hit" && event.visualKind === "poison-cloud"
  ));
  const recentBreaths = battle.events.filter((event) => (
    event.type === "attack-started"
    && event.role === "bone-dragon"
    && battle.elapsed - event.time <= FROST_BREATH_DURATION_SECONDS
  ));
  const recentPoisonMuzzles = battle.events.filter((event) => (
    event.type === "attack-started"
    && event.visualKind === "poison-cloud"
    && battle.elapsed - event.time <= POISON_CLOUD_MUZZLE_DURATION_SECONDS
  ));
  const visibleProjectiles = battle.projectiles.filter((projectile) => (
    !mageAttackUsesSkyLightning(
      projectile.role,
      combatProfileForAttacker(battle.units, projectile.attackerId),
    )
  ));
  const recentLightning = battle.events.filter((event) => (
    event.type === "projectile-hit"
    && mageAttackUsesSkyLightning(
      event.role,
      combatProfileForAttacker(battle.units, event.attackerId),
    )
    && battle.elapsed - event.time <= LIGHTNING_STRIKE_DURATION_SECONDS
  ));
  return (
    <group>
      <ProjectilePool projectiles={visibleProjectiles} fxTextures={fxTextures} />
      {recentPoisonMuzzles.map((event) => {
        if (event.type !== "attack-started" || event.visualKind !== "poison-cloud") return null;
        return (
          <PoisonCloudMuzzle
            origin={event.origin}
            target={event.targetPosition}
            age={battle.elapsed - event.time}
            sequence={event.sequence}
            textures={fxTextures.poison}
            key={`poison-muzzle-${event.sequence}`}
          />
        );
      })}
      {recentLightning.map((event) => {
        if (event.type !== "projectile-hit") return null;
        return (
          <LightningStrike
            position={event.position}
            age={battle.elapsed - event.time}
            sequence={event.sequence}
            textures={fxTextures.lightning}
            key={`lightning-${event.sequence}`}
          />
        );
      })}
      {recentBreaths.map((event) => {
        if (event.type !== "attack-started" || event.role !== "bone-dragon") return null;
        return (
          <FrostBreathCone
            origin={event.origin}
            target={event.targetPosition}
            age={battle.elapsed - event.time}
            textures={fxTextures.frost}
            key={`frost-breath-${event.sequence}`}
          />
        );
      })}
      {recentImpacts.map((event) => {
        if (event.type !== "projectile-hit") return null;
        if (event.visualKind === "poison-cloud") {
          return (
            <PoisonCloudImpact
              position={event.position}
              age={battle.elapsed - event.time}
              sequence={event.sequence}
              textures={fxTextures.poison}
              key={`poison-impact-${event.sequence}`}
            />
          );
        }
        return event.role === "ranger" ? (
          <AnimatedFxSprite
            position={event.position}
            height={0.7}
            frames={fxTextures.arrowImpact}
            duration={0.3}
            age={battle.elapsed - event.time}
            scale={0.82}
            key={`arrow-impact-${event.sequence}`}
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
        const poisonHit = poisonHits.some((hit) => (
          hit.type === "projectile-hit"
          && hit.attackerId === event.sourceId
          && hit.targetId === event.targetId
          && hit.time === event.time
        ));
        return (
          <group key={`damage-${event.sequence}`}>
            {event.sourceRole === "bone-dragon" ? (
              <FrostImpactBurst
                position={event.targetPosition}
                age={battle.elapsed - event.time}
                texture={fxTextures.frost.impact}
              />
            ) : event.sourceRole !== "mage" && !poisonHit ? (
              <HitSpark position={event.targetPosition} age={battle.elapsed - event.time} />
            ) : null}
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

function PoisonCloudMuzzle({
  origin,
  target,
  age,
  sequence,
  textures,
}: {
  readonly origin: WorldPoint;
  readonly target: WorldPoint;
  readonly age: number;
  readonly sequence: number;
  readonly textures: BattleFxTextures["poison"];
}) {
  const root = useRef<Object3D>(null);
  const cloud = useRef<Sprite>(null);
  const ring = useRef<Sprite>(null);
  const cloudMaterial = useRef<SpriteMaterial>(null);
  const ringMaterial = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const offsetX = target.x - origin.x;
  const offsetZ = target.z - origin.z;
  const length = Math.hypot(offsetX, offsetZ);
  const directionX = length > 1e-8 ? offsetX / length : 0;
  const directionZ = length > 1e-8 ? offsetZ / length : 1;
  const startX = origin.x + directionX * 0.2;
  const startZ = origin.z + directionZ * 0.2;
  const startY = terrainHeightAt(origin) + POISON_CLOUD_LAUNCH_HEIGHT;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / POISON_CLOUD_MUZZLE_DURATION_SECONDS,
      0,
      1,
    );
    const visible = progress < 1;
    if (root.current) {
      root.current.position.set(
        startX + directionX * progress * 0.2,
        startY + progress * 0.04,
        startZ + directionZ * progress * 0.2,
      );
      root.current.visible = visible;
    }
    if (cloud.current) cloud.current.scale.setScalar(0.34 + progress * 0.34);
    if (ring.current) ring.current.scale.setScalar(0.28 + progress * 0.5);
    if (cloudMaterial.current) cloudMaterial.current.opacity = (1 - progress) * 0.72;
    if (ringMaterial.current) {
      ringMaterial.current.opacity = Math.sin(progress * Math.PI) * 0.68;
    }
  });
  return (
    <group ref={root} position={[startX, startY, startZ]}>
      <sprite ref={cloud} scale={0.34} renderOrder={31}>
        <spriteMaterial
          ref={cloudMaterial}
          map={textures.cloud}
          color={POISON_CLOUD_COLORS.cloud}
          rotation={(sequence * 1.618) % (Math.PI * 2)}
          transparent
          opacity={0.72}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={ring} scale={0.28} renderOrder={32}>
        <spriteMaterial
          ref={ringMaterial}
          map={textures.burst}
          color={POISON_CLOUD_COLORS.core}
          rotation={(sequence * 2.399) % (Math.PI * 2)}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function PoisonCloudImpact({
  position,
  age,
  sequence,
  textures,
}: {
  readonly position: WorldPoint;
  readonly age: number;
  readonly sequence: number;
  readonly textures: BattleFxTextures["poison"];
}) {
  const root = useRef<Object3D>(null);
  const cloud = useRef<Sprite>(null);
  const burst = useRef<Sprite>(null);
  const ring = useRef<Sprite>(null);
  const cloudMaterial = useRef<SpriteMaterial>(null);
  const burstMaterial = useRef<SpriteMaterial>(null);
  const ringMaterial = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const baseY = terrainHeightAt(position) + 0.68;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / POISON_CLOUD_IMPACT_DURATION_SECONDS,
      0,
      1,
    );
    const visible = progress < 1;
    if (root.current) {
      root.current.position.y = baseY + progress * 0.12;
      root.current.visible = visible;
    }
    if (cloud.current) cloud.current.scale.setScalar(0.54 + progress * 0.34);
    if (burst.current) burst.current.scale.setScalar(0.38 + progress * 0.44);
    if (ring.current) ring.current.scale.setScalar(0.42 + progress * 0.7);
    if (cloudMaterial.current) {
      cloudMaterial.current.opacity = Math.pow(1 - progress, 0.7) * 0.78;
    }
    if (burstMaterial.current) {
      burstMaterial.current.opacity = Math.sin(progress * Math.PI) * 0.62;
    }
    if (ringMaterial.current) {
      ringMaterial.current.opacity = Math.sin(progress * Math.PI) * 0.56;
    }
  });
  return (
    <group ref={root} position={[position.x, baseY, position.z]}>
      <sprite ref={cloud} scale={0.54} renderOrder={33}>
        <spriteMaterial
          ref={cloudMaterial}
          map={textures.cloud}
          color={POISON_CLOUD_COLORS.cloud}
          rotation={(sequence * 1.414) % (Math.PI * 2)}
          transparent
          opacity={0.78}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={burst} scale={0.38} renderOrder={34}>
        <spriteMaterial
          ref={burstMaterial}
          map={textures.burst}
          color={POISON_CLOUD_COLORS.core}
          rotation={(sequence * 2.399) % (Math.PI * 2)}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={ring} scale={0.42} renderOrder={35}>
        <spriteMaterial
          ref={ringMaterial}
          map={textures.ring}
          color={POISON_CLOUD_COLORS.ring}
          rotation={(sequence * 0.925) % (Math.PI * 2)}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function FrostBreathCone({
  origin,
  target,
  age,
  textures,
}: {
  readonly origin: WorldPoint;
  readonly target: WorldPoint;
  readonly age: number;
  readonly textures: BattleFxTextures["frost"];
}) {
  const jetVertical = useRef<Mesh>(null);
  const jetHorizontal = useRef<Mesh>(null);
  const burstVertical = useRef<Mesh>(null);
  const burstHorizontal = useRef<Mesh>(null);
  const flare = useRef<Sprite>(null);
  const sheet = useRef<Mesh>(null);
  const puffRoots = useRef<(Sprite | null)[]>([]);
  const puffMaterials = useRef<(SpriteMaterial | null)[]>([]);
  const jetMaterial = useRef<MeshBasicMaterial>(null);
  const jetSheetMaterial = useRef<MeshBasicMaterial>(null);
  const burstMaterial = useRef<MeshBasicMaterial>(null);
  const burstSheetMaterial = useRef<MeshBasicMaterial>(null);
  const flareMaterial = useRef<SpriteMaterial>(null);
  const sheetMaterial = useRef<MeshBasicMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const spec = unitSpecFor("bone-dragon", "undead");
  const aim = useMemo(
    () => frostBreathLayout(origin, target, spec.attackRange),
    [origin, spec.attackRange, target],
  );
  const facing = Math.atan2(aim.directionX, aim.directionZ);
  const mouthHeight = boneDragonTerrainSupportHeight(origin, facing)
    + FROST_BREATH_MOUTH_HEIGHT;
  const coneHalfAngle = (spec.coneAngleDegrees ?? 0) * Math.PI / 360;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / FROST_BREATH_DURATION_SECONDS,
      0,
      1,
    );
    const envelope = Math.sin(progress * Math.PI);
    const stretch = 0.38 + progress * 0.82;
    const jetLength = Math.min(aim.length * 0.62, 3.2) * stretch;
    const jetHeight = 1.55 + progress * 0.95;
    const visible = progress < 1;
    if (jetVertical.current) {
      jetVertical.current.position.set(jetLength * 0.42, 0, 0);
      jetVertical.current.scale.set(jetLength, jetHeight, 1);
      jetVertical.current.visible = visible;
    }
    if (jetHorizontal.current) {
      jetHorizontal.current.position.set(jetLength * 0.42, 0, 0);
      jetHorizontal.current.scale.set(jetLength, jetHeight * 0.82, 1);
      jetHorizontal.current.visible = visible;
    }
    if (jetMaterial.current) jetMaterial.current.opacity = envelope * 1;
    if (jetSheetMaterial.current) jetSheetMaterial.current.opacity = envelope * 0.9;
    const bloom = 0.7 + envelope * 0.85;
    if (burstVertical.current) {
      burstVertical.current.scale.set(1.35 * bloom, 1.05 * bloom, 1);
      burstVertical.current.visible = visible;
    }
    if (burstHorizontal.current) {
      burstHorizontal.current.scale.set(1.35 * bloom, 0.95 * bloom, 1);
      burstHorizontal.current.visible = visible;
    }
    if (burstMaterial.current) burstMaterial.current.opacity = envelope * 0.98;
    if (burstSheetMaterial.current) burstSheetMaterial.current.opacity = envelope * 0.84;
    if (flare.current && flareMaterial.current) {
      flare.current.scale.setScalar(1.05 + envelope * 1.35);
      flare.current.visible = visible;
      flareMaterial.current.opacity = envelope * 1;
    }
    if (sheet.current && sheetMaterial.current) {
      const sheetLength = jetLength * 0.92;
      const sheetWidth = Math.tan(coneHalfAngle) * sheetLength * 1.35;
      sheet.current.position.set(
        sheetLength * 0.52,
        FROST_SHEET_VERTICAL_OFFSET,
        0,
      );
      sheet.current.scale.set(sheetLength, Math.max(1.1, sheetWidth), 1);
      sheet.current.visible = visible;
      sheetMaterial.current.opacity = envelope * 0.72;
    }
    for (const [index, slot] of FROST_PUFF_SLOTS.entries()) {
      const puff = puffRoots.current[index];
      const material = puffMaterials.current[index];
      if (!puff || !material) continue;
      const local = MathUtils.clamp(progress * 1.25 - index * 0.08, 0, 1);
      const along = slot.along * (0.5 + progress * 0.5);
      const travel = aim.length * along;
      const halfWidth = Math.tan(coneHalfAngle) * travel;
      puff.position.set(
        travel,
        0.04 + index * 0.035,
        halfWidth * slot.lateral,
      );
      const puffScale = slot.kind === "sparkle"
        ? 0.48 + along * 0.85
        : 0.95 + along * 1.85 + index * 0.05;
      puff.scale.setScalar(puffScale);
      puff.visible = visible && local > 0;
      const peak = slot.kind === "smoke" ? 0.82 : slot.kind === "sparkle" ? 0.92 : 0.86;
      material.opacity = Math.sin(local * Math.PI) * peak;
    }
  });
  return (
    <group
      position={[aim.mouthX, mouthHeight, aim.mouthZ]}
      rotation={[0, aim.yaw, 0]}
    >
      <sprite ref={flare} renderOrder={38}>
        <spriteMaterial
          ref={flareMaterial}
          map={textures.flare}
          color={FROST_CORE}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </sprite>
      <mesh ref={burstVertical} renderOrder={35}>
        <planeGeometry args={[1.35, 1.05]} />
        <meshBasicMaterial
          ref={burstMaterial}
          map={textures.burst}
          color={FROST_CORE}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={burstHorizontal} rotation={[Math.PI / 2, 0, 0]} renderOrder={35}>
        <planeGeometry args={[1.35, 1.05]} />
        <meshBasicMaterial
          ref={burstSheetMaterial}
          map={textures.burst}
          color={FROST_CORE}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={jetVertical} renderOrder={36}>
        <planeGeometry args={[1, 0.78]} />
        <meshBasicMaterial
          ref={jetMaterial}
          map={textures.muzzle}
          color={FROST_JET}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={jetHorizontal} rotation={[Math.PI / 2, 0, 0]} renderOrder={36}>
        <planeGeometry args={[1, 0.78]} />
        <meshBasicMaterial
          ref={jetSheetMaterial}
          map={textures.muzzle}
          color={FROST_JET}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={sheet} rotation={[-Math.PI / 2, 0, 0]} renderOrder={33}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={sheetMaterial}
          map={textures.impact}
          color={FROST_MIST}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      {FROST_PUFF_SLOTS.map((slot, index) => (
        <sprite
          ref={(sprite) => { puffRoots.current[index] = sprite; }}
          position={[aim.length * slot.along, 0, 0]}
          scale={0.6}
          renderOrder={34}
          key={`frost-puff-${slot.along}-${slot.lateral}`}
        >
          <spriteMaterial
            ref={(material) => { puffMaterials.current[index] = material; }}
            map={puffTexture(textures, slot.kind)}
            color={slot.kind === "sparkle" ? FROST_CRYSTAL : FROST_MIST}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  );
}

function puffTexture(
  textures: BattleFxTextures["frost"],
  kind: (typeof FROST_PUFF_SLOTS)[number]["kind"],
): Texture {
  if (kind === "sparkle") return textures.sparkle;
  if (kind === "wisp") return textures.wisp;
  return textures.smoke;
}

function FrostImpactBurst({
  position,
  age,
  texture,
}: {
  readonly position: WorldPoint;
  readonly age: number;
  readonly texture: Texture;
}) {
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const height = terrainHeightAt(position) + 0.78;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp((clock.elapsedTime - bornAt.current) / 0.32, 0, 1);
    if (sprite.current) {
      sprite.current.scale.setScalar(0.9 + progress * 2.15);
      sprite.current.visible = progress < 1;
    }
    if (material.current) material.current.opacity = (1 - progress) * 0.96;
  });
  return (
    <sprite ref={sprite} position={[position.x, height, position.z]} renderOrder={37}>
      <spriteMaterial
        ref={material}
        map={texture}
        color={FROST_CORE}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        blending={AdditiveBlending}
      />
    </sprite>
  );
}

function useBattleFxTextures(): BattleFxTextures {
  const loaded = useLoader(TextureLoader, BATTLE_FX_URLS);
  return useMemo(() => {
    const byUrl = new Map<string, Texture>(
      BATTLE_FX_URLS.map((url, index) => [url, loaded[index]!]),
    );
    for (const texture of loaded) {
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
    }
    return {
      arrowImpact: BATTLE_FX_SEQUENCES.arrowImpact.map((url) => byUrl.get(url)!),
      magicFlight: BATTLE_FX_SEQUENCES.magicFlight.map((url) => byUrl.get(url)!),
      frost: {
        muzzle: byUrl.get(FROST_BREATH_PARTICLES.muzzle)!,
        burst: byUrl.get(FROST_BREATH_PARTICLES.burst)!,
        flare: byUrl.get(FROST_BREATH_PARTICLES.flare)!,
        smoke: byUrl.get(FROST_BREATH_PARTICLES.smoke)!,
        wisp: byUrl.get(FROST_BREATH_PARTICLES.wisp)!,
        sparkle: byUrl.get(FROST_BREATH_PARTICLES.sparkle)!,
        impact: byUrl.get(FROST_BREATH_PARTICLES.impact)!,
      },
      lightning: {
        bolt: byUrl.get(LIGHTNING_STRIKE_PARTICLES.bolt)!,
        boltAlt: byUrl.get(LIGHTNING_STRIKE_PARTICLES.boltAlt)!,
        glow: byUrl.get(LIGHTNING_STRIKE_PARTICLES.glow)!,
        burst: byUrl.get(LIGHTNING_STRIKE_PARTICLES.burst)!,
        flare: byUrl.get(LIGHTNING_STRIKE_PARTICLES.flare)!,
        impact: byUrl.get(LIGHTNING_STRIKE_PARTICLES.impact)!,
      },
      poison: {
        cloud: byUrl.get(POISON_CLOUD_PARTICLES.cloud)!,
        burst: byUrl.get(POISON_CLOUD_PARTICLES.burst)!,
        ring: byUrl.get(POISON_CLOUD_PARTICLES.ring)!,
      },
    };
  }, [loaded]);
}

function LightningStrike({
  position,
  age,
  sequence,
  textures,
}: {
  readonly position: WorldPoint;
  readonly age: number;
  readonly sequence: number;
  readonly textures: BattleFxTextures["lightning"];
}) {
  const boltA = useRef<Mesh>(null);
  const boltB = useRef<Mesh>(null);
  const glowA = useRef<Mesh>(null);
  const glowB = useRef<Mesh>(null);
  const impact = useRef<Mesh>(null);
  const flare = useRef<Sprite>(null);
  const burst = useRef<Sprite>(null);
  const boltMaterial = useRef<MeshBasicMaterial>(null);
  const boltCoreMaterial = useRef<MeshBasicMaterial>(null);
  const glowMaterial = useRef<MeshBasicMaterial>(null);
  const glowCoreMaterial = useRef<MeshBasicMaterial>(null);
  const impactMaterial = useRef<MeshBasicMaterial>(null);
  const flareMaterial = useRef<SpriteMaterial>(null);
  const burstMaterial = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const groundY = terrainHeightAt(position) + LIGHTNING_STRIKE_GROUND_OFFSET;
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / LIGHTNING_STRIKE_DURATION_SECONDS,
      0,
      1,
    );
    const pose = lightningStrikePose(progress, sequence);
    const visible = progress < 1;
    const boltY = groundY + lightningBoltCenterOffset(pose.drop);
    const boltHeight = LIGHTNING_STRIKE_HEIGHT * Math.max(pose.drop, 0.04);
    const boltTexture = pose.flicker === 0 ? textures.bolt : textures.boltAlt;
    for (const bolt of [boltA.current, boltB.current]) {
      if (!bolt) continue;
      bolt.position.set(position.x, boltY, position.z);
      bolt.scale.set(pose.boltWidth / LIGHTNING_STRIKE_WIDTH, boltHeight / LIGHTNING_STRIKE_HEIGHT, 1);
      bolt.visible = visible;
    }
    for (const material of [boltMaterial.current, boltCoreMaterial.current]) {
      if (!material) continue;
      if (material.map !== boltTexture) {
        material.map = boltTexture;
        material.needsUpdate = true;
      }
      material.opacity = pose.boltOpacity;
    }
    for (const glow of [glowA.current, glowB.current]) {
      if (!glow) continue;
      glow.position.set(position.x, boltY, position.z);
      glow.scale.set(
        (pose.boltWidth * 1.18) / LIGHTNING_STRIKE_WIDTH,
        boltHeight / LIGHTNING_STRIKE_HEIGHT,
        1,
      );
      glow.visible = visible;
    }
    if (glowMaterial.current) glowMaterial.current.opacity = pose.glowOpacity;
    if (glowCoreMaterial.current) glowCoreMaterial.current.opacity = pose.glowOpacity;
    if (impact.current && impactMaterial.current) {
      const bloom = 0.85 + pose.drop * 1.35;
      impact.current.scale.setScalar(bloom);
      impact.current.visible = visible;
      impactMaterial.current.opacity = pose.impactOpacity;
    }
    if (flare.current && flareMaterial.current) {
      flare.current.scale.setScalar(1.05 + pose.drop * 1.55);
      flare.current.visible = visible;
      flareMaterial.current.opacity = pose.flareOpacity;
    }
    if (burst.current && burstMaterial.current) {
      burst.current.scale.setScalar(1.4 + pose.drop * 1.8);
      burst.current.visible = visible;
      burstMaterial.current.opacity = pose.burstOpacity;
    }
  });
  return (
    <group>
      <mesh
        ref={glowA}
        position={[position.x, groundY + LIGHTNING_STRIKE_HEIGHT * 0.5, position.z]}
        rotation={[0, lightningStrikePose(0, sequence).yaw, 0]}
        renderOrder={39}
      >
        <planeGeometry args={[LIGHTNING_STRIKE_WIDTH, LIGHTNING_STRIKE_HEIGHT]} />
        <meshBasicMaterial
          ref={glowMaterial}
          map={textures.glow}
          color={LIGHTNING_STRIKE_COLORS.glow}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={glowB}
        position={[position.x, groundY + LIGHTNING_STRIKE_HEIGHT * 0.5, position.z]}
        rotation={[0, lightningStrikePose(0, sequence).yaw + Math.PI / 2, 0]}
        renderOrder={39}
      >
        <planeGeometry args={[LIGHTNING_STRIKE_WIDTH, LIGHTNING_STRIKE_HEIGHT]} />
        <meshBasicMaterial
          ref={glowCoreMaterial}
          map={textures.glow}
          color={LIGHTNING_STRIKE_COLORS.glow}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={boltA}
        position={[position.x, groundY + LIGHTNING_STRIKE_HEIGHT * 0.5, position.z]}
        rotation={[0, lightningStrikePose(0, sequence).yaw, 0]}
        renderOrder={41}
      >
        <planeGeometry args={[LIGHTNING_STRIKE_WIDTH, LIGHTNING_STRIKE_HEIGHT]} />
        <meshBasicMaterial
          ref={boltMaterial}
          map={textures.bolt}
          color={LIGHTNING_STRIKE_COLORS.bolt}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={boltB}
        position={[position.x, groundY + LIGHTNING_STRIKE_HEIGHT * 0.5, position.z]}
        rotation={[0, lightningStrikePose(0, sequence).yaw + Math.PI / 2, 0]}
        renderOrder={41}
      >
        <planeGeometry args={[LIGHTNING_STRIKE_WIDTH, LIGHTNING_STRIKE_HEIGHT]} />
        <meshBasicMaterial
          ref={boltCoreMaterial}
          map={textures.bolt}
          color={LIGHTNING_STRIKE_COLORS.core}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={impact}
        position={[position.x, groundY + 0.04, position.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={38}
      >
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial
          ref={impactMaterial}
          map={textures.impact}
          color={LIGHTNING_STRIKE_COLORS.impact}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <sprite
        ref={burst}
        position={[position.x, groundY + 0.72, position.z]}
        scale={1.6}
        renderOrder={40}
      >
        <spriteMaterial
          ref={burstMaterial}
          map={textures.burst}
          color={LIGHTNING_STRIKE_COLORS.spark}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </sprite>
      <sprite
        ref={flare}
        position={[position.x, groundY + 0.38, position.z]}
        scale={1.2}
        renderOrder={42}
      >
        <spriteMaterial
          ref={flareMaterial}
          map={textures.flare}
          color={LIGHTNING_STRIKE_COLORS.core}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

function ProjectilePool({
  projectiles,
  fxTextures,
}: {
  readonly projectiles: readonly BattleProjectile[];
  readonly fxTextures: BattleFxTextures;
}) {
  const arrowShafts = useRef<InstancedMesh>(null);
  const arrowHeads = useRef<InstancedMesh>(null);
  const arrowFletchings = useRef<InstancedMesh>(null);
  const poisonClouds = useRef<InstancedMesh>(null);
  const poisonCores = useRef<InstancedMesh>(null);
  const magicFrames = useRef<(InstancedMesh | null)[]>([]);
  const stones = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const direction = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const rotation = useMemo(() => new Quaternion(), []);
  const reverse = useMemo(
    () => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI),
    [],
  );
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

  useFrame(({ camera }) => {
    for (let index = 0; index < PROJECTILE_POOL_CAPACITY; index += 1) {
      setHiddenMatrix(arrowShafts.current, dummy, index);
      setHiddenMatrix(arrowHeads.current, dummy, index);
      setHiddenMatrix(arrowFletchings.current, dummy, index);
      setHiddenMatrix(poisonClouds.current, dummy, index);
      setHiddenMatrix(poisonCores.current, dummy, index);
      for (const magicFrame of magicFrames.current) {
        setHiddenMatrix(magicFrame, dummy, index);
      }
      setHiddenMatrix(stones.current, dummy, index);
    }
    for (const assignment of assignments) {
      const projectile = assignment.value.projectile;
      if (!projectile) continue;
      if (projectile.role === "ranger") {
        const totalDistance = Math.max(0.001, distance(projectile.origin, projectile.destination));
        const travelled = distance(projectile.origin, projectile.position);
        const progress = MathUtils.clamp(travelled / totalDistance, 0, 1);
        if (projectile.visualKind === "poison-cloud") {
          const flightAge = travelled / Math.max(0.001, projectile.speed);
          const pulse = 1 + Math.sin(flightAge * 9 + assignment.index * 1.7) * 0.06;
          dummy.position.set(
            projectile.position.x,
            projectileFlightHeight(
              "mage",
              progress,
              terrainHeightAt(projectile.origin),
              terrainHeightAt(projectile.destination),
              POISON_CLOUD_LAUNCH_HEIGHT,
              POISON_CLOUD_LANDING_HEIGHT,
            ),
            projectile.position.z,
          );
          dummy.quaternion.copy(camera.quaternion);
          dummy.rotateZ(flightAge * 1.4 + assignment.index * 0.71);
          dummy.scale.setScalar(POISON_CLOUD_FLIGHT_SCALE * pulse);
          dummy.updateMatrix();
          poisonClouds.current?.setMatrixAt(assignment.index, dummy.matrix);

          dummy.quaternion.copy(camera.quaternion);
          dummy.rotateZ(-flightAge * 1.9 + assignment.index * 1.13);
          dummy.scale.setScalar(POISON_CLOUD_CORE_SCALE * (2 - pulse));
          dummy.updateMatrix();
          poisonCores.current?.setMatrixAt(assignment.index, dummy.matrix);
          continue;
        }
        direction.set(
          projectile.destination.x - projectile.position.x,
          projectileArcSlope("ranger", progress, totalDistance),
          projectile.destination.z - projectile.position.z,
        ).normalize();
        dummy.position.set(
          projectile.position.x,
          projectileFlightHeight(
            "ranger",
            progress,
            terrainHeightAt(projectile.origin),
            terrainHeightAt(projectile.destination),
            projectile.sourceType === "building" ? 2.65 : 0.92,
            0.92,
          ),
          projectile.position.z,
        );
        dummy.quaternion.copy(rotation.setFromUnitVectors(up, direction));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        arrowShafts.current?.setMatrixAt(assignment.index, dummy.matrix);

        dummy.position.addScaledVector(direction, 0.32);
        dummy.updateMatrix();
        arrowHeads.current?.setMatrixAt(assignment.index, dummy.matrix);

        dummy.position.addScaledVector(direction, -0.62);
        dummy.quaternion.multiply(reverse);
        dummy.updateMatrix();
        arrowFletchings.current?.setMatrixAt(assignment.index, dummy.matrix);
      } else if (projectile.role === "catapult") {
        const totalDistance = Math.max(0.001, distance(projectile.origin, projectile.destination));
        const travelled = distance(projectile.origin, projectile.position);
        const progress = MathUtils.clamp(travelled / totalDistance, 0, 1);
        dummy.position.set(
          projectile.position.x,
          projectileFlightHeight(
            "catapult",
            progress,
            terrainHeightAt(projectile.origin),
            terrainHeightAt(projectile.destination),
            0.85,
            0.85,
          ),
          projectile.position.z,
        );
        dummy.rotation.set(progress * Math.PI * 5, progress * Math.PI * 3, 0);
        dummy.scale.setScalar(0.3);
        dummy.updateMatrix();
        stones.current?.setMatrixAt(assignment.index, dummy.matrix);
      } else if (projectile.role === "mage") {
        const totalDistance = Math.max(0.001, distance(projectile.origin, projectile.destination));
        const travelled = distance(projectile.origin, projectile.position);
        const progress = MathUtils.clamp(travelled / totalDistance, 0, 1);
        const flightAge = travelled / Math.max(0.001, projectile.speed);
        const frameIndex = effectFrameIndex(
          flightAge % MAGIC_FLIGHT_DURATION_SECONDS,
          MAGIC_FLIGHT_DURATION_SECONDS,
          fxTextures.magicFlight.length,
        ) ?? 0;
        dummy.position.set(
          projectile.position.x,
          projectileFlightHeight(
            "mage",
            progress,
            terrainHeightAt(projectile.origin),
            terrainHeightAt(projectile.destination),
            0.92,
            0.92,
          ),
          projectile.position.z,
        );
        dummy.quaternion.copy(camera.quaternion);
        dummy.scale.setScalar(0.8);
        dummy.updateMatrix();
        magicFrames.current[frameIndex]?.setMatrixAt(assignment.index, dummy.matrix);
      }
    }
    if (arrowShafts.current) arrowShafts.current.instanceMatrix.needsUpdate = true;
    if (arrowHeads.current) arrowHeads.current.instanceMatrix.needsUpdate = true;
    if (arrowFletchings.current) arrowFletchings.current.instanceMatrix.needsUpdate = true;
    if (poisonClouds.current) poisonClouds.current.instanceMatrix.needsUpdate = true;
    if (poisonCores.current) poisonCores.current.instanceMatrix.needsUpdate = true;
    for (const magicFrame of magicFrames.current) {
      if (magicFrame) magicFrame.instanceMatrix.needsUpdate = true;
    }
    if (stones.current) stones.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={arrowShafts} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <cylinderGeometry args={[0.018, 0.018, 0.54, 5]} />
        <meshStandardMaterial color="#684326" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={arrowHeads} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <coneGeometry args={[0.055, 0.14, 5]} />
        <meshStandardMaterial color="#aeb4b2" metalness={0.45} roughness={0.56} />
      </instancedMesh>
      <instancedMesh ref={arrowFletchings} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <coneGeometry args={[0.048, 0.13, 4, 1, true]} />
        <meshStandardMaterial color="#8d2832" roughness={0.88} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh
        ref={poisonClouds}
        args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]}
        frustumCulled={false}
        renderOrder={29}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={fxTextures.poison.cloud}
          color={POISON_CLOUD_COLORS.cloud}
          transparent
          opacity={0.82}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </instancedMesh>
      <instancedMesh
        ref={poisonCores}
        args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]}
        frustumCulled={false}
        renderOrder={30}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={fxTextures.poison.burst}
          color={POISON_CLOUD_COLORS.core}
          transparent
          opacity={0.62}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </instancedMesh>
      {fxTextures.magicFlight.map((texture, index) => (
        <instancedMesh
          ref={(mesh) => { magicFrames.current[index] = mesh; }}
          args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]}
          frustumCulled={false}
          key={texture.uuid}
        >
          <planeGeometry args={[0.67, 0.8]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            toneMapped={false}
            side={DoubleSide}
          />
        </instancedMesh>
      ))}
      <instancedMesh ref={stones} args={[undefined, undefined, PROJECTILE_POOL_CAPACITY]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#655d4d" roughness={0.94} />
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

function AnimatedFxSprite({
  position,
  height,
  frames,
  duration,
  age,
  scale,
  rotation = 0,
}: {
  readonly position: WorldPoint;
  readonly height: number;
  readonly frames: readonly Texture[];
  readonly duration: number;
  readonly age: number;
  readonly scale: number;
  readonly rotation?: number;
}) {
  const sprite = useRef<Sprite>(null);
  const material = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const currentAge = clock.elapsedTime - bornAt.current;
    const frameIndex = effectFrameIndex(currentAge, duration, frames.length);
    if (sprite.current) sprite.current.visible = frameIndex !== null;
    if (material.current && frameIndex !== null && material.current.map !== frames[frameIndex]) {
      material.current.map = frames[frameIndex]!;
      material.current.needsUpdate = true;
    }
  });
  return (
    <sprite
      ref={sprite}
      position={[position.x, terrainHeightAt(position) + height, position.z]}
      scale={[scale * 0.84, scale, 1]}
      renderOrder={28}
    >
      <spriteMaterial
        ref={material}
        map={frames[0]}
        rotation={rotation}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
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
      <meshBasicMaterial
        ref={material}
        color="#ffd688"
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}
