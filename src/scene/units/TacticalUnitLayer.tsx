import { useFrame, useThree } from "@react-three/fiber";
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  OrthographicCamera,
} from "three";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { BattleState, BattleUnit } from "../../game/battle";
import type { UnitRole } from "../../game/types";
import { terrainHeightAtMap } from "../../map/battlefield";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

export const TACTICAL_UNIT_LOD_MINIMUM_ENTITIES = 100;
export const TACTICAL_UNIT_LOD_MAXIMUM_ZOOM = 40;

const TACTICAL_ROLES: readonly UnitRole[] = [
  "spearman",
  "knight",
  "ranger",
  "mage",
  "catapult",
  "bone-dragon",
];

export function shouldUseTacticalUnitLod(
  modeId: BattleState["modeId"],
  entityCount: number,
  cameraZoom: number,
): boolean {
  return modeId === "sandbox"
    && entityCount >= TACTICAL_UNIT_LOD_MINIMUM_ENTITIES
    && cameraZoom <= TACTICAL_UNIT_LOD_MAXIMUM_ZOOM;
}

export function TacticalUnitLayer({
  battle,
  selectedSquadIds,
  children,
}: {
  readonly battle: BattleState;
  readonly selectedSquadIds: ReadonlySet<string>;
  readonly children: ReactNode;
}) {
  const { camera } = useThree();
  const initialZoom = camera instanceof OrthographicCamera ? camera.zoom : 1;
  const [tactical, setTactical] = useState(() => shouldUseTacticalUnitLod(
    battle.modeId,
    battle.units.length,
    initialZoom,
  ));
  const tacticalRef = useRef(tactical);
  useFrame(() => {
    const zoom = camera instanceof OrthographicCamera ? camera.zoom : 1;
    const next = shouldUseTacticalUnitLod(battle.modeId, battle.units.length, zoom);
    if (next === tacticalRef.current) return;
    tacticalRef.current = next;
    setTactical(next);
  });

  if (!tactical) return children;
  return TACTICAL_ROLES.map((role) => (
    <TacticalRoleInstances
      battle={battle}
      key={role}
      role={role}
      selectedSquadIds={selectedSquadIds}
    />
  ));
}

function TacticalRoleInstances({
  battle,
  role,
  selectedSquadIds,
}: {
  readonly battle: BattleState;
  readonly role: UnitRole;
  readonly selectedSquadIds: ReadonlySet<string>;
}) {
  const { map } = useBattlefieldDefinition();
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const colors = useMemo(() => ({
    verdant: new Color("#4fb8ff"),
    crimson: new Color("#f05b58"),
    selected: new Color("#ffe175"),
  }), []);
  const units = battle.units.filter((unit) => (
    unit.role === role && unit.health > 0 && unit.status !== "dead"
  ));

  useEffect(() => {
    mesh.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, []);
  useFrame(() => {
    if (!mesh.current) return;
    units.forEach((unit, index) => {
      applyTacticalTransform(dummy, unit, terrainHeightAtMap(map, unit.position));
      mesh.current!.setMatrixAt(index, dummy.matrix);
      mesh.current!.setColorAt(
        index,
        selectedSquadIds.has(unit.squadId) ? colors.selected : colors[unit.faction],
      );
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });

  if (units.length === 0) return null;
  return (
    <instancedMesh
      args={[undefined, undefined, units.length]}
      frustumCulled={false}
      ref={mesh}
    >
      <TacticalRoleGeometry role={role} />
      <meshStandardMaterial roughness={0.72} metalness={0.08} vertexColors />
    </instancedMesh>
  );
}

function TacticalRoleGeometry({ role }: { readonly role: UnitRole }) {
  if (role === "catapult" || role === "bone-dragon") {
    return <boxGeometry args={[0.52, 0.34, 0.7]} />;
  }
  if (role === "ranger" || role === "mage") {
    return <cylinderGeometry args={[0.16, 0.23, 0.62, role === "mage" ? 8 : 6]} />;
  }
  return <coneGeometry args={[0.23, 0.68, role === "knight" ? 6 : 5]} />;
}

function applyTacticalTransform(
  dummy: Object3D,
  unit: BattleUnit,
  terrainHeight: number,
): void {
  const heavy = unit.role === "catapult" || unit.role === "bone-dragon";
  dummy.position.set(unit.position.x, terrainHeight + (heavy ? 0.22 : 0.34), unit.position.z);
  dummy.rotation.set(0, unit.facing, 0);
  dummy.scale.setScalar(unit.role === "bone-dragon" ? 1.35 : unit.role === "catapult" ? 1.15 : 1);
  dummy.updateMatrix();
}
