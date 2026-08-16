import { useLayoutEffect, useMemo, useRef } from "react";
import {
  CircleGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
} from "three";

import {
  axialToWorld,
  terrainHeightAt,
  type HexCoordinate,
} from "../map/battlefield";

export function DeploymentAreaMask({
  coordinates,
}: {
  readonly coordinates: readonly HexCoordinate[];
}) {
  const instances = useRef<InstancedMesh>(null);
  const edges = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const tile = new CircleGeometry(0.94, 6);
    tile.rotateZ(Math.PI / 6);
    tile.rotateX(-Math.PI / 2);
    return tile;
  }, []);
  const material = useMemo(() => new MeshBasicMaterial({
    color: new Color("#39d997"),
    transparent: true,
    opacity: 0.24,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);
  const edgeGeometry = useMemo(() => {
    const edge = new RingGeometry(0.86, 0.95, 6);
    edge.rotateZ(Math.PI / 6);
    edge.rotateX(-Math.PI / 2);
    return edge;
  }, []);
  const edgeMaterial = useMemo(() => new MeshBasicMaterial({
    color: new Color("#8ff5c2"),
    transparent: true,
    opacity: 0.3,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  }), []);

  useLayoutEffect(() => {
    const mesh = instances.current;
    const edgeMesh = edges.current;
    if (!mesh || !edgeMesh) return;
    const transform = new Object3D();
    coordinates.forEach((coordinate, index) => {
      const world = axialToWorld(coordinate);
      transform.position.set(
        world.x,
        terrainHeightAt(world) + 0.065,
        world.z,
      );
      transform.rotation.set(0, 0, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      edgeMesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    edgeMesh.instanceMatrix.needsUpdate = true;
  }, [coordinates]);

  if (coordinates.length === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={instances}
        args={[geometry, material, coordinates.length]}
        frustumCulled={false}
        renderOrder={35}
      />
      <instancedMesh
        ref={edges}
        args={[edgeGeometry, edgeMaterial, coordinates.length]}
        frustumCulled={false}
        renderOrder={36}
      />
    </group>
  );
}
