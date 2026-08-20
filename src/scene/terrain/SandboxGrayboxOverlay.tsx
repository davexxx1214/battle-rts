import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, InstancedMesh, Object3D } from "three";

import {
  SANDBOX_GRAYBOX_COLORS,
  type SandboxGrayboxCellPresentation,
  type SandboxGrayboxPresentation,
} from "./sandboxGrayboxPresentation";

export const SandboxGrayboxOverlay = memo(function SandboxGrayboxOverlay({
  plan,
}: {
  readonly plan: SandboxGrayboxPresentation;
}) {
  const entrances = useMemo(
    () => plan.minePits.flatMap((pit) => pit.entrances),
    [plan.minePits],
  );
  const mineMarkers = useMemo(
    () => plan.minePits.map((pit) => pit.marker),
    [plan.minePits],
  );
  return (
    <group name="sandbox-graybox-overlay">
      <HexInstances
        markers={plan.terrainCells}
        color={plan.terrainColor}
        radius={1.13}
        thickness={0.16}
      />
      {plan.routes.map((route, index) => (
        <HexInstances
          key={route.id}
          markers={route.cells}
          color={route.color}
          radius={1.04}
          thickness={0.026}
          topOffset={0.018 + index * 0.003}
          opacity={0.9}
          unlit
        />
      ))}
      {plan.buildZones.map((zone) => (
        <HexInstances
          key={zone.faction}
          markers={zone.anchors}
          color={zone.color}
          radius={0.89}
          thickness={0.018}
          topOffset={0.052}
          opacity={0.38}
          unlit
        />
      ))}
      <HexInstances
        markers={mineMarkers}
        color={SANDBOX_GRAYBOX_COLORS.minePit}
        radius={0.8}
        thickness={0.08}
        topOffset={0.075}
        unlit
      />
      <HexInstances
        markers={mineMarkers}
        color="#4b3922"
        radius={0.55}
        thickness={0.04}
        topOffset={0.12}
        unlit
      />
      <HexInstances
        markers={entrances}
        color={SANDBOX_GRAYBOX_COLORS.mineEntrance}
        radius={0.24}
        thickness={0.035}
        topOffset={0.1}
        unlit
      />
      {plan.minePits.map((pit) => (
        <MinePitLabel
          key={pit.id}
          label={pit.label}
          marker={pit.marker}
        />
      ))}
    </group>
  );
});

function HexInstances({
  markers,
  color,
  radius,
  thickness,
  topOffset = 0,
  opacity = 1,
  unlit = false,
}: {
  readonly markers: readonly SandboxGrayboxCellPresentation[];
  readonly color: string;
  readonly radius: number;
  readonly thickness: number;
  readonly topOffset?: number;
  readonly opacity?: number;
  readonly unlit?: boolean;
}) {
  const instances = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = instances.current;
    if (!mesh) return;
    const transform = new Object3D();
    markers.forEach((marker, index) => {
      transform.position.set(
        marker.position.x,
        marker.height + topOffset - thickness / 2,
        marker.position.z,
      );
      transform.rotation.set(0, Math.PI / 6, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [markers, thickness, topOffset]);
  return (
    <instancedMesh
      ref={instances}
      args={[undefined, undefined, markers.length]}
      frustumCulled={false}
      receiveShadow={!unlit}
    >
      <cylinderGeometry args={[radius, radius, thickness, 6]} />
      {unlit
        ? <meshBasicMaterial
            color={color}
            transparent={opacity < 1}
            opacity={opacity}
            depthWrite={opacity >= 1}
          />
        : <meshStandardMaterial color={color} roughness={1} metalness={0} />}
    </instancedMesh>
  );
}

function MinePitLabel({
  label,
  marker,
}: {
  readonly label: string;
  readonly marker: SandboxGrayboxCellPresentation;
}) {
  const texture = useMemo(() => createMinePitLabelTexture(label), [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      position={[marker.position.x, marker.height + 0.72, marker.position.z]}
      scale={[1.7, 0.72, 1]}
      renderOrder={20}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

function createMinePitLabelTexture(label: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 108;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(35, 28, 19, 0.88)";
    context.fillRect(8, 12, 240, 84);
    context.strokeStyle = SANDBOX_GRAYBOX_COLORS.minePit;
    context.lineWidth = 7;
    context.strokeRect(8, 12, 240, 84);
    context.fillStyle = "#fff8dc";
    context.font = "700 48px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 128, 55, 220);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
