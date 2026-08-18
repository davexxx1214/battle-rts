import type { WorldPoint } from "../game/types";
import { terrainHeightAt } from "../map/battlefield";

const SUPPORT_SAMPLES = [
  { side: 0, forward: 0 },
  { side: 0, forward: 1.25 },
  { side: 0, forward: -1.25 },
  { side: 0.72, forward: 0 },
  { side: -0.72, forward: 0 },
  { side: 0.62, forward: 0.92 },
  { side: -0.62, forward: 0.92 },
  { side: 0.62, forward: -0.92 },
  { side: -0.62, forward: -0.92 },
] as const;

export function boneDragonTerrainSupportHeight(
  position: WorldPoint,
  facing: number,
): number {
  const forwardX = Math.sin(facing);
  const forwardZ = Math.cos(facing);
  const sideX = Math.cos(facing);
  const sideZ = -Math.sin(facing);
  return Math.max(...SUPPORT_SAMPLES.map((sample) => terrainHeightAt({
    x: position.x + sideX * sample.side + forwardX * sample.forward,
    z: position.z + sideZ * sample.side + forwardZ * sample.forward,
  })));
}
