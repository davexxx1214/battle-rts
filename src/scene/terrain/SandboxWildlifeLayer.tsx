import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AnimationMixer,
  Box3,
  LoopRepeat,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import { axialToWorld, terrainHeightAtMap } from "../../map/battlefield";
import type { SandboxWildlifePlacement } from "../../map/sandboxLargeDressing";
import { SANDBOX_WILDLIFE_SCENE_ASSETS } from "../assets";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

export function SandboxWildlifeLayer() {
  const { wildlife = [] } = useBattlefieldDefinition();
  return (
    <group name="sandbox-wildlife-layer">
      {wildlife.map((placement) => (
        <AnimatedWildlife placement={placement} key={placement.id} />
      ))}
    </group>
  );
}

function AnimatedWildlife({
  placement,
}: {
  readonly placement: SandboxWildlifePlacement;
}) {
  const { map } = useBattlefieldDefinition();
  const asset = SANDBOX_WILDLIFE_SCENE_ASSETS[placement.kind];
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(
    () => prepareWildlifeModel(gltf.scene, asset.targetHeight),
    [asset.targetHeight, gltf.scene],
  );
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const world = axialToWorld(placement.coordinate);

  useEffect(() => {
    const clip = gltf.animations.find(({ name }) => name === placement.animation)
      ?? gltf.animations.find(({ name }) => name === "Idle")
      ?? gltf.animations[0];
    if (!clip) return undefined;
    const action = mixer.clipAction(clip).reset();
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    action.play();
    action.time = deterministicAnimationPhase(placement.id) * Math.max(0, clip.duration);
    return () => {
      action.stop();
    };
  }, [gltf.animations, mixer, placement.animation, placement.id]);

  useEffect(() => () => {
    mixer.stopAllAction();
  }, [mixer]);
  useFrame((_, delta) => mixer.update(delta));

  return (
    <group
      name={`sandbox-wildlife-${placement.kind}`}
      position={[
        world.x + placement.offset.x,
        terrainHeightAtMap(map, world) + 0.035,
        world.z + placement.offset.z,
      ]}
      rotation={[0, placement.rotationY, 0]}
      scale={placement.scale}
      userData={{ wildlifeId: placement.id, wildlifeKind: placement.kind }}
    >
      <primitive object={model} />
    </group>
  );
}

function prepareWildlifeModel(source: Object3D, targetHeight: number): Object3D {
  const model = cloneSkeleton(source);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.raycast = () => undefined;
  });
  const initialBounds = new Box3().setFromObject(model);
  const size = initialBounds.getSize(new Vector3());
  const scale = size.y > 1e-6 ? targetHeight / size.y : 1;
  model.scale.setScalar(scale);
  const bounds = new Box3().setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  return model;
}

function deterministicAnimationPhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
