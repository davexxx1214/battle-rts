import { isBuildingDeployable, type DeployableKind } from "../../game/rules";
import type { UnitRole } from "../../game/types";
import { UNIT_BASE_RING_GEOMETRY } from "../assets";

export interface UnitRingGeometry {
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly segments: number;
}

const BUILDING_PLACEMENT_RING = {
  innerRadius: 0.9,
  outerRadius: 1.07,
  segments: 6,
} as const satisfies UnitRingGeometry;

const MAGE_PLACEMENT_RING = {
  innerRadius: 0.38,
  outerRadius: 0.5,
  segments: 18,
} as const satisfies UnitRingGeometry;

export function unitBaseRingGeometry(role: UnitRole): UnitRingGeometry {
  if (role === "bone-dragon") return UNIT_BASE_RING_GEOMETRY.boneDragon;
  return role === "knight" || role === "spearman" || role === "ranger" || role === "catapult"
    ? UNIT_BASE_RING_GEOMETRY.catapult
    : UNIT_BASE_RING_GEOMETRY.character;
}

export function deploymentPreviewRingGeometry(kind: DeployableKind): UnitRingGeometry {
  if (isBuildingDeployable(kind)) return BUILDING_PLACEMENT_RING;
  return kind === "spearman" || kind === "swordsman" || kind === "archer" || kind === "catapult"
    ? UNIT_BASE_RING_GEOMETRY.catapult
    : MAGE_PLACEMENT_RING;
}
