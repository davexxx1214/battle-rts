import type { BattlefieldCameraPreset } from "../../map/battlefieldDefinition";
import type { WorldPoint } from "../../game/types";

const FULL_TURN = Math.PI * 2;

/**
 * Mirrors a player-side camera preset through the battlefield center.
 * This is intentionally definition-only: the scene does not infer faction
 * geometry from coordinate signs.
 */
export function mirrorBattlefieldCameraPreset(
  preset: BattlefieldCameraPreset,
  battlefieldCenter: WorldPoint,
): BattlefieldCameraPreset {
  const [x, y, z] = preset.initialPosition;
  return Object.freeze({
    ...preset,
    initialPosition: Object.freeze([
      mirrorAxis(x, battlefieldCenter.x),
      y,
      mirrorAxis(z, battlefieldCenter.z),
    ] as const),
    initialTarget: Object.freeze({
      x: mirrorAxis(preset.initialTarget.x, battlefieldCenter.x),
      z: mirrorAxis(preset.initialTarget.z, battlefieldCenter.z),
    }),
    desktopYaw: normalizeYaw(preset.desktopYaw + Math.PI),
    portraitYaw: normalizeYaw(preset.portraitYaw + Math.PI),
  });
}

function mirrorAxis(value: number, center: number): number {
  return center * 2 - value;
}

function normalizeYaw(yaw: number): number {
  const normalized = ((yaw + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
  return Object.is(normalized, -0) ? 0 : normalized;
}
