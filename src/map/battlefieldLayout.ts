export type TerrainSurface = "grass" | "water" | "bridge" | "forest" | "camp" | "rock";

export interface BattlefieldLayoutCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface BattlefieldBridgeLayout {
  readonly id: "west" | "east";
  readonly center: BattlefieldLayoutCoordinate;
  readonly cells: readonly BattlefieldLayoutCoordinate[];
  readonly approaches: {
    readonly verdant: BattlefieldLayoutCoordinate;
    readonly crimson: BattlefieldLayoutCoordinate;
  };
}

export const BATTLEFIELD_RADIUS = 9;
export const BATTLEFIELD_COMBAT_HALF_WIDTH = 6;
export const BATTLEFIELD_BRIDGE_LAYOUTS = [
  createBridgeLayout("west", -2),
  createBridgeLayout("east", 2),
] as const satisfies readonly BattlefieldBridgeLayout[];

export function battlefieldReservedPathAt(q: number, r: number): boolean {
  const worldX = 2 * q + r;
  if (Math.abs(r) <= 1) return isBridgeCell(q, r);
  if (Math.abs(r) <= 3) return battlefieldCombatZoneAt(q, r);
  return Math.abs(worldX) <= 2;
}

export function battlefieldCombatZoneAt(q: number, r: number): boolean {
  return Math.abs(2 * q + r) <= BATTLEFIELD_COMBAT_HALF_WIDTH;
}

export function battlefieldOuterFlankAt(q: number, r: number): boolean {
  return Math.abs(r) >= 2 && !battlefieldCombatZoneAt(q, r);
}

export function battlefieldStaticObstacleAt(q: number, r: number): boolean {
  const campPropCell = q === 0 && Math.abs(r) === 6;
  return battlefieldOuterFlankAt(q, r) || campPropCell;
}

export function battlefieldSurfaceAt(q: number, r: number): TerrainSurface {
  const distance = axialDistanceFromCenter(q, r);
  const isRiver = Math.abs(r) <= 1;
  const isBridge = isRiver && isBridgeCell(q, r);
  const isCamp = Math.abs(r) >= 6 && Math.abs(2 * q + r) <= 4;
  const isForest = distance >= 6
    && Math.abs(q) >= 4
    && !battlefieldReservedPathAt(q, r)
    && positiveModulo(q * 11 + r * 7, 5) <= 1;
  const isRock = distance >= 7
    && !isCamp
    && !battlefieldReservedPathAt(q, r)
    && positiveModulo(q * 5 - r * 13, 11) === 0;

  if (isBridge) return "bridge";
  if (isRiver) return "water";
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

function createBridgeLayout(id: BattlefieldBridgeLayout["id"], q: number) {
  const innerQ = id === "west" ? q + 1 : q - 1;
  const innerRows = id === "west" ? [-1, 0, 1] : [1, 0, -1];
  return {
    id,
    center: { q, r: 0 },
    cells: [
      ...[-1, 0, 1].map((r) => ({ q, r })),
      ...innerRows.map((r) => ({ q: innerQ, r })),
    ],
    approaches: {
      verdant: { q, r: 2 },
      crimson: { q, r: -2 },
    },
  } as const;
}

function isBridgeCell(q: number, r: number): boolean {
  return BATTLEFIELD_BRIDGE_LAYOUTS.some((bridge) => (
    bridge.cells.some((coordinate) => coordinate.q === q && coordinate.r === r)
  ));
}
