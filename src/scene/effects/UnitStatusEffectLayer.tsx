import { useFrame, useLoader } from "@react-three/fiber";
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  MathUtils,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import { useMemo, useRef } from "react";

import type { BattleUnit } from "../../game/battle";
import type { UnitStatusEffect } from "../../game/unitStatusEffects";
import { terrainHeightAtMap } from "../../map/battlefield";
import { FROST_BREATH_PARTICLES } from "./effectPresentation";
import {
  BURNING_STATUS_COLORS,
  FROST_SLOW_STATUS_COLORS,
  unitStatusEffectOpacity,
  unitStatusEffectPhase,
  unitStatusEffectVisualRadius,
  visibleUnitStatusEffects,
} from "./statusEffectPresentation";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

interface UnitStatusEffectLayerProps {
  readonly units: readonly BattleUnit[];
  readonly elapsed: number;
}

interface StatusEffectTextures {
  readonly flame: Texture;
  readonly sparkle: Texture;
}

const STATUS_TEXTURE_URLS = [
  FROST_BREATH_PARTICLES.wisp,
  FROST_BREATH_PARTICLES.sparkle,
] as const;

export function UnitStatusEffectLayer({ units, elapsed }: UnitStatusEffectLayerProps) {
  const textures = useStatusEffectTextures();
  return (
    <group>
      {units.map((unit) => {
        if (unit.health <= 0 || unit.status === "dead") return null;
        const effects = visibleUnitStatusEffects(unit.statusEffects, elapsed);
        if (effects.length === 0) return null;
        return (
          <UnitStatusAnchor
            unit={unit}
            effects={effects}
            elapsed={elapsed}
            textures={textures}
            key={unit.id}
          />
        );
      })}
    </group>
  );
}

function UnitStatusAnchor({
  unit,
  effects,
  elapsed,
  textures,
}: {
  readonly unit: BattleUnit;
  readonly effects: readonly UnitStatusEffect[];
  readonly elapsed: number;
  readonly textures: StatusEffectTextures;
}) {
  const { map } = useBattlefieldDefinition();
  const root = useRef<Group>(null);
  const groundY = terrainHeightAtMap(map, unit.position) + 0.08;
  const radius = unitStatusEffectVisualRadius(unit.role);
  const phase = unitStatusEffectPhase(unit.id);
  useFrame((_, delta) => {
    if (!root.current) return;
    root.current.position.x = MathUtils.damp(root.current.position.x, unit.position.x, 10, delta);
    root.current.position.y = MathUtils.damp(root.current.position.y, groundY, 10, delta);
    root.current.position.z = MathUtils.damp(root.current.position.z, unit.position.z, 10, delta);
  });
  return (
    <group ref={root} position={[unit.position.x, groundY, unit.position.z]}>
      {effects.map((effect) => (
        <StatusEffectVisual
          effect={effect}
          elapsed={elapsed}
          radius={radius}
          phase={phase}
          textures={textures}
          key={effect.key}
        />
      ))}
    </group>
  );
}

function StatusEffectVisual({
  effect,
  elapsed,
  radius,
  phase,
  textures,
}: {
  readonly effect: UnitStatusEffect;
  readonly elapsed: number;
  readonly radius: number;
  readonly phase: number;
  readonly textures: StatusEffectTextures;
}) {
  const opacity = unitStatusEffectOpacity(effect, elapsed);
  switch (effect.kind) {
    case "frost-slow":
      return (
        <FrostSlowVisual
          radius={radius}
          opacity={opacity}
          phase={phase}
          sparkle={textures.sparkle}
        />
      );
    case "burning":
      return (
        <BurningVisual
          radius={radius}
          opacity={opacity}
          phase={phase}
          flame={textures.flame}
        />
      );
    default:
      return assertNever(effect);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported unit status effect: ${JSON.stringify(value)}`);
}

function FrostSlowVisual({
  radius,
  opacity,
  phase,
  sparkle,
}: {
  readonly radius: number;
  readonly opacity: number;
  readonly phase: number;
  readonly sparkle: Texture;
}) {
  const root = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (root.current) root.current.rotation.y = phase + clock.elapsedTime * 0.7;
  });
  return (
    <group ref={root}>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
        <ringGeometry args={[radius * 0.68, radius, 36]} />
        <meshBasicMaterial
          color={FROST_SLOW_STATUS_COLORS.outer}
          transparent
          opacity={opacity * 0.42}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, phase]} renderOrder={22}>
        <ringGeometry args={[radius * 0.79, radius * 0.88, 28]} />
        <meshBasicMaterial
          color={FROST_SLOW_STATUS_COLORS.inner}
          transparent
          opacity={opacity * 0.68}
          depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>
      {[-0.68, 0.08, 0.72].map((angle, index) => (
        <mesh
          position={[
            Math.cos(angle * Math.PI + phase) * radius * 0.72,
            radius * (0.13 + index * 0.025),
            Math.sin(angle * Math.PI + phase) * radius * 0.72,
          ]}
          rotation={[0, angle + phase, index % 2 === 0 ? -0.16 : 0.14]}
          renderOrder={22}
          key={angle}
        >
          <coneGeometry args={[radius * 0.1, radius * 0.4, 5]} />
          <meshBasicMaterial
            color={FROST_SLOW_STATUS_COLORS.crystal}
            transparent
            opacity={opacity * 0.72}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
      <sprite position={[0, radius * 0.34, 0]} scale={[radius * 0.9, radius * 0.9, 1]} renderOrder={23}>
        <spriteMaterial
          map={sparkle}
          color={FROST_SLOW_STATUS_COLORS.inner}
          transparent
          opacity={opacity * 0.38}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function BurningVisual({
  radius,
  opacity,
  phase,
  flame,
}: {
  readonly radius: number;
  readonly opacity: number;
  readonly phase: number;
  readonly flame: Texture;
}) {
  const root = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!root.current) return;
    root.current.rotation.y = -phase - clock.elapsedTime * 0.9;
    root.current.position.y = Math.sin(clock.elapsedTime * 8 + phase) * 0.025;
  });
  const flameScale = Math.max(0.54, radius * 0.72);
  return (
    <group ref={root}>
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, phase]} renderOrder={23}>
        <ringGeometry args={[radius * 0.76, radius * 0.96, 32]} />
        <meshBasicMaterial
          color={BURNING_STATUS_COLORS.ring}
          transparent
          opacity={opacity * 0.38}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {[-0.72, 0, 0.72].map((offset, index) => (
        <sprite
          position={[offset * radius, flameScale * (0.62 + index * 0.08), index === 1 ? -radius * 0.28 : 0]}
          scale={[flameScale * 0.72, flameScale * (1.08 + index * 0.1), 1]}
          renderOrder={24}
          key={offset}
        >
          <spriteMaterial
            map={flame}
            color={index === 1 ? BURNING_STATUS_COLORS.core : BURNING_STATUS_COLORS.flame}
            transparent
            opacity={opacity * (index === 1 ? 0.82 : 0.68)}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
      {[0.2, 1.7, 3.5].map((angle, index) => (
        <mesh
          position={[
            Math.cos(angle + phase) * radius * 0.48,
            flameScale * (1.05 + index * 0.26),
            Math.sin(angle + phase) * radius * 0.48,
          ]}
          renderOrder={24}
          key={angle}
        >
          <sphereGeometry args={[Math.max(0.025, radius * 0.045), 6, 5]} />
          <meshBasicMaterial
            color={BURNING_STATUS_COLORS.ember}
            transparent
            opacity={opacity * 0.75}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function useStatusEffectTextures(): StatusEffectTextures {
  const loaded = useLoader(TextureLoader, [...STATUS_TEXTURE_URLS]);
  return useMemo(() => {
    for (const texture of loaded) {
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
    }
    return { flame: loaded[0]!, sparkle: loaded[1]! };
  }, [loaded]);
}
