import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  Group,
  MathUtils,
  Object3D,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { BattleState, WorldPoint } from "../../game/battle";
import { terrainHeightAtMap } from "../../map/battlefield";
import { MINING_COIN_EFFECT_ASSET } from "../assets";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";
import {
  formatMiningIncomeAmount,
  miningIncomeEffectsAt,
  MINING_INCOME_EFFECT_DURATION_SECONDS,
} from "./miningIncomePresentation";

export function MiningIncomeEffects({ battle }: { readonly battle: BattleState }) {
  const coinGltf = useLoader(GLTFLoader, MINING_COIN_EFFECT_ASSET.url);
  const effects = miningIncomeEffectsAt(battle);
  return (
    <group name="mining-income-effects">
      {effects.map((effect) => (
        <MiningIncomeBurst
          age={effect.age}
          amount={effect.amount}
          coinSource={coinGltf.scene}
          position={effect.position}
          sequence={effect.sequence}
          key={`mine-income-${effect.mineId}-${effect.sequence}`}
        />
      ))}
    </group>
  );
}

function MiningIncomeBurst({
  age,
  amount,
  coinSource,
  position,
  sequence,
}: {
  readonly age: number;
  readonly amount: number;
  readonly coinSource: Object3D;
  readonly position: WorldPoint;
  readonly sequence: number;
}) {
  const { map } = useBattlefieldDefinition();
  const root = useRef<Group>(null);
  const billboard = useRef<Group>(null);
  const coin = useRef<Group>(null);
  const label = useRef<Sprite>(null);
  const labelMaterial = useRef<SpriteMaterial>(null);
  const bornAt = useRef<number | null>(null);
  const coinModel = useMemo(() => coinSource.clone(true), [coinSource]);
  const labelTexture = useMemo(() => createIncomeLabelTexture(amount), [amount]);
  useEffect(() => () => labelTexture.dispose(), [labelTexture]);
  const baseHeight = terrainHeightAtMap(map, position) + 1.45;
  const phase = sequence * 0.83;

  useFrame(({ camera, clock }) => {
    bornAt.current ??= clock.elapsedTime - age;
    const progress = MathUtils.clamp(
      (clock.elapsedTime - bornAt.current) / MINING_INCOME_EFFECT_DURATION_SECONDS,
      0,
      1,
    );
    const easedRise = 1 - (1 - progress) ** 3;
    const popScale = progress < 0.16
      ? MathUtils.lerp(0.35, 1, progress / 0.16)
      : progress > 0.78
        ? MathUtils.lerp(1, 0, (progress - 0.78) / 0.22)
        : 1;
    if (root.current) {
      root.current.position.set(
        position.x + Math.sin(progress * Math.PI + phase) * 0.14,
        baseHeight + easedRise * 1.65,
        position.z,
      );
      root.current.scale.setScalar(popScale);
      root.current.visible = progress < 1;
    }
    if (billboard.current) billboard.current.quaternion.copy(camera.quaternion);
    if (coin.current) {
      coin.current.rotation.y = phase + progress * Math.PI * 4.5;
      coin.current.rotation.z = Math.sin(progress * Math.PI * 2) * 0.08;
    }
    if (label.current) label.current.position.y = 0.05 + Math.sin(progress * Math.PI) * 0.08;
    if (labelMaterial.current) {
      labelMaterial.current.opacity = MathUtils.clamp((1 - progress) / 0.28, 0, 1);
    }
  });

  return (
    <group ref={root} position={[position.x, baseHeight, position.z]}>
      <group ref={billboard}>
        <group
          ref={coin}
          position={[-0.58, 0, 0]}
          scale={MINING_COIN_EFFECT_ASSET.scale}
        >
          <primitive object={coinModel} dispose={null} />
        </group>
        <sprite ref={label} position={[0.62, 0.05, 0]} scale={[1.5, 0.58, 1]}>
          <spriteMaterial
            ref={labelMaterial}
            map={labelTexture}
            transparent
            depthTest={false}
            depthWrite={false}
          />
        </sprite>
      </group>
    </group>
  );
}

function createIncomeLabelTexture(amount: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    const label = `+${formatMiningIncomeAmount(amount)}`;
    context.font = "800 48px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 11;
    context.strokeStyle = "rgba(45, 25, 5, 0.88)";
    context.strokeText(label, 128, 48);
    context.fillStyle = "#ffd45f";
    context.fillText(label, 128, 48);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
