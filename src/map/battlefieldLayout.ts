export type TerrainSurface = "grass" | "water" | "bridge" | "forest" | "camp" | "rock";

export interface BattlefieldLayoutCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface BattlefieldBridgeLayout {
  readonly id: "west" | "east";
  readonly center: BattlefieldLayoutCoordinate;
  readonly cells: readonly BattlefieldLayoutCoordinate[];
  readonly landings: {
    readonly verdant: readonly [BattlefieldLayoutCoordinate, BattlefieldLayoutCoordinate];
    readonly crimson: readonly [BattlefieldLayoutCoordinate, BattlefieldLayoutCoordinate];
  };
}

export const BATTLEFIELD_RADIUS = 9;
export const BATTLEFIELD_COMBAT_HALF_WIDTH = 6;
export const BATTLEFIELD_CASTLE_ROCK_COORDINATES = [
  { q: -6, r: 9 },
  { q: -2, r: 9 },
  { q: 6, r: -9 },
  { q: 2, r: -9 },
] as const satisfies readonly BattlefieldLayoutCoordinate[];
export const BATTLEFIELD_CASTLE_FOREST_COORDINATES = [
  { q: -5, r: 4 },
  { q: -5, r: 5 },
  { q: -5, r: 6 },
  { q: -5, r: 7 },
  { q: -6, r: 8 },
  { q: 5, r: -4 },
  { q: 5, r: -5 },
  { q: 5, r: -6 },
  { q: 5, r: -7 },
  { q: 6, r: -8 },
] as const satisfies readonly BattlefieldLayoutCoordinate[];

const BATTLEFIELD_CASTLE_ROCK_KEYS = new Set(
  BATTLEFIELD_CASTLE_ROCK_COORDINATES.map(({ q, r }) => `${q},${r}`),
);
const BATTLEFIELD_CASTLE_FOREST_KEYS = new Set(
  BATTLEFIELD_CASTLE_FOREST_COORDINATES.map(({ q, r }) => `${q},${r}`),
);
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
  return battlefieldOuterFlankAt(q, r) || campPropCell || battlefieldCastleRockAt(q, r);
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

  if (battlefieldCastleForestAt(q, r)) return "forest";
  if (battlefieldCastleRockAt(q, r)) return "grass";
  if (isBridge) return "bridge";
  if (isRiver) return "water";
  if (isCamp) return "camp";
  if (isForest) return "forest";
  if (isRock) return "rock";
  return "grass";
}

export function battlefieldCastleRockAt(q: number, r: number): boolean {
  return BATTLEFIELD_CASTLE_ROCK_KEYS.has(`${q},${r}`);
}

export function battlefieldCastleForestAt(q: number, r: number): boolean {
  return BATTLEFIELD_CASTLE_FOREST_KEYS.has(`${q},${r}`);
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
  const rows = id === "west" ? [-1, 0, 1] : [1, 0, -1];
  return {
    id,
    center: { q, r: 0 },
    cells: [
      ...rows.map((r) => ({ q, r })),
      ...rows.map((r) => ({ q: innerQ, r })),
    ],
    landings: {
      verdant: [{ q, r: 2 }, { q: innerQ, r: 2 }],
      crimson: [{ q, r: -2 }, { q: innerQ, r: -2 }],
    },
  } as const;
}

function isBridgeCell(q: number, r: number): boolean {
  return BATTLEFIELD_BRIDGE_LAYOUTS.some((bridge) => (
    bridge.cells.some((coordinate) => coordinate.q === q && coordinate.r === r)
  ));
}
