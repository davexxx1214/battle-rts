import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, InstancedMesh, Object3D } from "three";

import { BATTLEFIELD_HEX_CIRCUMRADIUS } from "../../map/battlefield";
import type { SandboxMiningState } from "../../game/miningEconomy";
import {
  SANDBOX_GRAYBOX_COLORS,
  SANDBOX_GRAYBOX_HEX_ROTATION_Y,
  createSandboxMineControlPresentation,
  type SandboxGrayboxCellPresentation,
  type SandboxGrayboxPresentation,
  type SandboxMineControlPresentation,
} from "./sandboxGrayboxPresentation";

const MINE_CONTROL_COLORS = Object.freeze({
  neutral: "#f7f4ea",
  verdant: "#4294f4",
  crimson: "#e34f59",
});

export const SandboxGrayboxOverlay = memo(function SandboxGrayboxOverlay({
  mining,
  plan,
  markersOnly = false,
}: {
  readonly mining: SandboxMiningState | null;
  readonly plan: SandboxGrayboxPresentation;
  readonly markersOnly?: boolean;
}) {
  const entrances = useMemo(
    () => plan.minePits.flatMap((pit) => pit.entrances),
    [plan.minePits],
  );
  const mineMarkers = useMemo(
    () => plan.minePits.map((pit) => pit.marker),
    [plan.minePits],
  );
  const mineControls = useMemo(
    () => createSandboxMineControlPresentation(plan, mining),
    [mining, plan],
  );
  return (
    <group name="sandbox-graybox-overlay">
      {!markersOnly && (
        <>
          <mesh
            receiveShadow
            position={[
              plan.boundary.underlay.center.x,
              plan.boundary.underlay.y,
              plan.boundary.underlay.center.z,
            ]}
          >
            <cylinderGeometry args={[
              plan.boundary.underlay.topRadius,
              plan.boundary.underlay.bottomRadius,
              plan.boundary.underlay.height,
              54,
            ]} />
            <meshStandardMaterial
              color={SANDBOX_GRAYBOX_COLORS.water}
              roughness={0.62}
              metalness={0.04}
            />
          </mesh>
          <HexInstances
            markers={plan.boundary.waterCells}
            color={SANDBOX_GRAYBOX_COLORS.water}
            radius={BATTLEFIELD_HEX_CIRCUMRADIUS}
            thickness={0.16}
          />
          <HexInstances
            markers={plan.terrainCells}
            color={plan.terrainColor}
            radius={BATTLEFIELD_HEX_CIRCUMRADIUS}
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
        </>
      )}
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
      {mineControls.map((mine) => (
        <MineControlPiece key={mine.id} mine={mine} />
      ))}
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

function MineControlPiece({
  mine,
}: {
  readonly mine: SandboxMineControlPresentation;
}) {
  const color = mine.controller === null
    ? MINE_CONTROL_COLORS.neutral
    : MINE_CONTROL_COLORS[mine.controller];
  return (
    <group
      name={`sandbox-mine-control-${mine.id}`}
      position={[mine.marker.position.x, mine.marker.height + 0.18, mine.marker.position.z]}
      userData={{ controller: mine.controller ?? "neutral", minePitId: mine.id }}
    >
      <mesh position={[0, 0.06, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.34, 0.4, 0.12, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.16, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.25, 0.31, 0.09, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.38, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.14, 0.25, 0.36, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.58, 0]} renderOrder={21}>
        <cylinderGeometry args={[0.2, 0.17, 0.08, 18]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.78, 0]} renderOrder={21}>
        <sphereGeometry args={[0.18, 18, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

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
      transform.rotation.set(0, SANDBOX_GRAYBOX_HEX_ROTATION_Y, 0);
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
      position={[marker.position.x, marker.height + 1.28, marker.position.z]}
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
