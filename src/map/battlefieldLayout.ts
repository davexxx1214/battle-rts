export type TerrainSurface = "grass" | "water" | "bridge" | "forest" | "camp" | "rock";

export const BATTLEFIELD_RADIUS = 9;

export function battlefieldSurfaceAt(q: number, r: number): TerrainSurface {
  const distance = axialDistanceFromCenter(q, r);
  const isWater = Math.abs(r) <= 1 && Math.abs(q) >= 3 && Math.abs(q) <= 7;
  const isBridge = Math.abs(r) <= 1 && Math.abs(q) <= 2;
  const isCamp = Math.abs(r) >= 6 && Math.abs(2 * q + r) <= 4;
  const isForest = distance >= 6
    && Math.abs(q) >= 4
    && positiveModulo(q * 11 + r * 7, 5) <= 1;
  const isRock = distance >= 7
    && !isCamp
    && positiveModulo(q * 5 - r * 13, 11) === 0;

  if (isWater) return "water";
  if (isBridge) return "bridge";
  if (isCamp) return "camp";
  if (isForest) return "forest";
  if (isRock) return "rock";
  return "grass";
}

export function battlefieldCoordinates(
  radius = BATTLEFIELD_RADIUS,
): readonly (readonly [q: number, r: number])[] {
  const coordinates: [number, number][] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      coordinates.push([q, r]);
    }
  }
  return coordinates;
}

function axialDistanceFromCenter(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
