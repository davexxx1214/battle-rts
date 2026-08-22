import { useFrame, useLoader } from "@react-three/fiber";
import {
  Box3,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useMemo, useRef } from "react";

import {
  axialToWorld,
  BATTLEFIELD_HEX_CIRCUMRADIUS,
  terrainHeightAtMap,
} from "../../map/battlefield";
import { OASIS_SCENE_ASSETS } from "../assets";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

const PALM_POSES = [
  { x: -0.72, z: 0.62, rotation: -0.5 },
  { x: 0.74, z: 0.5, rotation: 0.75 },
  { x: 0.04, z: -0.78, rotation: 2.5 },
] as const;

export function OasisLayer() {
  const battlefield = useBattlefieldDefinition();
  const oasis = battlefield.healingZones?.[0];
  const waterGltf = useLoader(GLTFLoader, OASIS_SCENE_ASSETS.water.url);
  const palmGltfs = useLoader(
    GLTFLoader,
    OASIS_SCENE_ASSETS.palms.map((asset) => asset.url),
  );
  const aura = useRef<Group>(null);
  const motes = useRef<Group>(null);
  const water = useMemo(() => {
    const model = cloneSkeleton(waterGltf.scene);
    model.scale.setScalar(OASIS_SCENE_ASSETS.water.scale);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.receiveShadow = true;
      if (object.material instanceof MeshStandardMaterial) {
        object.material = object.material.clone();
        object.material.color.set("#66cbd1");
        object.material.roughness = 0.3;
      }
    });
    return model;
  }, [waterGltf.scene]);
  const palms = useMemo(() => OASIS_SCENE_ASSETS.palms.map((asset, index) => (
    preparePalmModel(palmGltfs[index]!.scene, asset.targetHeight)
  )), [palmGltfs]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (aura.current) {
      const pulse = 0.96 + Math.sin(time * 2.2) * 0.035;
      aura.current.scale.setScalar(pulse);
      aura.current.rotation.y = time * 0.08;
    }
    if (motes.current) {
      motes.current.rotation.y = time * 0.28;
      motes.current.children.forEach((mote, index) => {
        mote.position.y = 0.25 + ((time * 0.28 + index * 0.23) % 1) * 0.9;
        const fade = 1 - MathUtils.clamp((mote.position.y - 0.25) / 0.9, 0, 1);
        mote.scale.setScalar(0.55 + fade * 0.5);
      });
    }
  });

  if (!oasis) return null;
  const position = axialToWorld(oasis.coordinate);
  const y = terrainHeightAtMap(battlefield.map, position) + 0.075;
  const auraRadius = BATTLEFIELD_HEX_CIRCUMRADIUS * 2.65;
  return (
    <group name="central-healing-oasis" position={[position.x, y, position.z]}>
      <primitive object={water} position={[0, 0.22, 0]} />
      {palms.map((palm, index) => {
        const pose = PALM_POSES[index]!;
        return (
          <primitive
            key={OASIS_SCENE_ASSETS.palms[index]!.url}
            object={palm}
            position={[pose.x, 0.14, pose.z]}
            rotation={[0, pose.rotation, 0]}
          />
        );
      })}
      <group ref={aura}>
        <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={72}>
          <ringGeometry args={[auraRadius - 0.08, auraRadius, 48]} />
          <meshBasicMaterial
            color="#70f0a1"
            transparent
            opacity={0.38}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={motes}>
        {Array.from({ length: 7 }, (_, index) => {
          const angle = index / 7 * Math.PI * 2;
          return (
            <mesh
              key={index}
              position={[Math.cos(angle) * 0.82, 0.25, Math.sin(angle) * 0.82]}
            >
              <sphereGeometry args={[0.045, 8, 8]} />
              <meshBasicMaterial
                color="#8bffad"
                transparent
                opacity={0.75}
                depthWrite={false}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function preparePalmModel(source: Object3D, targetHeight: number): Object3D {
  const model = cloneSkeleton(source);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material instanceof MeshStandardMaterial) {
      object.material = object.material.clone();
    }
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
